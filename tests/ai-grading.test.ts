import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";

import { encryptSecret } from "../cloudflare/crypto-secrets";
import { extractDocxText } from "../cloudflare/docx-text";
import { buildSubmissionResult, matchStudentByName, normalizeAnswerKey } from "../cloudflare/grading-engine";
import { handleGradingApi, type GradingEnv } from "../cloudflare/grading-routes";
import { defaultIntegrationSettings, maskIntegrationSettings, mergeIntegrationSettings, type IntegrationSettingsPatch } from "../cloudflare/integration-settings";
import { pickRecentGradingModels } from "../cloudflare/openai-client";

const AUTH_SECRET = "test-auth-secret-at-least-32-characters-long";

/** Dựng một file .docx tối thiểu (zip với một entry word/document.xml nén deflate). */
function buildDocx(paragraphs: string[]): Uint8Array {
  const xml = `<?xml version="1.0"?><w:document><w:body>${paragraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const raw = Buffer.from(xml, "utf8");
  const data = deflateRawSync(raw);
  const name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const localPart = Buffer.concat([local, name, data]);
  const centralPart = Buffer.concat([central, name]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(centralPart.length, 12); eocd.writeUInt32LE(localPart.length, 16);
  return new Uint8Array(Buffer.concat([localPart, centralPart, eocd]));
}

test("đọc chữ từ file .docx", async () => {
  const text = await extractDocxText(buildDocx(["Rewrite the following sentences.", "1. There are 40 students &amp; teachers", "  "]));
  assert.equal(text, "Rewrite the following sentences.\n1. There are 40 students & teachers");
});

test("chỉ giữ model chat mới trong 6 tháng gần nhất", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  const models = [
    { id: "gpt-5.5", created: sec("2026-09-01") },
    { id: "gpt-5.4-mini", created: sec("2026-05-01") },
    { id: "gpt-4o", created: sec("2024-05-13") },
    { id: "gpt-5.5-transcribe", created: sec("2026-09-02") },
    { id: "gpt-image-2", created: sec("2026-09-02") },
    { id: "text-embedding-3-large", created: sec("2026-09-02") },
    { id: "o4-mini", created: sec("2026-06-01") },
  ];
  assert.deepEqual(pickRecentGradingModels(models, now).map((m) => m.id), ["gpt-5.5", "o4-mini", "gpt-5.4-mini"]);
});

test("cấu hình AI: mã hoá key, che key khi trả client, bản lưu cũ không có khối ai vẫn đọc được", async () => {
  const legacy = { ...defaultIntegrationSettings() } as Partial<ReturnType<typeof defaultIntegrationSettings>>;
  delete legacy.ai;
  assert.deepEqual(maskIntegrationSettings(legacy as never).ai, { enabled: false, apiKeyHint: undefined, model: "" });

  const base = defaultIntegrationSettings();
  const patch: IntegrationSettingsPatch = {
    sepay: { webhookMode: "API_KEY" },
    misa: { ...base.misa },
    zalo: { ...base.zalo },
    ai: { enabled: true, apiKey: "sk-test-abcdef1234", model: "gpt-5.5" },
  };
  const saved = await mergeIntegrationSettings(legacy as never, patch, AUTH_SECRET, "admin@x");
  assert.equal(saved.ai.apiKeyHint, "1234");
  assert.ok(saved.ai.apiKeyEncrypted && !saved.ai.apiKeyEncrypted.includes("sk-test"));
  const masked = JSON.stringify(maskIntegrationSettings(saved));
  assert.ok(!masked.includes("sk-test") && !masked.includes("apiKeyEncrypted"));
  // Lưu lại không gửi key → giữ key cũ; patch không có `ai` → giữ nguyên cả khối.
  const again = await mergeIntegrationSettings(saved, { ...patch, ai: { enabled: false, apiKey: "", model: "gpt-5.4-mini" } }, AUTH_SECRET, "admin@x");
  assert.equal(again.ai.apiKeyEncrypted, saved.ai.apiKeyEncrypted);
  assert.equal(again.ai.model, "gpt-5.4-mini");
  const untouched = await mergeIntegrationSettings(saved, { sepay: patch.sepay, misa: patch.misa, zalo: patch.zalo }, AUTH_SECRET, "admin@x");
  assert.deepEqual(untouched.ai, saved.ai);
});

test("khớp tên viết tay với danh sách lớp", () => {
  const roster = [
    { id: "a", fullName: "Nguyễn Thảo My" },
    { id: "b", fullName: "Trịnh Hà Anh" },
    { id: "c", fullName: "Khánh An" },
    { id: "d", fullName: "Lê Hà Anh" },
  ];
  assert.equal(matchStudentByName("Thảo my", roster), "a");
  assert.equal(matchStudentByName("khanh an", roster), "c");
  // Hai bạn cùng "Hà Anh" → không đoán, để giáo viên chọn.
  assert.equal(matchStudentByName("Hà Anh", roster), null);
  assert.equal(matchStudentByName("", roster), null);
  assert.equal(matchStudentByName("Phạm Quốc Bảo", roster), null);
});

test("điểm = số câu đúng / tổng câu (bỏ qua points); câu AI bỏ sót tính sai", () => {
  const key = normalizeAnswerKey({
    title: "Rewrite",
    questions: [
      { number: 2, prompt: "b", acceptedAnswers: ["B"], points: 1 },
      { number: 1, prompt: "a", acceptedAnswers: ["A", "a1"], points: 2 },
      { number: 3, prompt: "c", acceptedAnswers: ["C"], points: 1 },
      { number: 1, prompt: "trùng số", acceptedAnswers: ["Z"], points: 1 },
    ],
  }, "2026-10-11T00:00:00Z");
  assert.deepEqual(key.questions.map((q) => q.number), [1, 2, 3]);
  const result = buildSubmissionResult(key, {
    studentName: " Thảo My ",
    answers: [
      { number: 1, studentAnswer: "A", correct: true, comment: "", correction: "không nên có" },
      { number: 3, page: 9, studentAnswer: "C", correct: true, comment: "" },
      { number: 2, studentAnswer: "x", correct: false, comment: "Sai từ vựng", correction: "B" },
    ],
    feedback: " Em làm tốt, ôn lại thì hiện tại. ",
  }, "gpt-5.5");
  assert.equal(result.detectedName, "Thảo My");
  assert.equal(result.earned, 2);
  assert.equal(result.total, 3);
  assert.equal(result.feedback, "Em làm tốt, ôn lại thì hiện tại.");
  assert.equal(result.answers[0]!.correction, "", "câu đúng không giữ phần sửa lại");
  assert.equal(result.answers[1]!.correction, "B");
  assert.equal(result.answers[1]!.comment, "Sai từ vựng");
  assert.equal(result.answers[2]!.page, 1, "số trang vượt quá số ảnh bị kẹp về trang cuối");
  assert.equal(result.answers[0]!.page, 1, "AI không nói trang thì mặc định trang 1");
  assert.equal(result.answers[2]!.correct, true);
});

function memoryEnv(extra: Record<string, unknown> = {}) {
  const store = new Map<string, string>();
  const env: GradingEnv = {
    AUTH_SECRET,
    STEPS_LMS_DATA: {
      async get<T>(key: string) { const raw = store.get(key); return raw === undefined ? null : (JSON.parse(raw) as T); },
      async put(key: string, value: string) { store.set(key, value); },
      async compareAndPut(key: string, expected: string, value: string) {
        if ((store.get(key) ?? "null") !== expected) return false;
        store.set(key, value);
        return true;
      },
    },
  };
  store.set("classes:steps-demo", JSON.stringify([{ id: "cls-1", teacherId: "t-1", studentIds: ["st-1", "st-2"] }]));
  store.set("students:steps-demo", JSON.stringify([{ id: "st-1", fullName: "Nguyễn Thảo My" }, { id: "st-2", fullName: "Trịnh Hà Anh" }]));
  store.set("sessions:steps-demo", JSON.stringify([{ id: "ses-1", classId: "cls-1" }]));
  for (const [key, value] of Object.entries(extra)) store.set(key, JSON.stringify(value));
  return { env, store };
}

const FAKE_KEY_RESPONSE = { title: "Rewrite", questions: [{ number: 1, prompt: "1. ...", acceptedAnswers: ["has 40 students"], points: 1 }, { number: 2, prompt: "2. ...", acceptedAnswers: ["Lan's school bag"], points: 1 }] };
const FAKE_GRADE_RESPONSE = {
  studentName: "Thảo my", note: "",
  answers: [
    { number: 1, page: 1, studentAnswer: "has 40 students", correct: true, comment: "" },
    { number: 2, page: 2, studentAnswer: "Lan school bag", correct: false, comment: "Thiếu 's" },
  ],
};

function fakeOpenAi(calls: { url: string; body: Record<string, unknown> | null; auth: string | null }[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, body, auth: new Headers(init?.headers).get("authorization") });
    if (url.endsWith("/models")) {
      const now = Math.floor(Date.now() / 1000);
      return Response.json({ data: [{ id: "gpt-5.5", created: now - 86400 }, { id: "gpt-4o", created: 1715000000 }, { id: "gpt-5.5-transcribe", created: now }] });
    }
    const schemaName = ((body?.text as { format: { name: string } }).format).name;
    const payload = schemaName === "answer_key" ? FAKE_KEY_RESPONSE : FAKE_GRADE_RESPONSE;
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }] });
  }) as typeof fetch;
}

/** Mã giáo viên của người gọi khi role = TEACHER; test đổi sang giáo viên khác để thử phân quyền. */
let callerTeacherId = "t-1";

async function call(env: GradingEnv, role: "ADMIN" | "TEACHER" | "STUDENT", method: string, path: string, init: { json?: unknown; bytes?: Uint8Array; mime?: string; name?: string; folder?: string } = {}, fetchImpl?: typeof fetch) {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  if (init.bytes) { headers["Content-Type"] = init.mime ?? "application/octet-stream"; headers["X-File-Name"] = encodeURIComponent(init.name ?? "file"); body = init.bytes as BodyInit; }
  if (init.folder) headers["X-Folder-Name"] = encodeURIComponent(init.folder);
  const request = new Request(`http://localhost${path}`, { method, headers, body });
  const response = await handleGradingApi(request, new URL(request.url), env, { role, email: "gv@x", teacherId: role === "TEACHER" ? callerTeacherId : undefined }, { json: (data, status = 200) => Response.json(data, { status }), fetchImpl, loadAsset: async (path) => { try { const file = await readFile(new URL(`../cloudflare/public${path}`, import.meta.url)); return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer; } catch { return null; } } });
  assert.ok(response, `route ${method} ${path} phải được xử lý`);
  return { status: response.status, body: response.headers.get("content-type")?.includes("json") ? await response.json() as Record<string, any> : response };
}

