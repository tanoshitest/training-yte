/**
 * Nhật ký chi tiết (anh Mori 13/11/2026): mỗi dòng nhật ký nói rõ ai làm gì, và nếu là sửa
 * thì sửa trường nào "từ … thành …". Nhật ký chia theo nghiệp vụ: Học phí, Thông tin,
 * Điểm danh, Sao kê, Đối soát, Khác.
 *
 * Module thuần (không I/O): worker gọi `auditDetails` để so bản trước / bản sau của một
 * bản ghi, `auditCategoryOf` để xếp nghiệp vụ. Bản client (app.js) có cùng luật xếp
 * nghiệp vụ để phân loại các dòng nhật ký cũ chưa có `category`.
 */

export type AuditCategory = "TUITION" | "PROFILE" | "ATTENDANCE" | "STATEMENT" | "RECON" | "OTHER";

export interface AuditDetail {
  label: string;
  from: string;
  to: string;
}

/** Tra tên để nhật ký hiện "Nguyễn A" thay vì "student-import-0012". */
export interface AuditNames {
  student?: (id: string) => string | undefined;
  teacher?: (id: string) => string | undefined;
  cls?: (id: string) => string | undefined;
  room?: (id: string) => string | undefined;
  branch?: (id: string) => string | undefined;
}

export function buildAuditNames(input: {
  students?: Array<{ id: string; fullName?: string; code?: string }>;
  teachers?: Array<{ id: string; fullName?: string }>;
  classes?: Array<{ id: string; name?: string; code?: string }>;
  rooms?: Array<{ id: string; name?: string }>;
  branches?: Array<{ id: string; name?: string }>;
}): AuditNames {
  const map = <T extends { id: string }>(rows: T[] | undefined, label: (row: T) => string) => {
    const byId = new Map((rows || []).map((row) => [row.id, label(row)]));
    return (id: string) => byId.get(id);
  };
  return {
    student: map(input.students, (row) => `${row.fullName || row.id}${row.code ? ` (${row.code})` : ""}`),
    teacher: map(input.teachers, (row) => row.fullName || row.id),
    cls: map(input.classes, (row) => row.name || row.code || row.id),
    room: map(input.rooms, (row) => row.name || row.id),
    branch: map(input.branches, (row) => row.name || row.id),
  };
}

const MAX_DETAILS = 60;
const MAX_TEXT = 160;

