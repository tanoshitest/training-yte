import "dotenv/config";

import { diffJson } from "./kv-relational-diff";

/**
 * Đối chiếu ứng dụng chạy trên hai tầng lưu trữ: một tiến trình dùng kho JSON cũ,
 * một tiến trình dùng bảng quan hệ. Hai tiến trình trỏ vào hai bản sao database
 * giống hệt nhau nên mọi khác biệt đều đến từ tầng lưu trữ.
 *
 *   tsx scripts/compare-storage-modes.ts http://127.0.0.1:3101 http://127.0.0.1:3102
 */

const [kvBase, relationalBase] = process.argv.slice(2);
if (!kvBase || !relationalBase) throw new Error("Cần hai địa chỉ: <app kho JSON> <app bảng quan hệ>.");

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password) throw new Error("Thiếu SEED_ADMIN_EMAIL hoặc SEED_ADMIN_PASSWORD.");

const readEndpoints = [
  "/api/bootstrap",
  "/api/students",
  "/api/classes",
  "/api/lesson-sessions",
  "/api/teachers",
  "/api/accountants",
  "/api/assistants",
  "/api/settings",
  "/api/finance",
  "/api/audit-logs",
  "/api/syllabuses",
];

/** Định danh và thời điểm do từng tiến trình tự sinh, che đi để so phần nghiệp vụ. */
function mask(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<thời-điểm>")
      .replace(/\bHP[A-Z0-9]{6,10}\b/g, "<mã-thu>")
      .replace(/\b[a-z]+-m[a-z0-9]{7}-[a-z0-9]{8}\b/g, "<id-sinh-tự-động>");
  }
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, mask(item)]));
  }
  return value;
}

interface Session {
  base: string;
  cookie: string;
}

async function login(base: string): Promise<Session> {
  const response = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Đăng nhập thất bại ở ${base}: ${response.status} ${await response.text()}`);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error(`Không nhận được cookie phiên ở ${base}.`);
  return { base, cookie };
}

async function call(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(`${session.base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: session.cookie, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* giữ nguyên chuỗi khi không phải JSON */ }
  return { status: response.status, body };
}

let failures = 0;

