/**
 * API THAO TÁC cho trợ lý AI (Muse) — hai việc, đều hai bước (xem trước → anh Vũ đồng ý → ghi):
 * 1) Nhập sao kê ngân hàng
 *   POST /api/v1/ops/bank-statement/preview  { fileName, rows: [{ date, amount, content }] }
 *                                            hoặc { fileName, fileBase64 }  → tóm tắt + previewId (không ghi)
 *   POST /api/v1/ops/bank-statement/commit   { previewId }             → ghi giao dịch khớp, dòng lệch vào hàng đợi
 * 2) Xử lý Giao dịch lệch theo lệnh anh Vũ ("khoản này của HV… lớp…")
 *   GET  /api/v1/ops/review-queue                                       → danh sách giao dịch lệch
 *   POST /api/v1/ops/review/preview { transactionId, action: "collect", studentCode, classCode? }
 *                                   { transactionId, action: "ignore", note }   → xem trước + previewId (không ghi)
 *   POST /api/v1/ops/review/commit  { previewId }                        → thu thủ công / bỏ qua
 * Trợ lý phải hỏi anh Vũ sau bước preview, được đồng ý mới gọi commit.
 *
 * - Token riêng "Authorization: Bearer <LMS_OPS_API_TOKEN>" (khác token chỉ đọc). Trống = API tắt.
 * - commit chỉ chạy với previewId còn hạn (15 phút) và dữ liệu học phí KHÔNG đổi kể từ lúc
 *   preview; đổi → 409 STALE_PREVIEW, phải preview lại. Mỗi previewId dùng một lần.
 * - Dùng đúng hàm nhập sao kê của nút trên web (khóa đối soát, chống trùng, chốt "mã của ai
 *   ghi cho người đó"). Không có thao tác gán / sửa / xóa nào khác.
 * - Không log token; mỗi request một dòng log an toàn.
 */
import type { BankImportRowOutcome, BankStatementRow } from "./bank-statement";

export const OPS_PREFIX = "/api/v1/ops";
const PREVIEW_TTL_MS = 15 * 60_000;
const MAX_PREVIEWS = 20;

export interface OpsEnv { LMS_OPS_API_TOKEN?: string }

export interface OpsDeps {
  parseStatementFile(fileBase64: string): { rows: BankStatementRow[] } | { error: string };
  parseStatementRows(rows: unknown): { rows: BankStatementRow[] } | { error: string };
  importBankStatement(
    fileName: string,
    rows: BankStatementRow[],
    mode: "preview" | "apply",
    expectedStored?: string,
  ): Promise<{ status: number; body: Record<string, unknown>; stored?: string }>;
  reviewQueue(): Promise<Record<string, unknown>>;
  reviewAction(
    input: ReviewInput,
    mode: "preview" | "apply",
    expectedStored?: string,
  ): Promise<{ status: number; body: Record<string, unknown>; stored?: string }>;
}

export interface ReviewInput { transactionId: string; action: "collect" | "ignore"; studentCode?: string; classCode?: string; courseIndex?: number; note?: string }

