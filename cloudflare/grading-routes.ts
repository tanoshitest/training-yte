/**
 * API chấm phiếu bài tập bằng AI (OpenAI):
 *   - Cấu hình: tải danh sách model mới, kiểm tra kết nối (chỉ ADMIN).
 *   - Bài kiểm tra theo lớp + buổi; file đề; đáp án do AI sinh từ đề và giáo viên sửa được.
 *   - Bài làm của học viên: tải từng ảnh lên, chấm từng bài (client gọi lần lượt để thấy tiến độ).
 * Lưu qua KV (`grading-*`) nên không đổi schema DB. Ảnh/đề lưu base64 trong khóa riêng để danh sách nhẹ.
 */
import { decryptSecret } from "./crypto-secrets";
import { zipStore } from "./zip-store";
import { buildGradingReportPdf, gradingReportDownloadName } from "./grading-report-pdf";
import { normalizeAiSettings, type IntegrationSettings } from "./integration-settings";
import {
  base64ToBytes, bytesToBase64, generateAnswerKey, gradeSubmission, matchStudentByName, normalizeAnswerKey, recomputeScore,
  type AnswerKey, type SubmissionResult,
} from "./grading-engine";
import type { RosterStudent } from "./grading-engine";
import { createOpenAiClient, OpenAiError, pickRecentGradingModels, type OpenAiClient } from "./openai-client";

type Role = "ADMIN" | "TEACHER" | "STUDENT" | "ACCOUNTANT" | "ASSISTANT";

export interface GradingEnv {
  STEPS_LMS_DATA: {
    get<T>(key: string, type: "json"): Promise<T | null>;
    put(key: string, value: string): Promise<void>;
    compareAndPut?(key: string, expected: string, value: string): Promise<boolean>;
  };
  AUTH_SECRET: string;
  /** Chỉ đặt khi chạy thử với máy chủ OpenAI giả. */
  OPENAI_BASE_URL?: string;
}

export interface GradingRouteHelpers {
  json(data: unknown, status?: number): Response;
  /** Cho phép test thay `fetch` gọi OpenAI. */
  fetchImpl?: typeof fetch;
  /** Đọc file tĩnh của ứng dụng (font, logo) để dựng PDF; null nếu không có. */
  loadAsset?: (path: string) => Promise<ArrayBuffer | null>;
}

export type SubmissionStatus = "UPLOADED" | "GRADING" | "GRADED" | "ERROR";

export interface GradingTestDoc {
  id: string;
  name: string;
  classId: string;
  sessionId: string;
  createdAt: string;
  createdBy: string;
  exam?: { fileId: string; name: string; mime: string; size: number; uploadedAt: string };
  answerKey?: AnswerKey;
  submissionIds: string[];
}

/** Một ảnh (trang) của bài làm; bài làm viết trên nhiều tờ thì có nhiều trang theo thứ tự. */
export interface GradingSubmissionPage { fileId: string; mime: string; name: string }

export interface GradingSubmissionDoc {
  id: string;
  testId: string;
  /** Tên hiển thị: tên file ảnh trang 1. */
  name: string;
  pages: GradingSubmissionPage[];
  uploadedAt: string;
  status: SubmissionStatus;
  studentId: string | null;
  /** Tên thư mục con chứa ảnh (mỗi học sinh một thư mục); dùng để gán học viên. */
  folderName?: string;
  /** AI = khớp theo tên viết tay, FOLDER = theo tên thư mục, MANUAL = giáo viên chọn tay. */
  matchSource?: "AI" | "FOLDER" | "MANUAL";
  error?: string;
  result?: SubmissionResult;
}

interface StoredFile { name: string; mime: string; base64: string; /** Bài kiểm tra chứa file, để kiểm quyền khi tải về. */ testId?: string }

type GradingSession = { role: Role; email: string; teacherId?: string };

const INDEX_KEY = "grading-tests:steps-demo";
// Chấm điểm Phiếu: mọi nhân sự (anh Mori 18/11/2026) — giáo viên vẫn chỉ thấy lớp mình phụ trách.
const GRADING_ROLES: Role[] = ["ADMIN", "TEACHER", "ASSISTANT", "ACCOUNTANT"];
const MAX_EXAM_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PAGES_PER_SUBMISSION = 12;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const testKey = (id: string) => `grading-test:${id}`;
const submissionKey = (testId: string, id: string) => `grading-sub:${testId}:${id}`;
const fileKey = (id: string) => `grading-file:${id}`;

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try { return (await request.json()) as T; } catch { return null; }
}