function clip(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

function money(value: unknown) {
  const n = Math.round(Number(value) || 0);
  return `${n.toLocaleString("vi-VN")}đ`;
}

function yesNo(value: unknown) {
  return value ? "Có" : "Không";
}

function plain(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return yesNo(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function dateVi(value: unknown) {
  const text = String(value || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : text;
}

const STUDENT_STATUS: Record<string, string> = { UNASSIGNED: "Chưa xếp lớp", STUDYING: "Đang học", STOPPED: "Đã nghỉ" };
const CLASS_STATUS: Record<string, string> = { ACTIVE: "Đang học", PAUSED: "Tạm dừng", COMPLETED: "Đã kết thúc", CLOSED: "Đã đóng", PLANNED: "Sắp mở" };
const SESSION_STATUS: Record<string, string> = { SCHEDULED: "Chưa điểm danh", COMPLETED: "Đã điểm danh", CANCELLED: "Đã huỷ" };
const ATTENDANCE: Record<string, string> = { PRESENT: "Có mặt", ABSENT: "Vắng", EXCUSED: "Có phép" };
const LESSON_RATING: Record<string, string> = { A_PLUS: "A+", A: "A", A_MINUS: "A-", B: "B" };
const HOMEWORK: Record<string, string> = { FULL_100: "100%", EIGHTY_80: "80%", BELOW_50: "Dưới 50%", ZERO_0: "0%" };
const WEEKDAY: Record<number, string> = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN" };
const BILLING: Record<string, string> = { MONTHLY: "Thu tháng", COURSE: "Thu khóa" };
const CASH_KIND: Record<string, string> = { IN: "Thu", OUT: "Chi" };

type FieldSpec = {
  label: string;
  show?: (value: unknown, names: AuditNames) => string;
  /** Record<classId, …>: so từng khoá, nhãn kèm tên lớp. */
  perClass?: boolean;
};

const enumOf = (labels: Record<string, string>) => (value: unknown) => labels[String(value)] || plain(value);
const nameOf = (kind: keyof AuditNames) => (value: unknown, names: AuditNames) => {
  const id = String(value || "");
  if (!id) return "";
  return names[kind]?.(id) || id;
};

const STUDENT_FIELDS: Record<string, FieldSpec> = {
  code: { label: "Mã học viên" },
  fullName: { label: "Họ tên" },
  dateOfBirth: { label: "Ngày sinh", show: dateVi },
  phone: { label: "Số điện thoại" },
  parentName: { label: "Phụ huynh" },
  parentPhone1: { label: "SĐT phụ huynh 1" },
  parentPhone2: { label: "SĐT phụ huynh 2" },
  parentZalo: { label: "Zalo phụ huynh" },
  address: { label: "Địa chỉ" },
  school: { label: "Trường" },
  nationalId: { label: "CCCD" },
  note: { label: "Ghi chú" },
  status: { label: "Trạng thái", show: enumOf(STUDENT_STATUS) },
  tuitionExempt: { label: "Miễn học phí", show: yesNo },
  loginEmail: { label: "Tài khoản đăng nhập" },
  tuitionCredits: { label: "Buổi khấu trừ", perClass: true },
  tuitionPaidThrough: { label: "Đã đóng đến tháng", perClass: true },
  classJoinedAt: { label: "Ngày vào lớp", perClass: true, show: dateVi },
};

const TEACHER_FIELDS: Record<string, FieldSpec> = {
  code: { label: "Mã giáo viên" },
  fullName: { label: "Họ tên" },
  phone: { label: "Số điện thoại" },
  email: { label: "Email" },
  address: { label: "Địa chỉ" },
  assignedClasses: { label: "Lớp phụ trách", show: (v) => (Array.isArray(v) ? v.join(", ") : plain(v)) },
};

const scheduleText = (value: unknown) => {
  if (!Array.isArray(value) || !value.length) return "";
  return value.map((slot: any) => {
    const range = slot.effectiveFrom || slot.effectiveTo ? ` (${slot.effectiveFrom ? `từ ${dateVi(slot.effectiveFrom)}` : ""}${slot.effectiveTo ? ` đến ${dateVi(slot.effectiveTo)}` : ""})` : "";
    return `${WEEKDAY[Number(slot.weekday)] || slot.weekday} ${slot.startTime}–${slot.endTime}${range}`;
  }).join("; ");
};

const CLASS_FIELDS: Record<string, FieldSpec> = {
  code: { label: "Mã lớp" },
  name: { label: "Tên lớp" },
  teacherId: { label: "Giáo viên chủ nhiệm", show: nameOf("teacher") },
  roomId: { label: "Phòng", show: nameOf("room") },
  branchId: { label: "Chi nhánh", show: nameOf("branch") },
  status: { label: "Trạng thái", show: enumOf(CLASS_STATUS) },
  schedules: { label: "Lịch học", show: scheduleText },
  note: { label: "Ghi chú" },
  billingMode: { label: "Hình thức thu", show: enumOf(BILLING) },
  sessionPrice: { label: "Học phí / buổi", show: money },
  courseSessions: { label: "Số buổi / khóa" },
  courseStartDate: { label: "Ngày bắt đầu khóa", show: dateVi },
  billingEnabled: { label: "Bật thu học phí", show: yesNo },
  classTypeId: { label: "Loại lớp" },
  syllabusId: { label: "Giáo trình" },
  tuitionPackageId: { label: "Gói học phí" },
  materialFees: { label: "Học liệu", show: (v) => (v && typeof v === "object" ? Object.entries(v as Record<string, any>).map(([m, fee]) => `${m}: ${money(fee?.amount)}${fee?.description ? ` ${fee.description}` : ""}`).join("; ") : plain(v)) },
};

const SESSION_FIELDS: Record<string, FieldSpec> = {
  date: { label: "Ngày học", show: dateVi },
  startTime: { label: "Giờ bắt đầu" },
  endTime: { label: "Giờ kết thúc" },
  teacherId: { label: "Giáo viên", show: nameOf("teacher") },
  roomId: { label: "Phòng", show: nameOf("room") },
  status: { label: "Trạng thái buổi", show: enumOf(SESSION_STATUS) },
  isOff: { label: "Nghỉ", show: yesNo },
  offSource: { label: "Nghỉ do", show: (v) => (v === "TEACHER" ? "Giáo viên" : v === "ADMIN" ? "Học vụ" : plain(v)) },
  noFee: { label: "Không tính phí", show: yesNo },
  isSubstitute: { label: "Dạy thay", show: yesNo },
  hasHomework: { label: "Có bài tập", show: yesNo },
  note: { label: "Ghi chú buổi" },
  makeupOf: { label: "Dạy bù cho buổi" },
};

const CASH_FIELDS: Record<string, FieldSpec> = {
  date: { label: "Ngày", show: dateVi },
  voucherDate: { label: "Ngày chứng từ", show: dateVi },
  kind: { label: "Loại", show: enumOf(CASH_KIND) },
  category: { label: "Hạng mục" },
  description: { label: "Nội dung" },
  amount: { label: "Số tiền", show: money },
  method: { label: "Hình thức" },
  branchId: { label: "Chi nhánh", show: nameOf("branch") },
  studentName: { label: "Học viên" },
};

const FORECAST_FIELDS: Record<string, FieldSpec> = {
  kind: { label: "Loại", show: enumOf({ IN: "Dự thu", OUT: "Dự chi" }) },
  description: { label: "Nội dung" },
  amount: { label: "Số tiền", show: money },
  dueDate: { label: "Ngày dự kiến", show: dateVi },
  date: { label: "Ngày", show: dateVi },
  note: { label: "Ghi chú" },
};

const USER_FIELDS: Record<string, FieldSpec> = {
  code: { label: "Mã" },
  fullName: { label: "Họ tên" },
  phone: { label: "Số điện thoại" },
  email: { label: "Email" },
  address: { label: "Địa chỉ" },
};

/** Trường do hệ thống tự tính / bí mật — không đưa vào nhật ký, và nếu chỉ chúng đổi thì
 * không ghi dòng "Cập nhật" vô nghĩa. */
const IGNORED: Record<string, Set<string>> = {
  Student: new Set(["id", "loginPassword", "sessionBalances"]),
  LessonSession: new Set(["id", "attendanceSubmittedAt", "assessmentColumns", "attendanceColumnOrder", "recurrenceKey", "classId", "isExtra"]),
  default: new Set(["id", "loginPassword", "password", "passwordHash"]),
};

const SPECS: Record<string, Record<string, FieldSpec>> = {
  Student: STUDENT_FIELDS,
  Teacher: TEACHER_FIELDS,
  Class: CLASS_FIELDS,
  LessonSession: SESSION_FIELDS,
  CashEntry: CASH_FIELDS,
  FinanceForecast: FORECAST_FIELDS,
  User: USER_FIELDS,
};

function same(a: unknown, b: unknown) {
  const norm = (v: unknown) => (v === undefined || v === null || v === "" ? "" : JSON.stringify(v));
  return norm(a) === norm(b);
}

function attendanceDetails(before: any, after: any, names: AuditNames): AuditDetail[] {
  const out: AuditDetail[] = [];
  const columns = new Map<string, string>([...(before?.assessmentColumns || []), ...(after?.assessmentColumns || [])].map((col: any) => [String(col.id), String(col.name || col.id)]));
  const prev = new Map<string, any>((before?.attendance || []).map((row: any) => [String(row.studentId), row]));
  const next = new Map<string, any>((after?.attendance || []).map((row: any) => [String(row.studentId), row]));
  const ids = [...new Set([...prev.keys(), ...next.keys()])];
  for (const id of ids) {
    const a = prev.get(id) || {};
    const b = next.get(id) || {};
    const who = names.student?.(id) || id;
    const push = (field: string, from: string, to: string) => {
      if (from !== to) out.push({ label: `${who} · ${field}`, from: clip(from || "(trống)"), to: clip(to || "(trống)") });
    };
    push("Điểm danh", ATTENDANCE[a.status] || plain(a.status), ATTENDANCE[b.status] || plain(b.status));
    if (Boolean(a.late) !== Boolean(b.late)) push("Đi muộn", yesNo(a.late), yesNo(b.late));
    push("Đánh giá buổi học", LESSON_RATING[a.lessonRating] || plain(a.lessonRating), LESSON_RATING[b.lessonRating] || plain(b.lessonRating));
    push("Bài tập", HOMEWORK[a.homeworkRating] || plain(a.homeworkRating), HOMEWORK[b.homeworkRating] || plain(b.homeworkRating));
    if (Boolean(a.pronunciationVideoDone) !== Boolean(b.pronunciationVideoDone)) push("Clip phát âm", yesNo(a.pronunciationVideoDone), yesNo(b.pronunciationVideoDone));
    if (Boolean(a.worksheetDone) !== Boolean(b.worksheetDone)) push("Worksheet", yesNo(a.worksheetDone), yesNo(b.worksheetDone));
    push("Từ vựng", plain(a.vocabularyScore), plain(b.vocabularyScore));
    const scoreIds = new Set([...Object.keys(a.assessmentScores || {}), ...Object.keys(b.assessmentScores || {})]);
    for (const col of scoreIds) push(columns.get(col) || "Điểm", plain(a.assessmentScores?.[col]), plain(b.assessmentScores?.[col]));
    push("Nhận xét", plain(a.note), plain(b.note));
  }
  return out;
}

/**
 * Danh sách thay đổi "từ … thành …" của một bản ghi. Trường lạ (chưa có nhãn) vẫn được
 * ghi với tên kỹ thuật để không sót thay đổi nào.
 */
export function auditDetails(entity: string, before: unknown, after: unknown, names: AuditNames = {}): AuditDetail[] {
  const a = (before || {}) as Record<string, unknown>;
  const b = (after || {}) as Record<string, unknown>;
  const specs = SPECS[entity] || {};
  const ignored = IGNORED[entity] || IGNORED.default;
  const out: AuditDetail[] = [];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  // Theo thứ tự nhãn đã khai báo trước, trường lạ sau.
  keys.sort((x, y) => {
    const ix = Object.keys(specs).indexOf(x);
    const iy = Object.keys(specs).indexOf(y);
    return (ix < 0 ? 999 : ix) - (iy < 0 ? 999 : iy);
  });
  for (const key of keys) {
    if (ignored.has(key)) continue;
    if (key === "loginPassword") continue;
    if (entity === "LessonSession" && key === "attendance") {
      out.push(...attendanceDetails(a, b, names));
      continue;
    }
    if (entity === "Class" && key === "studentIds") {
      const prev = new Set((a.studentIds as string[]) || []);
      const next = new Set((b.studentIds as string[]) || []);
      const added = [...next].filter((id) => !prev.has(id)).map((id) => names.student?.(id) || id);
      const removed = [...prev].filter((id) => !next.has(id)).map((id) => names.student?.(id) || id);
      if (added.length) out.push({ label: "Thêm học viên", from: "", to: clip(added.join(", ")) });
      if (removed.length) out.push({ label: "Bớt học viên", from: clip(removed.join(", ")), to: "" });
      continue;
    }
    if (same(a[key], b[key])) continue;
    const spec = specs[key];
    if (spec?.perClass && (a[key] || b[key]) && typeof (a[key] ?? b[key]) === "object") {
      const pa = (a[key] || {}) as Record<string, unknown>;
      const pb = (b[key] || {}) as Record<string, unknown>;
      for (const cid of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
        if (same(pa[cid], pb[cid])) continue;
        const show = spec.show || plain;
        out.push({ label: `${spec.label} · ${names.cls?.(cid) || cid}`, from: clip(show(pa[cid], names) || "(trống)"), to: clip(show(pb[cid], names) || "(trống)") });
      }
      continue;
    }
    const show = spec?.show || plain;
    out.push({ label: spec?.label || key, from: clip(show(a[key], names) || "(trống)"), to: clip(show(b[key], names) || "(trống)") });
  }
  return out.slice(0, MAX_DETAILS);
}

/** Có thay đổi đáng ghi không (bỏ qua trường hệ thống tự tính). */
export function auditHasMeaningfulChange(entity: string, before: unknown, after: unknown) {
  const a = (before || {}) as Record<string, unknown>;
  const b = (after || {}) as Record<string, unknown>;
  const ignored = IGNORED[entity] || IGNORED.default;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (ignored.has(key)) continue;
    if (entity === "LessonSession" && key === "attendance") {
      if (attendanceDetails(a, b, {}).length) return true;
      continue;
    }
    if (!same(a[key], b[key])) return true;
  }
  return false;
}

/** Xếp một dòng nhật ký vào nghiệp vụ. Giữ đúng luật với `auditCategoryOf` trong app.js. */
export function auditCategoryOf(row: { action?: string; entity?: string; summary?: string; category?: string }): AuditCategory {
  const known: AuditCategory[] = ["TUITION", "PROFILE", "ATTENDANCE", "STATEMENT", "RECON", "OTHER"];
  if (row.category && known.includes(row.category as AuditCategory)) return row.category as AuditCategory;
  const entity = String(row.entity || "");
  const summary = String(row.summary || "");
  if (row.action === "LOGIN") return "OTHER";
  if (entity === "Reconciliation" || /^(Đối soát|Gỡ đối soát|Duyệt khớp|Hoàn tác duyệt)/i.test(summary)) return "RECON";
  if (/sao kê|giao dịch lệch|thu vô danh/i.test(summary)) return "STATEMENT";
  if (entity === "LessonSession") return "ATTENDANCE";
  if (entity === "Invoice" || /học phí|thanh toán|biên lai|phiếu báo|hoá đơn|hóa đơn|webhook sepay|truy thu|thu trước/i.test(summary)) return "TUITION";
  if (entity === "Finance") return "TUITION";
  if (["Student", "Teacher", "Class", "User"].includes(entity)) return "PROFILE";
  return "OTHER";
}
