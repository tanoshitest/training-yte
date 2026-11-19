/**
 * Đăng nhập Portal cho học viên + giới hạn dữ liệu học viên được thấy.
 *
 * - Mật khẩu học viên lưu dạng băm PBKDF2-SHA256 (`pbkdf2$<vòng>$<salt>$<hash>`) trong cột
 *   `loginPassword` sẵn có. Mật khẩu cũ lưu chữ thường (trước bản này) vẫn đăng nhập được và
 *   được băm lại ở lần lưu kế tiếp.
 * - Mọi phản hồi JSON xóa trắng `loginPassword` (xem repairLegacyEncoding ở worker) nên trình
 *   duyệt admin không còn nhận mật khẩu; khi admin lưu với ô trống thì giữ nguyên mật khẩu cũ.
 * - Phiên STUDENT chỉ gọi được vài API (STUDENT_API_ALLOW) và bootstrap chỉ chứa dữ liệu của
 *   chính học viên đó: hồ sơ của em, lớp của em, buổi học của lớp (điểm danh chỉ dòng của em),
 *   chương trình Portal gán cho lớp.
 */

const PBKDF2_ROUNDS = 100_000;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, rounds: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds }, key, 256);
  return new Uint8Array(bits);
}

export function isHashedPassword(value: unknown) {
  return typeof value === "string" && /^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(value);
}

export async function hashStudentPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ROUNDS);
  return `pbkdf2$${PBKDF2_ROUNDS}$${toBase64(salt)}$${toBase64(hash)}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index]! ^ b[index]!;
  return diff === 0;
}

export async function verifyStudentPassword(password: string, stored: unknown) {
  if (!password || typeof stored !== "string" || !stored) return false;
  if (!isHashedPassword(stored)) {
    // Mật khẩu cũ lưu chữ thường: so sánh thời gian cố định.
    return sameBytes(encoder.encode(password), encoder.encode(stored));
  }
  const [, rounds, salt, hash] = stored.split("$");
  const expected = fromBase64(hash!);
  const actual = await derive(password, fromBase64(salt!), Number(rounds));
  return sameBytes(actual, expected);
}

/**
 * Chuẩn hóa mật khẩu trước khi ghi: ô trống → giữ mật khẩu đang lưu; chữ thường → băm;
 * đã băm → giữ nguyên. Xóa email đăng nhập thì xóa luôn mật khẩu.
 */
export async function resolveStudentPassword(incoming: unknown, stored: unknown, loginEmail: unknown) {
  if (!String(loginEmail || "").trim()) return "";
  const value = typeof incoming === "string" ? incoming : "";
  if (!value) return typeof stored === "string" ? stored : "";
  if (isHashedPassword(value)) return value;
  return hashStudentPassword(value);
}

type LoginStudent = { id: string; fullName: string; status?: string; loginEmail?: string; loginPassword?: string };

/** Học viên có email đăng nhập này (không phân biệt hoa thường), chưa nghỉ học. Trùng email → không cho đăng nhập. */
export function findStudentByLogin<T extends LoginStudent>(students: T[], email: string) {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return undefined;
  const matches = students.filter((row) => String(row.loginEmail || "").trim().toLowerCase() === wanted);
  if (matches.length !== 1) return undefined;
  const student = matches[0]!;
  if (student.status === "STOPPED" || !student.loginPassword) return undefined;
  return student;
}

// Chặn dò mật khẩu: 8 lần sai trong 15 phút cho một email thì khóa tạm.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;
const loginFails = new Map<string, number[]>();

export function studentLoginLocked(email: string, now = Date.now()) {
  const recent = (loginFails.get(email) || []).filter((at) => now - at < LOGIN_WINDOW_MS);
  loginFails.set(email, recent);
  return recent.length >= LOGIN_MAX_FAILS;
}

export function recordStudentLoginFail(email: string, now = Date.now()) {
  const recent = (loginFails.get(email) || []).filter((at) => now - at < LOGIN_WINDOW_MS);
  recent.push(now);
  loginFails.set(email, recent);
  if (loginFails.size > 5000) loginFails.delete(loginFails.keys().next().value!);
}

export function clearStudentLoginFails(email: string) {
  loginFails.delete(email);
}

/** API phiên học viên được gọi. Mọi API khác trả 403. */
export function studentApiAllowed(method: string, pathname: string) {
  if (method === "GET" && (pathname === "/api/bootstrap" || pathname === "/api/finance")) return true;
  if (method === "GET" && /^\/api\/syllabuses\/[^/]+$/.test(pathname)) return true;
  if (method === "GET" && /^\/api\/portal\/qr\/[^/]+$/.test(pathname)) return true;
  if (method === "POST" && (pathname === "/api/progress" || pathname === "/api/activity-attempts" || pathname === "/api/portal/read-check")) return true;
  return false;
}

type Row = Record<string, unknown> & { id: string };

/** Bootstrap rút gọn cho học viên: chỉ dữ liệu của chính em. */
export function studentBootstrapView(payload: Record<string, unknown>, studentId: string) {
  const students = (payload.students as Row[]) || [];
  const me = students.find((row) => row.id === studentId);
  const classes = ((payload.classes as Row[]) || []).filter((row) => ((row.studentIds as string[]) || []).includes(studentId));
  const classIds = new Set(classes.map((row) => row.id));
  const teacherIds = new Set(classes.map((row) => String(row.teacherId || "")));
  const portalIds = new Set(classes.map((row) => String(row.syllabusId || "")).filter(Boolean));
  const syllabuses = ((payload.syllabuses as Row[]) || []).filter((row) => portalIds.has(row.id));
  const sessions = ((payload.lessonSessions as Row[]) || [])
    .filter((row) => classIds.has(String(row.classId)))
    .map((row) => ({ ...row, attendance: ((row.attendance as Row[]) || []).filter((item) => item.studentId === studentId) }));
  const student = (payload.student as Record<string, unknown>) || {};
  return {
    ...payload,
    student: { ...student, id: studentId, name: me?.fullName || student.name, activeSyllabusId: syllabuses[0]?.id || "" },
    syllabuses,
    students: me ? [{
      id: me.id, code: me.code, fullName: me.fullName, school: me.school, status: me.status, dateOfBirth: me.dateOfBirth,
      parentName: me.parentName, loginEmail: me.loginEmail, tuitionExempt: me.tuitionExempt, classJoinedAt: me.classJoinedAt,
      sessionBalances: me.sessionBalances,
    }] : [],
    classes: classes.map((row) => ({ ...row, studentIds: [studentId] })),
    teachers: ((payload.teachers as Row[]) || []).filter((row) => teacherIds.has(row.id)).map((row) => ({ id: row.id, fullName: row.fullName })),
    accountants: [],
    assistants: [],
    audits: [],
    reconLocks: [],
    statementImports: [],
    staffSettings: null,
    lessonSessions: sessions,
    auditLogs: [],
    integrations: null,
    zaloMessages: null,
    payrollConfig: null,
  };
}