interface PreviewEntry { kind: "statement" | "review"; fileName: string; rows: BankStatementRow[]; review?: ReviewInput; stored: string; createdAt: number }
const previews = new Map<string, PreviewEntry>();

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function authorized(request: Request, env: OpsEnv) {
  const expected = String(env.LMS_OPS_API_TOKEN || "").trim();
  if (expected.length < 16) return false;
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get("Authorization") || "").trim());
  if (!match) return false;
  const [a, b] = await Promise.all([sha256(match[1].trim()), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function prune(now = Date.now()) {
  for (const [id, entry] of previews) if (now - entry.createdAt > PREVIEW_TTL_MS) previews.delete(id);
  while (previews.size > MAX_PREVIEWS) previews.delete(previews.keys().next().value as string);
}

const vnd = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;

/** Kết quả gọn cho trợ lý: danh sách khớp / lệch + một câu tóm tắt để báo anh Vũ. */
function describe(rows: BankImportRowOutcome[], summary: Record<string, number>) {
  const matched = rows.filter((row) => row.result === "APPLIED").map((row) => ({ line: row.line, date: row.date, amount: row.amount, detail: row.detail || "" }));
  const unmatched = rows.filter((row) => row.queued).map((row) => ({ line: row.line, date: row.date, amount: row.amount, content: row.content, reason: row.detail || row.result }));
  const message = `${summary.applied || 0} giao dịch khớp mã (${vnd(summary.appliedAmount)}), ${summary.queued || 0} giao dịch lệch (${vnd(summary.queuedAmount)}) sẽ chuyển sang mục Giao dịch lệch`
    + `${summary.duplicate ? `, ${summary.duplicate} dòng đã nhập trước` : ""}${summary.debit ? `, ${summary.debit} dòng tiền ra` : ""} (bỏ qua).`;
  return { matched, unmatched, message };
}

function log(request: Request, url: URL, status: number, extra = "") {
  console.log(`[ops-api] ${new Date().toISOString()} ${request.method} ${url.pathname} -> ${status}${extra ? ` ${extra}` : ""}`);
}

export async function handleOpsApi(request: Request, env: OpsEnv, url: URL, deps: OpsDeps): Promise<Response> {
  const path = url.pathname.slice(OPS_PREFIX.length).replace(/\/+$/, "") || "/";
  if (!(await authorized(request, env))) {
    log(request, url, 401);
    return reply({ error: "UNAUTHORIZED", hint: "Gửi header Authorization: Bearer <token thao tác>." }, 401, { "WWW-Authenticate": "Bearer" });
  }
  if (path === "/" && request.method === "GET") {
    log(request, url, 200);
    return reply({
      name: "STEPS LMS ops API",
      endpoints: [
        "POST /api/v1/ops/bank-statement/preview { fileName, rows: [{ date: \"26/10/2026 07:20\", amount: 1560000, content: \"<nội dung CK nguyên văn>\" }] } — chỉ các dòng TIỀN VÀO, ghi nguyên văn nội dung; hoặc { fileName, fileBase64 } (file .xls/.xlsx). KHÔNG ghi; trả tóm tắt + previewId",
        "POST /api/v1/ops/bank-statement/commit { previewId } — CHỈ gọi sau khi anh Vũ đồng ý; ghi giao dịch khớp, dòng lệch vào Giao dịch lệch",
        "GET /api/v1/ops/review-queue — danh sách Giao dịch lệch (transactionId, ngày, số tiền, nội dung, lý do, học viên được nêu trong nội dung)",
        "POST /api/v1/ops/review/preview { transactionId, action: \"collect\", studentCode: \"HV0333\", classCode: \"S25\" } — thu thủ công đúng số tiền giao dịch cho học viên đó (classCode bỏ trống nếu HV chỉ học 1 lớp; lớp khóa có thể thêm courseIndex); hoặc { transactionId, action: \"ignore\", note } — không phải học phí. KHÔNG ghi; trả message + previewId",
        "POST /api/v1/ops/review/commit { previewId } — CHỈ gọi sau khi anh Vũ đồng ý",
      ],
    });
  }
  if (path === "/review-queue" && request.method === "GET") {
    const queue = await deps.reviewQueue();
    log(request, url, 200, `count=${queue.count}`);
    return reply(queue);
  }
  if (request.method !== "POST" || !["/bank-statement/preview", "/bank-statement/commit", "/review/preview", "/review/commit"].includes(path)) {
    log(request, url, request.method === "POST" ? 404 : 405);
    return request.method === "POST" ? reply({ error: "NOT_FOUND" }, 404) : reply({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "POST" });
  }
  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch { /* body rỗng */ }
  prune();

  if (path === "/bank-statement/preview") {
    const fileName = String(body.fileName || "sao-ke").slice(0, 120);
    // Trợ lý gửi file (fileBase64) hoặc các dòng đã đọc từ file: rows = [{ date, amount, content }].
    const parsed = body.rows !== undefined ? deps.parseStatementRows(body.rows) : deps.parseStatementFile(String(body.fileBase64 || ""));
    if ("error" in parsed) { log(request, url, 400); return reply({ error: parsed.error }, 400); }
    const result = await deps.importBankStatement(fileName, parsed.rows, "preview");
    if (result.status !== 200 || !result.stored) { log(request, url, result.status); return reply(result.body, result.status); }
    const previewId = crypto.randomUUID();
    const createdAt = Date.now();
    previews.set(previewId, { kind: "statement", fileName, rows: parsed.rows, stored: result.stored, createdAt });
    const summary = result.body.summary as Record<string, number>;
    log(request, url, 200, `applied=${summary.applied} queued=${summary.queued}`);
    return reply({
      ok: true,
      previewId,
      expiresAt: new Date(createdAt + PREVIEW_TTL_MS).toISOString(),
      fileName,
      summary,
      ...describe(result.body.rows as BankImportRowOutcome[], summary),
      next: "Báo anh Vũ tóm tắt trên và hỏi có cập nhật không. Chỉ khi anh đồng ý mới gọi /bank-statement/commit với previewId này (trong 15 phút).",
    });
  }

  if (path === "/review/preview") {
    const action = String(body.action || "").toLowerCase();
    if (action !== "collect" && action !== "ignore") { log(request, url, 400); return reply({ code: "BAD_ACTION", error: "action phải là \"collect\" (thu cho học viên) hoặc \"ignore\" (không phải học phí)." }, 400); }
    const input: ReviewInput = {
      transactionId: String(body.transactionId || ""),
      action,
      studentCode: body.studentCode ? String(body.studentCode).slice(0, 20) : undefined,
      classCode: body.classCode ? String(body.classCode).slice(0, 40) : undefined,
      courseIndex: Number(body.courseIndex) > 0 ? Math.floor(Number(body.courseIndex)) : undefined,
      note: body.note ? String(body.note).slice(0, 200) : undefined,
    };
    const result = await deps.reviewAction(input, "preview");
    if (result.status !== 200 || !result.stored) { log(request, url, result.status); return reply(result.body, result.status); }
    const previewId = crypto.randomUUID();
    const createdAt = Date.now();
    previews.set(previewId, { kind: "review", fileName: "", rows: [], review: input, stored: result.stored, createdAt });
    log(request, url, 200, `action=${action}`);
    return reply({
      ...result.body,
      previewId,
      expiresAt: new Date(createdAt + PREVIEW_TTL_MS).toISOString(),
      next: "Báo anh Vũ nội dung message và hỏi có cập nhật không. Chỉ khi anh đồng ý mới gọi /review/commit với previewId này (trong 15 phút).",
    });
  }

  // commit
  const previewId = String(body.previewId || "");
  const entry = previews.get(previewId);
  const wantKind = path === "/review/commit" ? "review" : "statement";
  if (!entry || entry.kind !== wantKind) { log(request, url, 410); return reply({ error: "PREVIEW_NOT_FOUND", message: "previewId không tồn tại, sai loại hoặc đã hết hạn (15 phút) — gọi preview lại." }, 410); }
  previews.delete(previewId); // dùng một lần
  if (entry.kind === "review" && entry.review) {
    const result = await deps.reviewAction(entry.review, "apply", entry.stored);
    log(request, url, result.status, `action=${entry.review.action}`);
    return reply(result.body, result.status);
  }
  const result = await deps.importBankStatement(entry.fileName, entry.rows, "apply", entry.stored);
  if (result.status !== 200) { log(request, url, result.status); return reply(result.body, result.status); }
  const summary = result.body.summary as Record<string, number>;
  log(request, url, 200, `applied=${summary.applied} queued=${summary.queued}`);
  const described = describe(result.body.rows as BankImportRowOutcome[], summary);
  return reply({
    ok: true,
    fileName: entry.fileName,
    summary,
    ...described,
    message: `Đã cập nhật: ${described.message.replace("sẽ chuyển", "đã chuyển")}`,
  });
}

/** Chỉ dùng trong test. */
export function _resetOpsPreviews() { previews.clear(); }