async function configuredEnv() {
  const base = defaultIntegrationSettings();
  return memoryEnv({
    "integrations:steps-demo": { ...base, ai: { enabled: true, model: "gpt-5.5", apiKeyEncrypted: await encryptSecret("sk-live-secret-9999", AUTH_SECRET), apiKeyHint: "9999" } },
  });
}

test("luồng chấm phiếu: tạo bài → đề → đáp án AI → nộp ảnh → chấm → nhận diện học viên", async () => {
  const { env } = await configuredEnv();
  const calls: { url: string; body: Record<string, unknown> | null; auth: string | null }[] = [];
  const fetchImpl = fakeOpenAi(calls);

  const models = await call(env, "ADMIN", "POST", "/api/integrations/ai-models", {}, fetchImpl);
  assert.deepEqual(models.body.models.map((m: { id: string }) => m.id), ["gpt-5.5"]);
  assert.equal(models.body.selected, "gpt-5.5");
  assert.equal(calls[0]!.auth, "Bearer sk-live-secret-9999");
  assert.equal((await call(env, "TEACHER", "POST", "/api/integrations/ai-models", {}, fetchImpl)).status, 403);

  assert.equal((await call(env, "STUDENT", "GET", "/api/grading/tests")).status, 403);
  const created = await call(env, "TEACHER", "POST", "/api/grading/tests", { json: { name: "BTVN", classId: "cls-1", sessionId: "ses-1" } });
  assert.equal(created.status, 201);
  const testId = created.body.test.id as string;
  assert.equal((await call(env, "TEACHER", "POST", "/api/grading/tests", { json: { name: "BTVN", classId: "cls-1", sessionId: "ses-1" } })).status, 409);
  assert.equal((await call(env, "TEACHER", "POST", "/api/grading/tests", { json: { name: "X", classId: "cls-1", sessionId: "ses-khac" } })).status, 400);

  // Chưa có đề thì chưa sinh được đáp án.
  assert.equal((await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/answer-key/generate`, {}, fetchImpl)).status, 400);

  const docx = buildDocx(["Rewrite the following sentences.", "1. There are 40 students in my class.", "2. This school bag belongs to Lan."]);
  const exam = await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/exam`, { bytes: docx, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: "rewrite 5.4.docx" });
  assert.equal(exam.status, 200);
  assert.equal(exam.body.test.exam.name, "rewrite 5.4.docx");

  const generated = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/answer-key/generate`, {}, fetchImpl);
  assert.equal(generated.status, 200);
  assert.equal(generated.body.test.answerKey.questions.length, 2);
  const keyCall = calls.find((row) => row.url.endsWith("/responses"))!;
  const sentText = JSON.stringify(keyCall.body);
  assert.ok(sentText.includes("There are 40 students in my class."), "chữ trong file Word phải được gửi cho model");
  assert.equal(keyCall.body!.model, "gpt-5.5");

  // Giáo viên sửa đáp án tay.
  const edited = await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/answer-key`, { json: { title: "Rewrite", questions: [{ number: 1, prompt: "p", acceptedAnswers: ["has 40 students", "has forty students"], points: 1 }, { number: 2, prompt: "q", acceptedAnswers: ["Lan's school bag"], points: 1 }] } });
  assert.equal(edited.body.test.answerKey.questions[0].acceptedAnswers.length, 2);
  assert.ok(edited.body.test.answerKey.editedAt);

  // Chỉ nhận ảnh.
  assert.equal((await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions`, { bytes: new Uint8Array([1, 2, 3]), mime: "application/pdf", name: "a.pdf" })).status, 415);
  const uploaded = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions`, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mime: "image/jpeg", name: "bai-1.jpg" });
  assert.equal(uploaded.status, 201);
  const submissionId = uploaded.body.submission.id as string;
  assert.equal(uploaded.body.submission.pages.length, 1);
  // Bài làm viết trên 2 tờ: thêm trang 2 vào cùng bài.
  const page2 = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions/${submissionId}/pages`, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0x00]), mime: "image/jpeg", name: "bai-1-trang-2.jpg" });
  assert.equal(page2.status, 201);
  assert.equal(page2.body.submission.pages.length, 2);
  assert.equal((await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions/${submissionId}/pages`, { bytes: new Uint8Array([1]), mime: "application/pdf", name: "x.pdf" })).status, 415);

  const graded = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions/${submissionId}/grade`, {}, fetchImpl);
  assert.equal(graded.status, 200);
  assert.equal(graded.body.submission.status, "GRADED");

  // Giáo viên sửa tay một câu AI đọc nhầm: điểm tính lại, câu được đánh dấu.
  const flipped = await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/submissions/${submissionId}/answers`, { json: { answers: { "2": true, "99": true } } });
  assert.equal(flipped.status, 200);
  assert.equal(flipped.body.submission.result.earned, 2);
  assert.equal(flipped.body.submission.result.answers.find((row: { number: number }) => row.number === 2).teacherEdited, true);

  // Phiếu kết quả PDF của học viên: tải được, đúng loại file, nhiều trang không lỗi.
  const report = await call(env, "TEACHER", "GET", `/api/grading/tests/${testId}/submissions/${submissionId}/report.pdf`);
  assert.equal(report.status, 200);
  const reportResponse = report.body as unknown as Response;
  assert.equal(reportResponse.headers.get("content-type"), "application/pdf");
  assert.match(reportResponse.headers.get("content-disposition") ?? "", /^attachment; filename="phieu-ket-qua-.*\.pdf"$/);
  assert.equal(new TextDecoder().decode((await reportResponse.arrayBuffer()).slice(0, 5)), "%PDF-");

  // Cả lớp: zip hợp lệ, mỗi bài đã chấm một PDF.
  const zipRes = await call(env, "TEACHER", "GET", `/api/grading/tests/${testId}/reports.zip`);
  assert.equal(zipRes.status, 200);
  const zipResponse = zipRes.body as unknown as Response;
  assert.equal(zipResponse.headers.get("content-type"), "application/zip");
  const zip = new Uint8Array(await zipResponse.arrayBuffer());
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50, "có bản ghi kết thúc zip");
  assert.equal(view.getUint16(zip.length - 22 + 10, true), 1, "một bài đã chấm = một file");
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const nameLen = view.getUint16(26, true);
  assert.match(new TextDecoder().decode(zip.slice(30, 30 + nameLen)), /^phieu-ket-qua-.*\.pdf$/);
  assert.equal(new TextDecoder().decode(zip.slice(30 + nameLen, 35 + nameLen)), "%PDF-");
  assert.equal(graded.body.submission.studentId, "st-1", "tên 'Thảo my' phải khớp Nguyễn Thảo My");
  assert.equal(graded.body.submission.matchSource, "AI");
  const gradeCall = calls.filter((row) => row.url.endsWith("/responses")).at(-1)!;
  const gradeParts = (gradeCall.body!.input as { content: { type: string }[] }[])[0]!.content;
  assert.equal(gradeParts.filter((part) => part.type === "input_image").length, 2, "cả 2 trang phải được gửi cho model");
  assert.equal(graded.body.submission.result.answers[1].page, 2);
  assert.ok(JSON.stringify(gradeCall.body).includes("has forty students"), "chấm theo đáp án đã sửa");

  // Giáo viên chuyển bài sang học viên khác; một học viên không nhận hai bài.
  const moved = await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/submissions/${submissionId}`, { json: { studentId: "st-2" } });
  assert.equal(moved.body.submission.studentId, "st-2");
  const second = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions`, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mime: "image/jpeg", name: "bai-2.jpg" });
  const secondId = second.body.submission.id as string;
  assert.equal((await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/submissions/${secondId}`, { json: { studentId: "st-2" } })).status, 409);
  assert.equal((await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/submissions/${secondId}`, { json: { studentId: "st-ngoai-lop" } })).status, 400);

  // F5: đọc lại từ kho vẫn đủ dữ liệu; ảnh tải về đúng nội dung.
  const reread = await call(env, "TEACHER", "GET", `/api/grading/tests/${testId}`);
  assert.equal(reread.body.submissions.length, 2);
  assert.equal(reread.body.summary.gradedCount, 1);
  const file = await call(env, "TEACHER", "GET", `/api/grading/files/${uploaded.body.submission.pages[0].fileId}`);
  assert.equal((file.body as Response).headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await (file.body as Response).arrayBuffer())], [0xff, 0xd8, 0xff, 0xd9]);

  const list = await call(env, "TEACHER", "GET", "/api/grading/tests");
  assert.equal(list.body.tests[0].submissionCount, 2);

  await call(env, "TEACHER", "DELETE", `/api/grading/tests/${testId}/submissions/${secondId}`);
  assert.equal((await call(env, "TEACHER", "GET", `/api/grading/tests/${testId}`)).body.submissions.length, 1);
  await call(env, "TEACHER", "DELETE", `/api/grading/tests/${testId}`);
  assert.equal((await call(env, "TEACHER", "GET", "/api/grading/tests")).body.tests.length, 0);
  // Xoá bài kiểm tra phải dọn cả file đề và ảnh bài làm, không để mồ côi trong kho.
  assert.equal((await call(env, "TEACHER", "GET", `/api/grading/files/${exam.body.test.exam.fileId}`)).status, 404);
  assert.equal((await call(env, "TEACHER", "GET", `/api/grading/files/${uploaded.body.submission.pages[0].fileId}`)).status, 404);
  assert.equal((await call(env, "TEACHER", "GET", `/api/grading/files/${page2.body.submission.pages[1].fileId}`)).status, 404);
});

