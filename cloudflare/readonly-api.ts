/**
 * API CHỈ ĐỌC cho trợ lý AI bên ngoài: GET /api/v1/readonly/...
 *
 * - Chỉ GET. Mọi method khác → 405. Không có đường nào ghi dữ liệu: kho dữ liệu được
 *   bọc lại chỉ còn `get` (put/delete ném lỗi), nên kể cả lỗi lập trình cũng không ghi được.
 * - Xác thực "Authorization: Bearer <token>" so với env LMS_READONLY_API_TOKEN (so sánh
 *   thời gian hằng). Chưa cấu hình token → mọi request đều 401 (API tắt). Không log token.
 * - Không trả mật khẩu/đăng nhập, CCCD, tài khoản nhân viên, cấu hình tích hợp, lương.
 * - Số liệu học phí tính trong bộ nhớ từ cùng hàm của hệ thống (syncTuitionReceivables,
 *   studentCourseCollectStates, courseRemainingSessions) — không lưu lại kết quả.
 */
import type { DemoClass, DemoLessonSession, DemoPeriodicReport } from "./operations-types";
import type { DemoStudent, DemoTeacher } from "./people-types";
import type { DemoFinance } from "./finance-types";
import { mergeSepayLedger, type SepayLedger } from "./sepay-engine";
import { courseRemainingSessions, studentCourseCollectStates, syncTuitionReceivables } from "./tuition-billing";

interface ReadonlyKv { get<T = unknown>(key: string, type: "json"): Promise<T | null> }
export interface ReadonlyEnv {
  STEPS_LMS_DATA: { get: ReadonlyKv["get"] };
  LMS_READONLY_API_TOKEN?: string;
}

export const READONLY_PREFIX = "/api/v1/readonly";
const MAX_LIMIT = 500;
const MAX_RANGE_DAYS = 93;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function reply(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}