/** Đọc–sửa–ghi có kiểm tra xung đột (compare-and-swap) khi kho hỗ trợ. */
async function casUpdate<T>(env: GradingEnv, key: string, fallback: T, change: (current: T) => T): Promise<T> {
  const kv = env.STEPS_LMS_DATA;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const stored = await kv.get<T>(key, "json");
    const next = change(structuredClone(stored ?? fallback));
    const value = JSON.stringify(next);
    if (!kv.compareAndPut) { await kv.put(key, value); return next; }
    if (await kv.compareAndPut(key, JSON.stringify(stored ?? null), value)) return next;
  }
  throw new Error("Dữ liệu vừa đổi ở nơi khác, thử lại giúp em.");
}

async function readAiConfig(env: GradingEnv) {
  const stored = await env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json");
  const ai = normalizeAiSettings(stored?.ai);
  const apiKey = ai.apiKeyEncrypted ? await decryptSecret(ai.apiKeyEncrypted, env.AUTH_SECRET) : "";
  return { enabled: ai.enabled, model: ai.model, apiKey };
}

function clientFor(env: GradingEnv, apiKey: string, helpers: GradingRouteHelpers): OpenAiClient {
  return createOpenAiClient({ apiKey, baseUrl: env.OPENAI_BASE_URL, fetchImpl: helpers.fetchImpl });
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof OpenAiError) return error.message;
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return fallback;
}

async function readTest(env: GradingEnv, id: string): Promise<GradingTestDoc | null> {
  return env.STEPS_LMS_DATA.get<GradingTestDoc>(testKey(id), "json");
}

async function readSubmissions(env: GradingEnv, test: GradingTestDoc): Promise<GradingSubmissionDoc[]> {
  const rows = await Promise.all(test.submissionIds.map((id) => env.STEPS_LMS_DATA.get<GradingSubmissionDoc>(submissionKey(test.id, id), "json")));
  return rows.filter((row): row is GradingSubmissionDoc => Boolean(row));
}

interface ReportContext {
  fonts: { regular: ArrayBuffer; medium: ArrayBuffer };
  logo?: Uint8Array;
  roster: RosterStudent[];
  className: string;
}

async function loadReportContext(env: GradingEnv, helpers: GradingRouteHelpers, test: GradingTestDoc): Promise<ReportContext | null> {
  const [regular, medium, logo] = await Promise.all([
    helpers.loadAsset?.("/fonts/Roboto-Regular.ttf"), helpers.loadAsset?.("/fonts/Roboto-Medium.ttf"), helpers.loadAsset?.("/steps-wordmark.png"),
  ]);
  if (!regular || !medium) return null;
  const classes = await env.STEPS_LMS_DATA.get<{ id: string; name?: string }[]>("classes:steps-demo", "json");
  return {
    fonts: { regular, medium },
    logo: logo ? new Uint8Array(logo) : undefined,
    roster: (await classRoster(env, test.classId)) ?? [],
    className: (classes ?? []).find((row) => row.id === test.classId)?.name ?? "",
  };
}

/** Dựng phiếu kết quả PDF của một bài đã chấm; điểm và các câu sai lấy từ kết quả đã lưu (kể cả phần giáo viên sửa tay). */
async function renderReport(context: ReportContext, test: GradingTestDoc, submission: GradingSubmissionDoc): Promise<{ bytes: Uint8Array; filename: string }> {
  const result = submission.result!;
  const studentName = context.roster.find((student) => student.id === submission.studentId)?.fullName || result.detectedName || "Học viên";
  const expectedOf = new Map((test.answerKey?.questions ?? []).map((question) => [question.number, question.acceptedAnswers[0] ?? ""]));
  const bytes = await buildGradingReportPdf(context.fonts, {
    studentName,
    className: context.className,
    testName: test.name,
    dateLabel: new Date(result.gradedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    earned: result.earned, total: result.total, feedback: result.feedback,
    wrong: result.answers.filter((item) => !item.correct).map((item) => ({
      number: item.number, studentAnswer: item.studentAnswer,
      correction: item.correction || expectedOf.get(item.number) || "", comment: item.comment,
    })),
    logoPng: context.logo,
  });
  return { bytes, filename: gradingReportDownloadName(studentName, test.name) };
}

function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}