test("chưa cấu hình AI hoặc OpenAI lỗi thì báo rõ, không chấm dở", async () => {
  const unconfigured = memoryEnv();
  const created = await call(unconfigured.env, "ADMIN", "POST", "/api/grading/tests", { json: { name: "BT", classId: "cls-1", sessionId: "ses-1" } });
  const testId = created.body.test.id as string;
  await call(unconfigured.env, "ADMIN", "PUT", `/api/grading/tests/${testId}/exam`, { bytes: new TextEncoder().encode("1. a"), mime: "text/plain", name: "de.txt" });
  const noKey = await call(unconfigured.env, "ADMIN", "POST", `/api/grading/tests/${testId}/answer-key/generate`, {});
  assert.equal(noKey.status, 400);
  assert.match(noKey.body.error, /Chưa bật\/cấu hình chấm bài AI/);

  const { env } = await configuredEnv();
  const t2 = (await call(env, "ADMIN", "POST", "/api/grading/tests", { json: { name: "BT", classId: "cls-1", sessionId: "ses-1" } })).body.test.id as string;
  await call(env, "ADMIN", "PUT", `/api/grading/tests/${t2}/exam`, { bytes: new TextEncoder().encode("1. a"), mime: "text/plain", name: "de.txt" });
  const unauthorized = (async () => Response.json({ error: { message: "bad key" } }, { status: 401 })) as typeof fetch;
  const failed = await call(env, "ADMIN", "POST", `/api/grading/tests/${t2}/answer-key/generate`, {}, unauthorized);
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error, "API key không hợp lệ hoặc đã bị thu hồi.");
  assert.ok(!JSON.stringify(failed.body).includes("sk-live"));
});