/** Kho dữ liệu chỉ còn quyền đọc. */
function readOnlyStore(env: ReadonlyEnv): ReadonlyKv {
  const source = env.STEPS_LMS_DATA;
  return Object.freeze({ get: <T,>(key: string, type: "json") => source.get<T>(key, type) as Promise<T | null> });
}

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** So sánh token thời gian hằng (băm trước để không lộ độ dài). */
async function tokenMatches(given: string, expected: string) {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

type AuthFailReason = "API_DISABLED" | "MISSING_HEADER" | "NOT_BEARER" | "TOKEN_MISMATCH";
interface AuthCheck {
  ok: boolean;
  reason?: AuthFailReason;
  /** Chẩn đoán an toàn — không bao giờ chứa token: độ dài, có phải mã tham chiếu bí mật
   * "hsurr:" (trợ lý chưa thay giá trị thật), 8 ký tự đầu SHA-256 của chuỗi nhận được. */
  received: { length: number; startsWithHsurr: boolean; sha256_8: string };
  expectedSha256_8: string;
}

const hex8 = async (text: string) => (text ? [...(await sha256(text))].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("") : "");

async function checkAuth(request: Request, env: ReadonlyEnv): Promise<AuthCheck> {
  const expected = String(env.LMS_READONLY_API_TOKEN || "").trim();
  const header = (request.headers.get("Authorization") || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match ? match[1].trim() : header;
  const received = {
    length: token.length,
    startsWithHsurr: /^hsurr:/i.test(header) || /^hsurr:/i.test(token),
    sha256_8: await hex8(token),
  };
  const base = { received, expectedSha256_8: await hex8(expected) };
  if (expected.length < 16) return { ok: false, reason: "API_DISABLED", ...base }; // chưa cấu hình → API tắt
  if (!header) return { ok: false, reason: "MISSING_HEADER", ...base };
  if (!match) return { ok: false, reason: "NOT_BEARER", ...base };
  if (!(await tokenMatches(token, expected))) return { ok: false, reason: "TOKEN_MISMATCH", ...base };
  return { ok: true, ...base };
}

const AUTH_HINTS: Record<AuthFailReason, string> = {
  API_DISABLED: "API chưa bật trên server (thiếu LMS_READONLY_API_TOKEN).",
  MISSING_HEADER: "Thiếu header Authorization. Gửi: Authorization: Bearer <token>.",
  NOT_BEARER: "Header Authorization phải có dạng: Bearer <token>.",
  TOKEN_MISMATCH: "Token không đúng.",
};

/** Một dòng log an toàn cho mỗi request (không có token, không có query). */
function logRequest(request: Request, url: URL, status: number, auth?: AuthCheck) {
  const parts = [`[readonly-api] ${new Date().toISOString()} ${request.method} ${url.pathname} -> ${status}`];
  if (auth && !auth.ok) {
    parts.push(`reason=${auth.reason} len=${auth.received.length} hsurr=${auth.received.startsWithHsurr ? "yes" : "no"} recvSha8=${auth.received.sha256_8 || "-"} envSha8=${auth.expectedSha256_8 || "-"}`);
  }
  console.log(parts.join(" "));
}

// ---------- tiện ích ----------
const fold = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
const upper = (value: unknown) => String(value ?? "").toUpperCase().trim();
const money = (value: unknown) => Math.round(Number(value) || 0);
const isDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

function vnToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** ISO (UTC) → ngày giờ Việt Nam "YYYY-MM-DD HH:mm". */
function vnTime(iso: unknown) {
  const date = new Date(String(iso || ""));
  if (Number.isNaN(date.getTime())) return String(iso || "");
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

function vnDateOf(iso: unknown) {
  return vnTime(iso).slice(0, 10);
}

class BadRequest extends Error {}

function dateRange(url: URL, defaultDays: number) {
  const today = vnToday();
  const to = url.searchParams.get("to");
  const from = url.searchParams.get("from");
  if ((to && !isDate(to)) || (from && !isDate(from))) throw new BadRequest("from/to phải dạng YYYY-MM-DD");
  const end = to || today;
  const start = from || new Date(Date.parse(`${end}T00:00:00Z`) - (defaultDays - 1) * 86_400_000).toISOString().slice(0, 10);
  if (start > end) throw new BadRequest("from phải trước hoặc bằng to");
  if ((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 > MAX_RANGE_DAYS) throw new BadRequest(`Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày`);
  return { from: start, to: end };
}

function page<T>(rows: T[], url: URL) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  return { total: rows.length, limit, offset, items: rows.slice(offset, offset + limit) };
}

// ---------- tải dữ liệu (một lần mỗi request) ----------
interface Snapshot {
  appDebt?: (student: DemoStudent, cls: DemoClass) => number;
  debtComputedAt?: string;
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
  teachers: DemoTeacher[];
  finance: DemoFinance;
  settings: { branches?: Array<{ id: string; name?: string }> } & Record<string, unknown>;
  now: Date;
  ledgerCache?: SepayLedger;
}

async function loadSnapshot(store: ReadonlyKv, now = new Date()): Promise<Snapshot> {
  const [students, classes, sessions, teachers, finance, settings] = await Promise.all([
    store.get<DemoStudent[]>("students:steps-demo", "json"),
    store.get<DemoClass[]>("classes:steps-demo", "json"),
    store.get<DemoLessonSession[]>("sessions:steps-demo", "json"),
    store.get<DemoTeacher[]>("teachers:steps-demo", "json"),
    store.get<DemoFinance>("finance:steps-demo", "json"),
    store.get<Record<string, unknown>>("settings:steps-demo", "json"),
  ]);
  return {
    students: Array.isArray(students) ? students : [],
    classes: Array.isArray(classes) ? classes : [],
    sessions: Array.isArray(sessions) ? sessions : [],
    teachers: Array.isArray(teachers) ? teachers : [],
    finance: (finance && typeof finance === "object" ? finance : { cashbook: [] }) as DemoFinance,
    settings: (settings && typeof settings === "object" ? settings : {}) as Snapshot["settings"],
    now,
  };
}

/** Sổ học phí đã đồng bộ như app hiển thị — tính trên bản sao, không lưu. */
function ledgerOf(snap: Snapshot): SepayLedger {
  if (!snap.ledgerCache) {
    const base = mergeSepayLedger(structuredClone(snap.finance.sepay || null) as SepayLedger | null);
    snap.ledgerCache = syncTuitionReceivables(base, structuredClone(snap.classes), structuredClone(snap.students), snap.sessions, snap.now);
  }
  return snap.ledgerCache;
}

/**
 * Công nợ đúng như màn hình Quản lý học phí: chạy chính hàm tuitionEffectiveDebt của
 * app.js (lớp thu tháng có nhiều quy tắc — truy thu, phiếu gộp tháng, thu một phần —
 * nên không viết lại để tránh lệch số). Tính trong worker thread riêng để không chặn
 * luồng chính của server (tính toàn trung tâm mất vài giây). Kết quả toàn trung tâm
 * giữ 60 giây. Không chạy được worker (môi trường không phải Node) → lùi về số theo phiếu.
 */
const DEBT_WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");
const fs = require("node:fs");
const source = fs.readFileSync(workerData.appPath, "utf8").replace(/\\nbootstrap\\(\\);\\s*$/, "")
  + "\\nglobalThis.__ro = { state, tuitionEffectiveDebt };\\n";
const noop = () => {};
const context = vm.createContext({
  console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
  document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: noop },
  location: { pathname: "/" }, history: { pushState: noop, replaceState: noop },
  setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Intl, Date, URL, URLSearchParams,
});
vm.runInContext(source, context);
const app = context.__ro;
app.state.role = "ADMIN";
app.state.data = workerData.data;
const students = new Map(workerData.data.students.map((row) => [row.id, row]));
const classes = new Map(workerData.data.classes.map((row) => [row.id, row]));
const out = {};
for (const [studentId, classId] of workerData.pairs) {
  out[studentId + "|" + classId] = Math.max(0, Math.round(Number(app.tuitionEffectiveDebt(students.get(studentId), classes.get(classId))) || 0));
}
parentPort.postMessage(out);
`;
const DEBT_TIMEOUT_MS = 60_000;
const ALL_DEBTS_TTL_MS = 60_000;
let allDebtsCache: { at: number; value: Promise<Map<string, number> | undefined> } | undefined;

async function runDebtWorker(snap: Snapshot, pairs: Array<[string, string]>): Promise<Map<string, number> | undefined> {
  try {
    const { Worker } = await import("node:worker_threads");
    const { resolve } = await import("node:path");
    const data = {
      user: { role: "ADMIN" }, students: snap.students, classes: snap.classes, lessonSessions: snap.sessions,
      finance: { ...snap.finance, sepay: ledgerOf(snap) }, settings: snap.settings, teachers: snap.teachers,
    };
    const worker = new Worker(DEBT_WORKER_SOURCE, { eval: true, workerData: { appPath: resolve(process.cwd(), "cloudflare", "public", "app.js"), data, pairs } });
    return await new Promise((done) => {
      const timer = setTimeout(() => { void worker.terminate(); done(undefined); }, DEBT_TIMEOUT_MS);
      worker.once("message", (value: Record<string, number>) => { clearTimeout(timer); void worker.terminate(); done(new Map(Object.entries(value))); });
      worker.once("error", () => { clearTimeout(timer); done(undefined); });
      worker.once("exit", () => { clearTimeout(timer); done(undefined); });
    });
  } catch {
    return undefined;
  }
}

function allPairs(snap: Snapshot): Array<[string, string]> {
  const known = new Set(snap.students.map((row) => row.id));
  return snap.classes.flatMap((c) => (c.studentIds || []).filter((id) => known.has(id)).map((id): [string, string] => [id, c.id]));
}

/** Nạp công nợ theo app cho các cặp học viên-lớp cần; all=true dùng bộ đệm toàn trung tâm. */
async function attachAppDebt(snap: Snapshot, pairs: Array<[string, string]> | "all") {
  let map: Map<string, number> | undefined;
  if (pairs === "all") {
    if (!allDebtsCache || Date.now() - allDebtsCache.at > ALL_DEBTS_TTL_MS) {
      allDebtsCache = { at: Date.now(), value: runDebtWorker(snap, allPairs(snap)) };
    }
    map = await allDebtsCache.value;
    if (!map) allDebtsCache = undefined;
  } else if (pairs.length) {
    map = await runDebtWorker(snap, pairs);
  }
  if (map) {
    const debts = map;
    snap.appDebt = (student, cls) => debts.get(`${student.id}|${cls.id}`) ?? 0;
    snap.debtComputedAt = allDebtsCache && pairs === "all" ? new Date(allDebtsCache.at).toISOString() : snap.now.toISOString();
  }
}

// ---------- định dạng thực thể (chỉ trường an toàn) ----------
function studentBrief(s: DemoStudent, snap: Snapshot) {
  return {
    code: s.code,
    fullName: s.fullName,
    status: s.status,
    classes: snap.classes.filter((c) => (c.studentIds || []).includes(s.id)).map((c) => c.code),
  };
}

function studentProfile(s: DemoStudent) {
  return {
    code: s.code,
    fullName: s.fullName,
    status: s.status,
    dateOfBirth: s.dateOfBirth || "",
    school: s.school || "",
    address: s.address || "",
    parentName: s.parentName || "",
    parentPhone1: s.parentPhone1 || s.phone || "",
    parentPhone2: s.parentPhone2 || "",
    parentZalo: s.parentZalo || "",
    note: s.note || "",
    tuitionExempt: Boolean(s.tuitionExempt),
  };
}

function teacherName(snap: Snapshot, id: string) {
  return snap.teachers.find((t) => t.id === id)?.fullName || "";
}

function branchName(snap: Snapshot, id: string) {
  return (snap.settings.branches || []).find((b) => b.id === id)?.name || id || "";
}

function classBrief(c: DemoClass, snap: Snapshot) {
  return {
    code: c.code,
    name: c.name,
    status: c.status,
    teacher: teacherName(snap, c.teacherId),
    branch: branchName(snap, c.branchId),
    billingMode: c.billingMode || "MONTHLY",
    sessionPrice: money(c.sessionPrice),
    courseSessions: c.courseSessions || null,
    courseStartDate: c.courseStartDate || "",
    studentCount: (c.studentIds || []).length,
    schedules: (c.schedules || []).map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime })),
  };
}

function receivableView(r: SepayLedger["receivables"][number]) {
  return {
    period: r.billingPeriod,
    billKey: r.billKey || "",
    amountDue: money(r.amountDue),
    amountPaid: money(r.amountPaid),
    balanceDue: money(r.balanceDue),
    status: r.status,
    issueDate: r.issueDate || "",
  };
}

/** Học phí của 1 học viên trong 1 lớp — cùng hàm với app. */
function tuitionOf(s: DemoStudent, c: DemoClass, snap: Snapshot) {
  const ledger = ledgerOf(snap);
  const receivables = ledger.receivables.filter((r) => r.studentId === s.id && r.classId === c.id && r.status !== "CANCELLED");
  const open = receivables.filter((r) => (r.status === "OPEN" || r.status === "PARTIALLY_PAID") && money(r.balanceDue) > 0);
  const course = (c.billingMode || "MONTHLY") === "COURSE";
  const courses = course
    ? studentCourseCollectStates(s, c, snap.sessions, ledger, snap.now).map((row) => ({ course: row.index, status: row.status, balanceDue: money(row.balanceDue) }))
    : undefined;
  const debt = s.tuitionExempt ? 0 : snap.appDebt ? snap.appDebt(s, c) : course
    ? (courses || []).filter((row) => row.status !== "FUTURE").reduce((sum, row) => sum + row.balanceDue, 0)
    : open.reduce((sum, r) => sum + money(r.balanceDue), 0);
  return {
    classCode: c.code,
    className: c.name,
    billingMode: course ? "COURSE" : "MONTHLY",
    tuitionExempt: Boolean(s.tuitionExempt),
    debt,
    openReceivablesTotal: open.reduce((sum, r) => sum + money(r.balanceDue), 0),
    remainingSessions: course ? courseRemainingSessions(s, c, snap.sessions, ledger, snap.now) : (s.sessionBalances?.[c.id] ?? null),
    courses,
    receivables: receivables.map(receivableView),
  };
}

function receiptView(r: SepayLedger["receipts"][number], snap: Snapshot) {
  const student = snap.students.find((s) => s.id === r.studentId);
  return {
    receiptNumber: r.receiptNumber,
    issuedAt: vnTime(r.issuedAt),
    amount: money(r.amount),
    status: r.status === "ISSUED" ? "ISSUED (đã vào sổ thu chi)" : "UNRECORDED (ghi nhận nội bộ)",
    method: r.method || "",
    studentCode: r.studentCode || student?.code || "",
    studentName: r.studentName || student?.fullName || "",
    classCode: snap.classes.find((c) => c.id === r.classId)?.code || "",
    period: r.billingPeriod || "",
    note: r.note || "",
  };
}

function sessionView(s: DemoLessonSession, snap: Snapshot, withAttendance: boolean) {
  const rows = s.attendance || [];
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const base = {
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    classCode: snap.classes.find((c) => c.id === s.classId)?.code || "",
    teacher: teacherName(snap, s.teacherId),
    status: s.status,
    isOff: Boolean(s.isOff),
    isExtra: Boolean(s.isExtra),
    isMakeup: Boolean(s.makeupOf),
    noFee: Boolean(s.noFee),
    isSubstitute: Boolean(s.isSubstitute),
    note: s.note || "",
    attendance: { present: count("PRESENT"), absent: count("ABSENT"), excused: count("EXCUSED"), unmarked: rows.filter((row) => !row.status).length },
  };
  if (!withAttendance) return base;
  return {
    ...base,
    students: rows.map((row) => {
      const st = snap.students.find((x) => x.id === row.studentId);
      return {
        studentCode: st?.code || "",
        studentName: st?.fullName || "",
        status: row.status,
        late: Boolean(row.late),
        lessonRating: row.lessonRating,
        homeworkRating: row.homeworkRating,
        pronunciationVideoDone: Boolean(row.pronunciationVideoDone),
        worksheetDone: Boolean(row.worksheetDone),
        vocabularyScore: row.vocabularyScore ?? null,
        scores: row.assessmentScores || {},
        note: row.note || "",
      };
    }),
  };
}

// ---------- endpoint ----------
const ENDPOINTS = [
  "GET /api/v1/readonly/summary — tổng quan: số học viên/lớp/GV, lịch hôm nay, tổng công nợ, thu chi hôm nay",
  "GET /api/v1/readonly/students?q=&status=&class=&limit=&offset= — danh sách học viên",
  "GET /api/v1/readonly/students/{mãHV} — hồ sơ, lớp, học phí từng lớp (khóa, nợ, tồn), biên lai, chuyên cần",
  "GET /api/v1/readonly/classes?q=&status= — danh sách lớp",
  "GET /api/v1/readonly/classes/{mãLớp} — chi tiết lớp, danh sách học viên kèm công nợ/tồn, lịch sắp tới",
  "GET /api/v1/readonly/teachers — giáo viên và lớp phụ trách",
  "GET /api/v1/readonly/sessions?from=&to=&class=&teacher=&attendance=1 — buổi học, điểm danh",
  "GET /api/v1/readonly/periodic-reports?class=&student= — báo cáo định kỳ",
  "GET /api/v1/readonly/finance/debts?class=&min= — công nợ học phí theo học viên-lớp",
  "GET /api/v1/readonly/finance/receipts?from=&to=&student=&class= — biên lai/phiếu thu học phí",
  "GET /api/v1/readonly/finance/cashbook?from=&to=&kind=IN|OUT&q= — sổ thu chi",
  "GET /api/v1/readonly/finance/bank-transactions?from=&to=&status= — giao dịch ngân hàng (sao kê/SePay)",
  "GET /api/v1/readonly/finance/recon?from=&to= — đối soát cuối ngày",
];

async function route(url: URL, store: ReadonlyKv): Promise<Response> {
  const path = url.pathname.slice(READONLY_PREFIX.length).replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (path === "/") return reply({ name: "STEPS LMS read-only API", version: 1, endpoints: ENDPOINTS });

  const snap = await loadSnapshot(store);
  const today = vnToday(snap.now);
  const debtSource = () => (snap.appDebt
    ? { debtSource: "Như màn hình Quản lý học phí", debtComputedAt: vnTime(snap.debtComputedAt) }
    : { debtSource: "Ước tính theo phiếu còn nợ (không tính được theo app)" });

  if (parts[0] === "summary" && parts.length === 1) {
    await attachAppDebt(snap, "all");
    const byStatus: Record<string, number> = {};
    for (const s of snap.students) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    const todaySessions = snap.sessions.filter((s) => s.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
    let totalDebt = 0;
    let debtors = 0;
    for (const c of snap.classes) {
      for (const id of c.studentIds || []) {
        const st = snap.students.find((s) => s.id === id);
        if (!st) continue;
        const debt = tuitionOf(st, c, snap).debt;
        totalDebt += debt;
        if (debt > 0) debtors += 1;
      }
    }
    const cashToday = (snap.finance.cashbook || []).filter((row) => row.date === today);
    const sum = (kind: string) => cashToday.filter((row) => row.kind === kind).reduce((total, row) => total + money(row.amount), 0);
    return reply({
      generatedAt: vnTime(snap.now.toISOString()),
      today,
      students: { total: snap.students.length, byStatus },
      classes: { total: snap.classes.length, active: snap.classes.filter((c) => c.status === "ACTIVE").length },
      teachers: snap.teachers.length,
      todaySessions: todaySessions.map((s) => sessionView(s, snap, false)),
      tuition: { totalDebt, studentClassPairsInDebt: debtors, ...debtSource() },
      cashbookToday: { in: sum("IN"), out: sum("OUT"), entries: cashToday.length },
    });
  }

  if (parts[0] === "students" && parts.length === 1) {
    const q = fold(url.searchParams.get("q"));
    const status = upper(url.searchParams.get("status"));
    const classCode = upper(url.searchParams.get("class"));
    const cls = classCode ? snap.classes.find((c) => upper(c.code) === classCode) : undefined;
    if (classCode && !cls) return reply({ error: "CLASS_NOT_FOUND" }, 404);
    const rows = snap.students
      .filter((s) => !status || upper(s.status) === status)
      .filter((s) => !cls || (cls.studentIds || []).includes(s.id))
      .filter((s) => !q || fold(s.fullName).includes(q) || fold(s.code).includes(q) || fold(s.parentName).includes(q) || String(s.parentPhone1 || s.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000"))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((s) => ({ ...studentBrief(s, snap), parentName: s.parentName || "", parentPhone1: s.parentPhone1 || s.phone || "" }));
    return reply(page(rows, url));
  }

  if (parts[0] === "students" && parts.length === 2) {
    const s = snap.students.find((row) => upper(row.code) === upper(parts[1]));
    if (!s) return reply({ error: "STUDENT_NOT_FOUND" }, 404);
    const classes = snap.classes.filter((c) => (c.studentIds || []).includes(s.id));
    await attachAppDebt(snap, classes.map((c): [string, string] => [s.id, c.id]));
    const ledger = ledgerOf(snap);
    const attended = snap.sessions.filter((x) => (x.attendance || []).some((row) => row.studentId === s.id));
    const recent = attended.filter((x) => x.date <= today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    const statusCount = (status: string) => attended.filter((x) => (x.attendance || []).some((row) => row.studentId === s.id && row.status === status)).length;
    return reply({
      profile: studentProfile(s),
      classes: classes.map((c) => classBrief(c, snap)),
      tuition: classes.map((c) => tuitionOf(s, c, snap)),
      ...debtSource(),
      receipts: ledger.receipts.filter((r) => r.studentId === s.id).sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt))).map((r) => receiptView(r, snap)),
      attendance: {
        present: statusCount("PRESENT"),
        absent: statusCount("ABSENT"),
        excused: statusCount("EXCUSED"),
        recent: recent.map((x) => {
          const row = (x.attendance || []).find((a) => a.studentId === s.id)!;
          return { date: x.date, classCode: snap.classes.find((c) => c.id === x.classId)?.code || "", status: row.status, late: Boolean(row.late), lessonRating: row.lessonRating, homeworkRating: row.homeworkRating, note: row.note || "" };
        }),
      },
    });
  }

  if (parts[0] === "classes" && parts.length === 1) {
    const q = fold(url.searchParams.get("q"));
    const status = upper(url.searchParams.get("status"));
    const rows = snap.classes
      .filter((c) => !status || upper(c.status) === status)
      .filter((c) => !q || fold(c.code).includes(q) || fold(c.name).includes(q))
      .sort((a, b) => String(a.code).localeCompare(String(b.code), "vi", { numeric: true }))
      .map((c) => classBrief(c, snap));
    return reply(page(rows, url));
  }

  if (parts[0] === "classes" && parts.length === 2) {
    const c = snap.classes.find((row) => upper(row.code) === upper(parts[1]));
    if (!c) return reply({ error: "CLASS_NOT_FOUND" }, 404);
    const roster = (c.studentIds || []).map((id) => snap.students.find((s) => s.id === id)).filter((s): s is DemoStudent => Boolean(s));
    await attachAppDebt(snap, roster.map((s): [string, string] => [s.id, c.id]));
    const upcoming = snap.sessions.filter((x) => x.classId === c.id && x.date >= today).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).slice(0, 10);
    const students = roster.map((s) => {
      const t = tuitionOf(s, c, snap);
      return { code: s.code, fullName: s.fullName, status: s.status, parentName: s.parentName || "", parentPhone1: s.parentPhone1 || s.phone || "", debt: t.debt, remainingSessions: t.remainingSessions, courses: t.courses };
    });
    return reply({
      class: classBrief(c, snap),
      note: c.note || "",
      totalDebt: students.reduce((sum, s) => sum + s.debt, 0),
      ...debtSource(),
      students,
      upcomingSessions: upcoming.map((x) => sessionView(x, snap, false)),
    });
  }

  if (parts[0] === "teachers" && parts.length === 1) {
    return reply({
      items: snap.teachers.map((t) => ({
        code: t.code,
        fullName: t.fullName,
        phone: t.phone || "",
        classes: snap.classes.filter((c) => c.teacherId === t.id).map((c) => ({ code: c.code, name: c.name, status: c.status })),
      })),
    });
  }

  if (parts[0] === "sessions" && parts.length === 1) {
    const { from, to } = dateRange(url, 7);
    const classCode = upper(url.searchParams.get("class"));
    const teacherQ = fold(url.searchParams.get("teacher"));
    const withAttendance = url.searchParams.get("attendance") === "1";
    const rows = snap.sessions
      .filter((x) => x.date >= from && x.date <= to)
      .filter((x) => !classCode || upper(snap.classes.find((c) => c.id === x.classId)?.code) === classCode)
      .filter((x) => !teacherQ || fold(teacherName(snap, x.teacherId)).includes(teacherQ))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
      .map((x) => sessionView(x, snap, withAttendance));
    return reply({ from, to, ...page(rows, url) });
  }

  if (parts[0] === "periodic-reports" && parts.length === 1) {
    const reports = (await store.get<DemoPeriodicReport[]>("periodic-reports:steps-demo", "json")) || [];
    const classCode = upper(url.searchParams.get("class"));
    const studentCode = upper(url.searchParams.get("student"));
    const rows = (Array.isArray(reports) ? reports : [])
      .map((r) => ({ r, cls: snap.classes.find((c) => c.id === r.classId), st: snap.students.find((s) => s.id === r.studentId) }))
      .filter(({ cls }) => !classCode || upper(cls?.code) === classCode)
      .filter(({ st }) => !studentCode || upper(st?.code) === studentCode)
      .sort((a, b) => String(b.r.updatedAt).localeCompare(String(a.r.updatedAt)))
      .map(({ r, cls, st }) => ({
        classCode: cls?.code || "", studentCode: st?.code || "", studentName: st?.fullName || "",
        periodType: r.periodType, periodLabel: r.periodLabel, fromDate: r.fromDate, toDate: r.toDate,
        scores: r.scores, attitudeComment: r.attitudeComment, skillComments: r.skillComments, comment: r.comment,
        updatedAt: vnTime(r.updatedAt),
      }));
    return reply(page(rows, url));
  }

  if (parts[0] === "finance" && parts.length === 2) {
    const ledger = ledgerOf(snap);
    if (parts[1] === "debts") {
      await attachAppDebt(snap, "all");
      const classCode = upper(url.searchParams.get("class"));
      const min = Math.max(1, Number(url.searchParams.get("min")) || 1);
      const rows: Array<Record<string, unknown> & { debt: number }> = [];
      for (const c of snap.classes) {
        if (classCode && upper(c.code) !== classCode) continue;
        for (const id of c.studentIds || []) {
          const s = snap.students.find((x) => x.id === id);
          if (!s) continue;
          const t = tuitionOf(s, c, snap);
          if (t.debt < min) continue;
          rows.push({ classCode: c.code, studentCode: s.code, studentName: s.fullName, parentName: s.parentName || "", parentPhone1: s.parentPhone1 || s.phone || "", debt: t.debt, remainingSessions: t.remainingSessions, courses: t.courses });
        }
      }
      rows.sort((a, b) => b.debt - a.debt);
      return reply({ totalDebt: rows.reduce((sum, r) => sum + r.debt, 0), ...debtSource(), ...page(rows, url) });
    }
    if (parts[1] === "receipts") {
      const { from, to } = dateRange(url, 31);
      const studentCode = upper(url.searchParams.get("student"));
      const classCode = upper(url.searchParams.get("class"));
      const rows = ledger.receipts
        .filter((r) => { const d = vnDateOf(r.issuedAt); return d >= from && d <= to; })
        .map((r) => receiptView(r, snap))
        .filter((r) => (!studentCode || upper(r.studentCode) === studentCode) && (!classCode || upper(r.classCode) === classCode))
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
      return reply({ from, to, totalAmount: rows.reduce((sum, r) => sum + r.amount, 0), ...page(rows, url) });
    }
    if (parts[1] === "cashbook") {
      const { from, to } = dateRange(url, 31);
      const kind = upper(url.searchParams.get("kind"));
      const q = fold(url.searchParams.get("q"));
      const rows = (snap.finance.cashbook || [])
        .filter((row) => row.date >= from && row.date <= to && (!kind || row.kind === kind))
        .filter((row) => !q || fold(`${row.description} ${row.category} ${row.studentName || ""}`).includes(q))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((row) => ({ date: row.date, voucherDate: (row as { voucherDate?: string }).voucherDate ? vnDateOf((row as { voucherDate?: string }).voucherDate) : "", kind: row.kind, category: row.category, description: row.description, amount: money(row.amount), method: row.method, studentName: row.studentName || "" }));
      const sum = (k: string, method?: string) => rows.filter((r) => r.kind === k && (!method || r.method === method)).reduce((total, r) => total + r.amount, 0);
      return reply({
        from, to,
        totals: { in: sum("IN"), out: sum("OUT"), inCash: sum("IN", "Tiền mặt"), inTransfer: sum("IN", "Chuyển khoản"), outCash: sum("OUT", "Tiền mặt"), outTransfer: sum("OUT", "Chuyển khoản") },
        ...page(rows, url),
      });
    }
    if (parts[1] === "bank-transactions") {
      const { from, to } = dateRange(url, 31);
      const status = upper(url.searchParams.get("status"));
      const rows = ledger.bankTransactions
        .filter((t) => { const d = vnDateOf(t.transactionDate || t.receivedAt); return d >= from && d <= to; })
        .filter((t) => !status || t.status === status)
        .sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)))
        .map((t) => {
          const pays = ledger.payments.filter((p) => p.bankTransactionId === t.id && p.status !== "VOIDED" && p.status !== "REFUNDED");
          return {
            transactionDate: vnTime(t.transactionDate), source: t.provider, amount: money(t.transferAmount), content: t.content,
            status: t.status, reviewReason: t.reviewReason || "",
            allocatedTo: pays.map((p) => { const st = snap.students.find((s) => s.id === p.studentId); return { studentCode: st?.code || "", studentName: st?.fullName || "", amount: money(p.allocatedAmount) }; }),
          };
        });
      return reply({ from, to, ...page(rows, url) });
    }
    if (parts[1] === "recon") {
      const { from, to } = dateRange(url, 31);
      const locks = (await store.get<Array<{ date: string; lockedBy?: string; lockedAt?: string }>>("recon-locks:steps-demo", "json")) || [];
      const days = (snap.finance.recon || []).filter((r) => r.date >= from && r.date <= to);
      return reply({
        from, to,
        lockedDays: (Array.isArray(locks) ? locks : []).filter((l) => l.date >= from && l.date <= to).map((l) => ({ date: l.date, lockedBy: l.lockedBy || "", lockedAt: l.lockedAt ? vnTime(l.lockedAt) : "" })),
        days,
      });
    }
  }

  return reply({ error: "NOT_FOUND", endpoints: ENDPOINTS }, 404);
}

/** Điểm vào duy nhất — worker gọi cho mọi đường dẫn bắt đầu bằng READONLY_PREFIX. */
export async function handleReadonlyApi(request: Request, env: ReadonlyEnv, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    logRequest(request, url, 405);
    return reply({ error: "METHOD_NOT_ALLOWED", message: "API chỉ đọc — chỉ hỗ trợ GET." }, 405, { Allow: "GET" });
  }
  const auth = await checkAuth(request, env);
  if (!auth.ok) {
    logRequest(request, url, 401, auth);
    const hint = auth.received.startsWithHsurr
      ? "Header đang chứa mã tham chiếu bí mật (hsurr:...) thay vì token thật — trợ lý cần thay giá trị bí mật vào header trước khi gửi."
      : AUTH_HINTS[auth.reason!];
    return reply({ error: "UNAUTHORIZED", reason: auth.reason, hint, received: auth.received }, 401, { "WWW-Authenticate": "Bearer" });
  }
  let status = 500;
  try {
    const response = await route(url, readOnlyStore(env));
    status = response.status;
    return response;
  } catch (error) {
    if (error instanceof BadRequest) { status = 400; return reply({ error: "BAD_REQUEST", message: error.message }, 400); }
    return reply({ error: "INTERNAL_ERROR" }, 500);
  } finally {
    logRequest(request, url, status);
  }
}