function compare(label: string, left: unknown, right: unknown) {
  const differences = diffJson(mask(left), mask(right));
  if (differences.length === 0) {
    console.log(`  ✔ ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ✘ ${label}: ${differences.length} khác biệt`);
  for (const difference of differences.slice(0, 10)) {
    console.log(`      ${difference.path}\n        kho JSON:   ${difference.left}\n        bảng quan hệ: ${difference.right}`);
  }
}

async function compareCall(label: string, path: string, init: RequestInit = {}) {
  const [left, right] = await Promise.all([call(kvSession, path, init), call(relationalSession, path, init)]);
  compare(`${label} (${left.status}/${right.status})`, left, right);
  return { left, right };
}

/**
 * Dựng thân yêu cầu từ trạng thái của **chính** tiến trình đó. Nếu lấy trạng thái
 * của tiến trình này đẩy sang tiến trình kia thì các định danh tự sinh sẽ lẫn sang
 * nhau và lần chạy sau không còn đối chiếu được.
 */
async function compareCallEach(label: string, path: string, buildInit: (session: Session) => Promise<RequestInit>) {
  const [left, right] = await Promise.all([
    buildInit(kvSession).then((init) => call(kvSession, path, init)),
    buildInit(relationalSession).then((init) => call(relationalSession, path, init)),
  ]);
  compare(`${label} (${left.status}/${right.status})`, left, right);
  return { left, right };
}

let kvSession: Session;
let relationalSession: Session;

async function main() {
  kvSession = await login(kvBase);
  relationalSession = await login(relationalBase);

  console.log("== Đối chiếu dữ liệu đọc ==");
  for (const path of readEndpoints) await compareCall(path, path);

  console.log("\n== Đối chiếu các thao tác ghi ==");

  // 1. Sửa hồ sơ một học viên: đổi ghi chú rồi trả lại như cũ.
  const studentsOf = async (session: Session) => (await call(session, "/api/students")).body as { items: Record<string, unknown>[] };
  await compareCallEach("PUT /api/students (sửa ghi chú)", "/api/students", async (session) => {
    const before = await studentsOf(session);
    const items = before.items.map((row, index) => index === 0 ? { ...row, note: "Ghi chú đối chiếu tầng lưu trữ" } : row);
    return { method: "PUT", body: JSON.stringify({ items }) };
  });
  await compareCall("GET /api/students sau khi sửa", "/api/students");
  await compareCallEach("PUT /api/students (trả lại ghi chú cũ)", "/api/students", async (session) => {
    const before = await studentsOf(session);
    const items = before.items.map((row, index) => index === 0 ? { ...row, note: "" } : row);
    return { method: "PUT", body: JSON.stringify({ items }) };
  });

  // 2. Điểm danh một buổi học: đổi ghi chú của dòng điểm danh đầu tiên.
  const sessionWithAttendance = async (session: Session) => {
    const sessions = (await call(session, "/api/lesson-sessions")).body as { items: Record<string, unknown>[] };
    return sessions.items.find((row) => Array.isArray(row.attendance) && (row.attendance as unknown[]).length > 0);
  };
  await compareCallEach("POST /api/lesson-sessions/upsert (điểm danh)", "/api/lesson-sessions/upsert", async (session) => {
    const item = await sessionWithAttendance(session);
    const attendance = (item?.attendance as Record<string, unknown>[]).map((row, index) => index === 0 ? { ...row, note: "Đối chiếu điểm danh" } : row);
    return { method: "POST", body: JSON.stringify({ item: { ...item, attendance } }) };
  });
  await compareCall("GET /api/lesson-sessions sau điểm danh", "/api/lesson-sessions");
  await compareCallEach("POST /api/lesson-sessions/upsert (trả lại ghi chú cũ)", "/api/lesson-sessions/upsert", async (session) => {
    const item = await sessionWithAttendance(session);
    const attendance = (item?.attendance as Record<string, unknown>[]).map((row, index) => index === 0 ? { ...row, note: "" } : row);
    return { method: "POST", body: JSON.stringify({ item: { ...item, attendance } }) };
  });

  // 3. Tạo phiếu chi thủ công trong sổ thu chi rồi xóa đi.
  const voucher = {
    id: "cash-doi-chieu-tang-luu-tru",
    date: new Date().toISOString().slice(0, 10),
    kind: "OUT",
    source: "MANUAL",
    category: "Văn phòng phẩm",
    description: "Phiếu chi đối chiếu tầng lưu trữ",
    amount: 123_000,
    method: "Tiền mặt",
  };
  await compareCallEach("PUT /api/finance (thêm phiếu chi)", "/api/finance", async (session) => {
    const finance = (await call(session, "/api/finance")).body as { finance: { cashbook: Record<string, unknown>[] } };
    return { method: "PUT", body: JSON.stringify({ cashbook: [voucher, ...finance.finance.cashbook] }) };
  });
  await compareCall("GET /api/finance sau khi thêm phiếu chi", "/api/finance");
  await compareCall("DELETE phiếu chi vừa thêm", `/api/finance/cashbook/${encodeURIComponent(voucher.id)}`, { method: "DELETE" });

  // 4. Thu học phí một học viên đang còn nợ.
  // Dữ liệu thật có khoản phải thu trỏ tới học viên đã bị xóa; chọn khoản thu được thật.
  const collectable = async (session: Session) => {
    const finance = (await call(session, "/api/finance")).body as {
      finance: { sepay: { receivables: { studentId: string; classId?: string; balanceDue: number }[] } };
    };
    const students = (await call(session, "/api/students")).body as { items: { id: string; tuitionExempt?: boolean }[] };
    const classes = (await call(session, "/api/classes")).body as { items: { id: string; studentIds: string[] }[] };
    return finance.finance.sepay.receivables.find((row) => {
      if (!(row.balanceDue > 0) || !row.classId) return false;
      const student = students.items.find((item) => item.id === row.studentId);
      const cls = classes.items.find((item) => item.id === row.classId);
      return Boolean(student) && !student?.tuitionExempt && Boolean(cls?.studentIds.includes(row.studentId));
    });
  };
  if (await collectable(kvSession)) {
    await compareCallEach("POST /api/finance/sepay (thu học phí)", "/api/finance/sepay", async (session) => {
      const owing = await collectable(session);
      return {
        method: "POST",
        body: JSON.stringify({ action: "collect", studentId: owing?.studentId, classId: owing?.classId, method: "CASH", note: "Thu đối chiếu tầng lưu trữ" }),
      };
    });
    await compareCall("GET /api/finance sau khi thu", "/api/finance");
    await compareCall("GET /api/students sau khi thu", "/api/students");
  } else {
    console.log("  ⚠ Không tìm thấy khoản còn nợ để thử thu học phí.");
  }

  console.log(failures ? `\nKẾT QUẢ: ${failures} phép đối chiếu còn khác biệt.` : "\nKẾT QUẢ: hai tầng lưu trữ cho kết quả giống nhau ở mọi phép đối chiếu.");
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