test("mỗi học sinh một thư mục: tên thư mục tự gán học viên và không bị AI ghi đè", async () => {
  const { env } = await configuredEnv();
  const fetchImpl = fakeOpenAi([]);
  const testId = (await call(env, "TEACHER", "POST", "/api/grading/tests", { json: { name: "BT", classId: "cls-1", sessionId: "ses-1" } })).body.test.id as string;
  await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/exam`, { bytes: new TextEncoder().encode("1. a"), mime: "text/plain", name: "de.txt" });
  await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/answer-key/generate`, {}, fetchImpl);

  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const first = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions`, { bytes: jpg, mime: "image/jpeg", name: "1.jpg", folder: "Trinh Ha Anh" });
  assert.equal(first.body.submission.studentId, "st-2", "tên thư mục 'Trinh Ha Anh' (không dấu) khớp Trịnh Hà Anh");
  assert.equal(first.body.submission.matchSource, "FOLDER");
  assert.equal(first.body.submission.folderName, "Trinh Ha Anh");
  // Thư mục thứ hai trùng học viên đã có bài thì không gán chồng; thư mục lạ để trống.
  const dup = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions`, { bytes: jpg, mime: "image/jpeg", name: "1.jpg", folder: "Ha Anh" });
  assert.equal(dup.body.submission.studentId, null);
  const unknown = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions`, { bytes: jpg, mime: "image/jpeg", name: "1.jpg", folder: "hs-07" });
  assert.equal(unknown.body.submission.studentId, null);

  // Chấm: AI đọc tên "Thảo my" (khớp Nguyễn Thảo My) nhưng thư mục đã quyết định học viên — giữ nguyên.
  const graded = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions/${first.body.submission.id}/grade`, {}, fetchImpl);
  assert.equal(graded.body.submission.studentId, "st-2");
  assert.equal(graded.body.submission.matchSource, "FOLDER");
  // Thư mục lạ: chấm xong AI tự khớp theo tên viết tay.
  const gradedUnknown = await call(env, "TEACHER", "POST", `/api/grading/tests/${testId}/submissions/${unknown.body.submission.id}/grade`, {}, fetchImpl);
  assert.equal(gradedUnknown.body.submission.studentId, "st-1");
  assert.equal(gradedUnknown.body.submission.matchSource, "AI");
});