async function readStoredFile(env: GradingEnv, id: string): Promise<StoredFile | null> {
  return env.STEPS_LMS_DATA.get<StoredFile>(fileKey(id), "json");
}

/** Chấm điểm Phiếu: mọi nhân sự (kể cả giáo viên / trợ giảng chưa được gán lớp) làm việc với lớp bất kỳ
 *  (anh Mori 18/11/2026). Quyền vào API đã giới hạn ở GRADING_ROLES. */
async function canAccessClass(_env: GradingEnv, _session: GradingSession, _classId: string): Promise<boolean> {
  return true;
}

async function classRoster(env: GradingEnv, classId: string) {
  const [classes, students] = await Promise.all([
    env.STEPS_LMS_DATA.get<{ id: string; studentIds?: string[] }[]>("classes:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<{ id: string; fullName: string }[]>("students:steps-demo", "json"),
  ]);
  const cls = (classes ?? []).find((row) => row.id === classId);
  if (!cls) return null;
  const ids = new Set(cls.studentIds ?? []);
  return (students ?? []).filter((student) => ids.has(student.id)).map((student) => ({ id: student.id, fullName: student.fullName }));
}

function summarize(test: GradingTestDoc, submissions: GradingSubmissionDoc[]) {
  return {
    id: test.id, name: test.name, classId: test.classId, sessionId: test.sessionId, createdAt: test.createdAt,
    hasExam: Boolean(test.exam), hasAnswerKey: Boolean(test.answerKey),
    submissionCount: submissions.length,
    gradedCount: submissions.filter((row) => row.status === "GRADED").length,
  };
}

async function detail(env: GradingEnv, test: GradingTestDoc) {
  const submissions = await readSubmissions(env, test);
  return { test, submissions, summary: summarize(test, submissions) };
}

function mimeOf(request: Request) {
  return (request.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
}

function decodeHeader(request: Request, name: string): string {
  try { return decodeURIComponent(request.headers.get(name) || "").trim(); } catch { return ""; }
}

function uploadedName(request: Request, fallback: string) {
  return decodeHeader(request, "x-file-name").replace(/[\\/]+/g, "_").slice(0, 200) || fallback;
}

/** Đọc ảnh trong thân request, kiểm tra loại/cỡ rồi lưu thành file; trả trang hoặc Response lỗi. */
async function storeImagePage(env: GradingEnv, request: Request, testId: string): Promise<GradingSubmissionPage | Response> {
  const fail = (error: string, status: number) => Response.json({ error }, { status });
  const mime = mimeOf(request);
  if (!IMAGE_MIMES.has(mime)) return fail("Bài làm phải là ảnh JPG, PNG hoặc WebP.", 415);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return fail("Ảnh rỗng.", 400);
  if (bytes.length > MAX_IMAGE_BYTES) return fail("Ảnh quá lớn (tối đa 8MB).", 413);
  const name = uploadedName(request, "bai-lam");
  const fileId = newId("gfile");
  await env.STEPS_LMS_DATA.put(fileKey(fileId), JSON.stringify({ name, mime, base64: bytesToBase64(bytes), testId } satisfies StoredFile));
  return { fileId, mime, name };
}

export async function handleGradingApi(
  request: Request,
  url: URL,
  env: GradingEnv,
  session: GradingSession,
  helpers: GradingRouteHelpers,
): Promise<Response | null> {
  const { json } = helpers;
  const path = url.pathname;
  const kv = env.STEPS_LMS_DATA;

  // ----- Cấu hình AI (ADMIN) -----
  if (path === "/api/integrations/ai-models" || path === "/api/integrations/ai-ping") {
    if (request.method !== "POST") return null;
    if (session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
    const ai = await readAiConfig(env);
    // Key vừa gõ trong form (chưa bấm Lưu) được dùng trước key đã lưu.
    const typedKey = String((await readJson<{ apiKey?: unknown }>(request))?.apiKey ?? "").trim();
    if (typedKey) ai.apiKey = typedKey;
    if (!ai.apiKey) {
      const message = "Chưa có API key — nhập key vào ô API key (hoặc bấm Lưu) rồi thử lại.";
      return json({ ok: false, message, error: message }, path.endsWith("ai-ping") ? 200 : 400);
    }
    try {
      const all = await clientFor(env, ai.apiKey, helpers).listModels();
      const recent = pickRecentGradingModels(all);
      if (path.endsWith("ai-ping")) {
        return json({ ok: true, message: `Kết nối OpenAI thành công · ${recent.length} model mới dùng được để chấm bài.` });
      }
      return json({
        ok: true,
        selected: ai.model,
        total: all.length,
        models: recent.map((model) => ({ id: model.id, created: model.created, createdAt: new Date(model.created * 1000).toISOString() })),
      });
    } catch (error) {
      const message = errorMessage(error, "Không kiểm tra được kết nối OpenAI.");
      return json({ ok: false, message, error: message }, path.endsWith("ai-ping") ? 200 : 502);
    }
  }

  if (!path.startsWith("/api/grading/")) return null;
  if (!GRADING_ROLES.includes(session.role)) return json({ error: "FORBIDDEN" }, 403);
  const parts = path.slice("/api/grading/".length).split("/").filter(Boolean).map((part) => decodeURIComponent(part));

  // ----- Tải file (ảnh bài làm, file đề) -----
  if (parts[0] === "files" && parts[1] && request.method === "GET") {
    const file = await readStoredFile(env, parts[1]);
    if (!file) return json({ error: "Không tìm thấy file." }, 404);
    const owner = file.testId ? await readTest(env, file.testId) : null;
    if (session.role === "TEACHER" && (!owner || !(await canAccessClass(env, session, owner.classId)))) return json({ error: "FORBIDDEN" }, 403);
    return new Response(base64ToBytes(file.base64) as BodyInit, {
      headers: {
        "Content-Type": file.mime || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    });
  }

  if (parts[0] !== "tests") return null;

  // ----- Danh sách / tạo bài kiểm tra -----
  if (parts.length === 1) {
    if (request.method === "GET") {
      const ids = (await kv.get<string[]>(INDEX_KEY, "json")) ?? [];
      const loaded = (await Promise.all(ids.map((id) => readTest(env, id)))).filter((row): row is GradingTestDoc => Boolean(row));
      const allowed = await Promise.all(loaded.map((row) => canAccessClass(env, session, row.classId)));
      const tests = loaded.filter((_row, index) => allowed[index]);
      const summaries = await Promise.all(tests.map(async (test) => summarize(test, await readSubmissions(env, test))));
      return json({ tests: summaries });
    }
    if (request.method === "POST") {
      const body = await readJson<{ name?: unknown; classId?: unknown; sessionId?: unknown }>(request);
      const name = String(body?.name ?? "").trim().slice(0, 120);
      const classId = String(body?.classId ?? "");
      const sessionId = String(body?.sessionId ?? "");
      if (!name || !classId || !sessionId) return json({ error: "Chọn lớp, buổi học và tên bài kiểm tra." }, 400);
      if (!(await canAccessClass(env, session, classId))) return json({ error: "FORBIDDEN" }, 403);
      const roster = await classRoster(env, classId);
      if (!roster) return json({ error: "Không tìm thấy lớp." }, 404);
      const sessions = await kv.get<{ id: string; classId: string }[]>("sessions:steps-demo", "json");
      if (!(sessions ?? []).some((row) => row.id === sessionId && row.classId === classId)) return json({ error: "Buổi học không thuộc lớp này." }, 400);
      const ids = (await kv.get<string[]>(INDEX_KEY, "json")) ?? [];
      const existing = await Promise.all(ids.map((id) => readTest(env, id)));
      if (existing.some((row) => row && row.sessionId === sessionId && row.name === name)) return json({ error: "Buổi này đã có bài kiểm tra cùng tên." }, 409);
      const test: GradingTestDoc = {
        id: newId("gtest"), name, classId, sessionId, createdAt: new Date().toISOString(), createdBy: session.email, submissionIds: [],
      };
      await kv.put(testKey(test.id), JSON.stringify(test));
      try {
        await casUpdate<string[]>(env, INDEX_KEY, [], (current) => [...current, test.id]);
      } catch (error) {
        return json({ error: errorMessage(error, "Không tạo được bài kiểm tra.") }, 409);
      }
      return json({ ok: true, ...(await detail(env, test)) }, 201);
    }
    return null;
  }

  const testId = parts[1]!;
  const test = await readTest(env, testId);
  if (!test) return json({ error: "Không tìm thấy bài kiểm tra." }, 404);
  if (!(await canAccessClass(env, session, test.classId))) return json({ error: "FORBIDDEN" }, 403);

  if (parts.length === 2) {
    if (request.method === "GET") return json(await detail(env, test));
    if (request.method === "DELETE") {
      await casUpdate<string[]>(env, INDEX_KEY, [], (current) => current.filter((id) => id !== test.id));
      // Kho KV không có lệnh xoá: ghi "null" để giải phóng ảnh bài làm và file đề (phần nặng nhất).
      for (const submission of await readSubmissions(env, test)) {
        await kv.put(submissionKey(test.id, submission.id), "null");
        for (const page of submission.pages) await kv.put(fileKey(page.fileId), "null");
      }
      if (test.exam) await kv.put(fileKey(test.exam.fileId), "null");
      await kv.put(testKey(test.id), "null");
      return json({ ok: true });
    }
    return null;
  }

  // ----- File đề + đáp án -----
  // Cả lớp: một file zip, mỗi học viên đã chấm một PDF.
  if (parts.length === 3 && parts[2] === "reports.zip" && request.method === "GET") {
    const graded = (await readSubmissions(env, test)).filter((row) => row.status === "GRADED" && row.result);
    if (!graded.length) return json({ error: "Chưa có bài nào được chấm." }, 400);
    const context = await loadReportContext(env, helpers, test);
    if (!context) return json({ error: "Thiếu font để tạo PDF." }, 500);
    const used = new Set<string>();
    const files: { name: string; bytes: Uint8Array }[] = [];
    for (const submission of graded) {
      const report = await renderReport(context, test, submission);
      let name = report.filename;
      for (let n = 2; used.has(name); n += 1) name = report.filename.replace(/\.pdf$/, `-${n}.pdf`);
      used.add(name);
      files.push({ name, bytes: report.bytes });
    }
    const zip = zipStore(files);
    return new Response(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${gradingReportDownloadName("ca-lop", test.name).replace(/^phieu-ket-qua-ca-lop-/, "phieu-ket-qua-").replace(/\.pdf$/, ".zip")}"`, "Cache-Control": "private, no-store" },
    });
  }

  if (parts[2] === "exam" && request.method === "PUT") {
    const mime = mimeOf(request);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return json({ error: "File đề rỗng." }, 400);
    if (bytes.length > MAX_EXAM_BYTES) return json({ error: "File đề quá lớn (tối đa 15MB)." }, 413);
    const name = uploadedName(request, "de-bai");
    const fileId = newId("gfile");
    await kv.put(fileKey(fileId), JSON.stringify({ name, mime, base64: bytesToBase64(bytes), testId: test.id } satisfies StoredFile));
    const next = await casUpdate<GradingTestDoc>(env, testKey(test.id), test, (current) => ({
      ...current,
      exam: { fileId, name, mime, size: bytes.length, uploadedAt: new Date().toISOString() },
      // Đề mới thì đáp án cũ không còn đúng.
      answerKey: undefined,
    }));
    return json({ ok: true, ...(await detail(env, next)) });
  }

  if (parts[2] === "answer-key" && parts[3] === "generate" && request.method === "POST") {
    if (!test.exam) return json({ error: "Tải file đề lên trước." }, 400);
    const ai = await readAiConfig(env);
    if (!ai.enabled || !ai.apiKey || !ai.model) return json({ error: "Chưa bật/cấu hình chấm bài AI (key và model) ở Cấu hình → Tích hợp." }, 400);
    const file = await readStoredFile(env, test.exam.fileId);
    if (!file) return json({ error: "Mất file đề, tải lại giúp em." }, 404);
    try {
      const key = await generateAnswerKey(clientFor(env, ai.apiKey, helpers), ai.model, file);
      const next = await casUpdate<GradingTestDoc>(env, testKey(test.id), test, (current) => ({ ...current, answerKey: key }));
      return json({ ok: true, ...(await detail(env, next)) });
    } catch (error) {
      return json({ error: errorMessage(error, "AI chưa sinh được đáp án.") }, 502);
    }
  }

  if (parts[2] === "answer-key" && request.method === "PUT") {
    const body = await readJson<{ title?: unknown; questions?: unknown }>(request);
    if (!body) return json({ error: "Dữ liệu đáp án không hợp lệ." }, 400);
    const key = normalizeAnswerKey(body, test.answerKey?.generatedAt ?? new Date().toISOString(), new Date().toISOString());
    if (!key.questions.length) return json({ error: "Đáp án cần ít nhất một câu." }, 400);
    const next = await casUpdate<GradingTestDoc>(env, testKey(test.id), test, (current) => ({ ...current, answerKey: key }));
    return json({ ok: true, ...(await detail(env, next)) });
  }

  // ----- Bài làm -----
  if (parts[2] === "submissions" && parts.length === 3 && request.method === "POST") {
    const stored = await storeImagePage(env, request, test.id);
    if (stored instanceof Response) return stored;
    const submission: GradingSubmissionDoc = {
      id: newId("gsub"), testId: test.id, name: stored.name, pages: [stored], uploadedAt: new Date().toISOString(), status: "UPLOADED", studentId: null,
    };
    // Mỗi học sinh một thư mục: tên thư mục khớp đúng một học viên chưa có bài thì gán luôn.
    const folderName = decodeHeader(request, "x-folder-name").slice(0, 120);
    if (folderName) {
      submission.folderName = folderName;
      const roster = (await classRoster(env, test.classId)) ?? [];
      const taken = new Set((await readSubmissions(env, test)).map((row) => row.studentId).filter(Boolean));
      const matched = matchStudentByName(folderName, roster.filter((student) => !taken.has(student.id)));
      if (matched) { submission.studentId = matched; submission.matchSource = "FOLDER"; }
    }
    await kv.put(submissionKey(test.id, submission.id), JSON.stringify(submission));
    await casUpdate<GradingTestDoc>(env, testKey(test.id), test, (current) => ({ ...current, submissionIds: [...current.submissionIds, submission.id] }));
    return json({ ok: true, submission }, 201);
  }

  const submissionId = parts[3];
  if (parts[2] === "submissions" && submissionId) {
    const stored = await kv.get<GradingSubmissionDoc>(submissionKey(test.id, submissionId), "json");
    if (!stored || !test.submissionIds.includes(submissionId)) return json({ error: "Không tìm thấy bài làm." }, 404);

    // Thêm một trang (ảnh) nữa vào bài làm đã có — bài làm nhiều tờ giấy.
    if (parts.length === 5 && parts[4] === "pages" && request.method === "POST") {
      if (stored.pages.length >= MAX_PAGES_PER_SUBMISSION) return json({ error: `Một bài làm tối đa ${MAX_PAGES_PER_SUBMISSION} ảnh.` }, 400);
      const page = await storeImagePage(env, request, test.id);
      if (page instanceof Response) return page;
      // Thêm trang thì kết quả chấm cũ không còn đúng → về trạng thái chờ chấm, giữ học viên đã gán.
      const next: GradingSubmissionDoc = { ...stored, pages: [...stored.pages, page], status: "UPLOADED", result: undefined, error: undefined };
      await kv.put(submissionKey(test.id, submissionId), JSON.stringify(next));
      return json({ ok: true, submission: next }, 201);
    }

    if (parts.length === 4 && request.method === "DELETE") {
      await casUpdate<GradingTestDoc>(env, testKey(test.id), test, (current) => ({ ...current, submissionIds: current.submissionIds.filter((id) => id !== submissionId) }));
      await kv.put(submissionKey(test.id, submissionId), "null");
      for (const page of stored.pages) await kv.put(fileKey(page.fileId), "null");
      return json({ ok: true });
    }

    // Phiếu kết quả PDF của một học viên.
    if (parts.length === 5 && parts[4] === "report.pdf" && request.method === "GET") {
      if (!stored.result || stored.status !== "GRADED") return json({ error: "Bài này chưa chấm." }, 400);
      const context = await loadReportContext(env, helpers, test);
      if (!context) return json({ error: "Thiếu font để tạo PDF." }, 500);
      const report = await renderReport(context, test, stored);
      return pdfResponse(report.bytes, report.filename);
    }

    // Giáo viên sửa tay đúng/sai từng câu (AI đọc nhầm chữ viết tay) rồi tính lại điểm.
    if (parts.length === 5 && parts[4] === "answers" && request.method === "PUT") {
      if (!stored.result) return json({ error: "Bài này chưa chấm." }, 400);
      const body = await readJson<{ answers?: Record<string, unknown> }>(request);
      const edits = body?.answers && typeof body.answers === "object" ? body.answers : {};
      const answers = stored.result.answers.map((item) => {
        const edit = edits[String(item.number)];
        return typeof edit === "boolean" && edit !== item.correct ? { ...item, correct: edit, teacherEdited: true } : item;
      });
      const next: GradingSubmissionDoc = { ...stored, result: recomputeScore({ ...stored.result, answers }) };
      await kv.put(submissionKey(test.id, submissionId), JSON.stringify(next));
      return json({ ok: true, submission: next });
    }

    if (parts.length === 4 && request.method === "PUT") {
      const body = await readJson<{ studentId?: unknown }>(request);
      const studentId = body?.studentId ? String(body.studentId) : null;
      if (studentId) {
        const roster = await classRoster(env, test.classId);
        if (!roster?.some((student) => student.id === studentId)) return json({ error: "Học viên không thuộc lớp này." }, 400);
        const others = (await readSubmissions(env, test)).filter((row) => row.id !== submissionId && row.studentId === studentId);
        if (others.length) return json({ error: "Học viên này đã có bài khác trong bài kiểm tra." }, 409);
      }
      const next: GradingSubmissionDoc = { ...stored, studentId, matchSource: studentId ? "MANUAL" : undefined };
      await kv.put(submissionKey(test.id, submissionId), JSON.stringify(next));
      return json({ ok: true, submission: next });
    }

    if (parts[4] === "grade" && request.method === "POST") {
      if (!test.answerKey) return json({ error: "Chưa có đáp án — tải đề và sinh đáp án trước." }, 400);
      const ai = await readAiConfig(env);
      if (!ai.enabled || !ai.apiKey || !ai.model) return json({ error: "Chưa bật/cấu hình chấm bài AI (key và model) ở Cấu hình → Tích hợp." }, 400);
      const files = await Promise.all(stored.pages.map((page) => readStoredFile(env, page.fileId)));
      if (files.some((file) => !file)) return json({ error: "Mất ảnh bài làm, tải lại giúp em." }, 404);
      try {
        const result = await gradeSubmission(
          clientFor(env, ai.apiKey, helpers), ai.model, test.answerKey,
          files.map((file) => ({ name: file!.name, mime: file!.mime, base64: file!.base64 })),
        );
        const keepAssigned = stored.matchSource === "MANUAL" || stored.matchSource === "FOLDER";
        let studentId = keepAssigned ? stored.studentId : null;
        let matchSource: GradingSubmissionDoc["matchSource"] = keepAssigned ? stored.matchSource : undefined;
        if (!studentId) {
          const roster = (await classRoster(env, test.classId)) ?? [];
          const taken = new Set((await readSubmissions(env, test)).filter((row) => row.id !== submissionId && row.studentId).map((row) => row.studentId));
          const matched = matchStudentByName(result.detectedName, roster.filter((student) => !taken.has(student.id)));
          if (matched) { studentId = matched; matchSource = "AI"; }
        }
        const next: GradingSubmissionDoc = { ...stored, status: "GRADED", studentId, matchSource, error: undefined, result };
        await kv.put(submissionKey(test.id, submissionId), JSON.stringify(next));
        return json({ ok: true, submission: next });
      } catch (error) {
        const next: GradingSubmissionDoc = { ...stored, status: "ERROR", error: errorMessage(error, "AI chưa chấm được bài này.") };
        await kv.put(submissionKey(test.id, submissionId), JSON.stringify(next));
        return json({ ok: false, error: next.error, submission: next }, 502);
      }
    }
  }

  return null;
}