test("mọi nhân sự chấm được lớp bất kỳ — giáo viên không phụ trách lớp vẫn tạo, xem, tải file (anh Mori 18/11/2026)", async () => {
  const { env } = await configuredEnv();
  const created = await call(env, "TEACHER", "POST", "/api/grading/tests", { json: { name: "BT", classId: "cls-1", sessionId: "ses-1" } });
  const testId = created.body.test.id as string;
  await call(env, "TEACHER", "PUT", `/api/grading/tests/${testId}/exam`, { bytes: new TextEncoder().encode("1. a"), mime: "text/plain", name: "de.txt" });
  const fileId = (await call(env, "TEACHER", "GET", `/api/grading/tests/${testId}`)).body.test.exam.fileId as string;

  callerTeacherId = "t-2";
  try {
    assert.equal((await call(env, "TEACHER", "POST", "/api/grading/tests", { json: { name: "Khac", classId: "cls-1", sessionId: "ses-1" } })).status, 201);
    assert.equal((await call(env, "TEACHER", "GET", "/api/grading/tests")).body.tests.length, 2);
    assert.equal((await call(env, "TEACHER", "GET", `/api/grading/tests/${testId}`)).status, 200);
    assert.equal((await call(env, "TEACHER", "GET", `/api/grading/files/${fileId}`)).status, 200);
  } finally {
    callerTeacherId = "t-1";
  }
  assert.equal((await call(env, "STUDENT", "GET", `/api/grading/tests/${testId}`)).status, 403);
  assert.equal((await call(env, "ADMIN", "GET", "/api/grading/tests")).body.tests.length, 2);
});
