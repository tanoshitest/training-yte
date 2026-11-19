/**
 * Nhập Excel danh sách học viên (file xuất từ trang Học viên, đã sửa / thêm dòng).
 * Nguyên tắc (chốt với trung tâm 25/10/2026): DỮ LIỆU CŨ LUÔN ĐƯỢC GIỮ.
 *  - Học viên đã có (khớp Mã HV, hoặc không có mã nhưng trùng tên + SĐT): chỉ điền
 *    các ô đang TRỐNG trên LMS. Ô đã có giá trị mà Excel ghi khác → giữ LMS, chỉ liệt kê.
 *    Không bao giờ đổi tên, mã, lớp, trạng thái, học phí, số buổi.
 *  - Dòng chưa có trên LMS → tạo hồ sơ mới, trạng thái Chưa xếp lớp. Cột Mã lớp bỏ qua
 *    (xếp lớp làm trên app vì phát sinh học phí / công nợ).
 */
import type { DemoStudent } from "./people-types";

export type ImportField = "parentName" | "parentPhone1" | "parentPhone2" | "nationalId" | "address" | "dateOfBirth" | "school";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  parentName: "Tên phụ huynh",
  parentPhone1: "SĐT 1",
  parentPhone2: "SĐT 2",
  nationalId: "CCCD",
  address: "Địa chỉ",
  dateOfBirth: "Ngày sinh",
  school: "Trường",
};

/** Ô "Tên phụ huynh" trống khi xuất được ghi câu này — đọc vào coi như trống. */
export const PARENT_PLACEHOLDER = "Khách hàng chưa cung cấp thông tin";

export type ImportRow = {
  line: number;
  code: string;
  fullName: string;
  values: Partial<Record<ImportField, string>>;
};

export type StudentImportPlan = {
  created: { line: number; student: DemoStudent }[];
  updated: { line: number; id: string; code: string; fullName: string; fields: { field: ImportField; label: string; value: string }[] }[];
  conflicts: { line: number; code: string; fullName: string; label: string; lms: string; excel: string }[];
  unchanged: number;
  warnings: string[];
  errors: string[];
  next: DemoStudent[];
};

const fold = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
const cell = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // File xuất là bảng HTML: một số trình đọc để nguyên thực thể HTML (&#039; …).
  return String(value ?? "").replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
};

/** Excel hay làm mất số 0 đầu của SĐT (lưu thành số) — trả lại 0 cho số 9 chữ số. */
export function normalizePhone(value: unknown) {
  const raw = cell(value);
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\d{9}$/.test(digits) && !digits.startsWith("0")) return `0${digits}`;
  if (/^\+?84\d{9}$/.test(digits)) return `0${digits.replace(/^\+?84/, "")}`;
  return digits || raw;
}

function normalizeDate(value: unknown) {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(Math.round((value - 25569) * 86400000));
    return date.toISOString().slice(0, 10);
  }
  const raw = cell(value);
  const vn = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (vn) return `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

const HEADERS: { key: "code" | "fullName" | "phones" | ImportField; names: string[] }[] = [
  { key: "code", names: ["ma hv", "ma hoc vien", "ma"] },
  { key: "fullName", names: ["ten hoc vien", "ten hv", "ho va ten", "ho ten", "ten hoc sinh"] },
  { key: "parentName", names: ["ten phu huynh", "phu huynh", "bo me"] },
  { key: "phones", names: ["so dien thoai", "sdt"] },
  { key: "parentPhone1", names: ["sdt 1", "so dien thoai 1"] },
  { key: "parentPhone2", names: ["sdt 2", "so dien thoai 2"] },
  { key: "nationalId", names: ["cccd", "can cuoc", "cmnd"] },
  { key: "address", names: ["dia chi"] },
  { key: "dateOfBirth", names: ["ngay sinh"] },
  { key: "school", names: ["truong", "truong hoc"] },
];

/** Đọc bảng (mảng dòng) → các dòng học viên. Tìm dòng tiêu đề có "Mã HV" và "Tên học viên". */
export function parseStudentSheet(rows: unknown[][]): { rows: ImportRow[]; error?: string } {
  const headerIndex = rows.findIndex((row) => {
    const names = (row || []).map(fold);
    return names.some((name) => HEADERS[0].names.includes(name)) && names.some((name) => HEADERS[1].names.includes(name));
  });
  if (headerIndex < 0) return { rows: [], error: "Không thấy dòng tiêu đề có cột \"Mã HV\" và \"Tên học viên\" — hãy dùng file xuất từ trang Học viên." };
  const columns = new Map<string, number>();
  (rows[headerIndex] || []).forEach((name, index) => {
    const folded = fold(name);
    const header = HEADERS.find((item) => item.names.includes(folded));
    if (header && !columns.has(header.key)) columns.set(header.key, index);
  });
  const get = (row: unknown[], key: string) => (columns.has(key) ? row[columns.get(key)!] : "");
  const out: ImportRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const code = cell(get(row, "code")).toUpperCase();
    const fullName = cell(get(row, "fullName"));
    if (!code && !fullName) continue;
    const values: Partial<Record<ImportField, string>> = {};
    const parent = cell(get(row, "parentName"));
    if (parent && fold(parent) !== fold(PARENT_PLACEHOLDER)) values.parentName = parent;
    const phones = cell(get(row, "phones")).split(/\s*[/;,|]\s*/).map(normalizePhone).filter(Boolean);
    const phone1 = normalizePhone(get(row, "parentPhone1")) || phones[0] || "";
    const phone2 = normalizePhone(get(row, "parentPhone2")) || phones[1] || "";
    if (phone1) values.parentPhone1 = phone1;
    if (phone2 && phone2 !== phone1) values.parentPhone2 = phone2;
    // Excel lưu CCCD thành số làm mất số 0 đầu: CCCD 12 số, CMND 9 số.
    let nationalId = cell(get(row, "nationalId")).replace(/\s+/g, "");
    if (/^\d{10,11}$/.test(nationalId)) nationalId = nationalId.padStart(12, "0");
    else if (/^\d{7,8}$/.test(nationalId)) nationalId = nationalId.padStart(9, "0");
    if (nationalId) values.nationalId = nationalId.slice(0, 30);
    const address = cell(get(row, "address"));
    if (address) values.address = address.slice(0, 300);
    const dob = normalizeDate(get(row, "dateOfBirth"));
    if (dob) values.dateOfBirth = dob;
    const school = cell(get(row, "school"));
    if (school) values.school = school.slice(0, 300);
    out.push({ line: index + 1, code, fullName: fullName.slice(0, 300), values });
  }
  return { rows: out };
}

const phonesOf = (student: DemoStudent) => [student.parentPhone1, student.parentPhone2, student.phone, student.parentZalo].map(normalizePhone).filter(Boolean);
const currentValue = (student: DemoStudent, field: ImportField) => {
  if (field === "parentPhone1") return String(student.parentPhone1 || student.phone || "").trim();
  if (field === "parentPhone2") return String(student.parentPhone2 || "").trim();
  return String((student as unknown as Record<string, unknown>)[field] ?? "").trim();
};
// SĐT, CCCD: so phần số, bỏ số 0 đầu (Excel hay làm rơi số 0 khi lưu thành số).
const digitsKey = (value: string) => String(value || "").replace(/\D/g, "").replace(/^0+/, "").replace(/^84(?=\d{9}$)/, "");
const sameValue = (field: ImportField, a: string, b: string) => (field.startsWith("parentPhone") || field === "nationalId" ? digitsKey(a) === digitsKey(b) : fold(a) === fold(b));

/** So file với danh sách hiện tại → kế hoạch (chưa ghi gì). `next` = danh sách sau khi áp dụng. */
export function planStudentImport(rows: ImportRow[], students: DemoStudent[], newId: () => string): StudentImportPlan {
  const plan: StudentImportPlan = { created: [], updated: [], conflicts: [], unchanged: 0, warnings: [], errors: [], next: [] };
  const next = students.map((row) => ({ ...row }));
  const byCode = new Map(next.map((row) => [String(row.code || "").toUpperCase(), row]));
  const seenCodes = new Set<string>();
  const touched = new Set<string>();
  let maxCode = students.reduce((max, row) => Math.max(max, Number(String(row.code || "").replace(/\D/g, "")) || 0), 0);

  for (const row of rows) {
    if (row.code && seenCodes.has(row.code)) { plan.errors.push(`Dòng ${row.line}: Mã HV ${row.code} lặp lại trong file — bỏ qua dòng này.`); continue; }
    if (row.code) seenCodes.add(row.code);
    let target = row.code ? byCode.get(row.code) : undefined;
    if (!target && !row.code) {
      // Dòng thêm tay không có mã: trùng tên + một SĐT với học viên có sẵn → coi là người đó, không tạo trùng.
      const phones = [row.values.parentPhone1, row.values.parentPhone2].filter(Boolean) as string[];
      target = next.find((student) => fold(student.fullName) === fold(row.fullName) && phones.some((phone) => phonesOf(student).map(digitsKey).includes(digitsKey(phone))));
      if (target) plan.warnings.push(`Dòng ${row.line}: ${row.fullName} không có Mã HV nhưng trùng tên + SĐT với ${target.code} — coi là học viên có sẵn.`);
    }
    if (target) {
      if (touched.has(target.id)) { plan.errors.push(`Dòng ${row.line}: ${target.code} đã xuất hiện ở dòng trước — bỏ qua dòng này.`); continue; }
      touched.add(target.id);
      if (row.fullName && fold(row.fullName) !== fold(target.fullName)) {
        plan.conflicts.push({ line: row.line, code: target.code, fullName: target.fullName, label: "Tên học viên", lms: target.fullName, excel: row.fullName });
      }
      const fields: StudentImportPlan["updated"][number]["fields"] = [];
      for (const [field, value] of Object.entries(row.values) as [ImportField, string][]) {
        const lms = currentValue(target, field);
        if (!lms) {
          // SĐT 2 trùng SĐT 1 đang có thì không điền.
          if (field.startsWith("parentPhone") && phonesOf(target).map(digitsKey).includes(digitsKey(value))) continue;
          fields.push({ field, label: IMPORT_FIELD_LABELS[field], value });
        } else if (!sameValue(field, lms, value)) {
          plan.conflicts.push({ line: row.line, code: target.code, fullName: target.fullName, label: IMPORT_FIELD_LABELS[field], lms, excel: value });
        }
      }
      if (!fields.length) { plan.unchanged += 1; continue; }
      const patch: Record<string, string> = Object.fromEntries(fields.map((item) => [item.field, item.value]));
      if (patch.parentPhone1 && !String(target.phone || "").trim()) patch.phone = patch.parentPhone1;
      if (!String(target.parentZalo || "").trim() && (patch.parentPhone2 || patch.parentPhone1)) patch.parentZalo = patch.parentPhone2 || patch.parentPhone1;
      Object.assign(target, patch);
      plan.updated.push({ line: row.line, id: target.id, code: target.code, fullName: target.fullName, fields });
      continue;
    }
    if (!row.fullName) { plan.errors.push(`Dòng ${row.line}: Mã HV ${row.code} chưa có trên LMS và thiếu tên học viên — bỏ qua.`); continue; }
    const sameName = next.find((student) => fold(student.fullName) === fold(row.fullName));
    if (sameName) plan.warnings.push(`Dòng ${row.line}: ${row.fullName} trùng tên với ${sameName.code} nhưng khác SĐT — vẫn tạo học viên mới, anh kiểm tra lại.`);
    let code = row.code;
    if (!code) { maxCode += 1; code = `HV${String(maxCode).padStart(4, "0")}`; } else maxCode = Math.max(maxCode, Number(code.replace(/\D/g, "")) || 0);
    const phone1 = row.values.parentPhone1 || "";
    const phone2 = row.values.parentPhone2 || "";
    const student: DemoStudent = {
      id: newId(), code, fullName: row.fullName, phone: phone1, address: row.values.address || "", school: row.values.school || "",
      parentZalo: phone2 || phone1, parentPhone1: phone1, parentPhone2: phone2, status: "UNASSIGNED",
      dateOfBirth: row.values.dateOfBirth || "", parentName: row.values.parentName || "", nationalId: row.values.nationalId || "", note: "",
      loginEmail: "", loginPassword: "", tuitionExempt: false, sessionBalances: {}, tuitionCredits: {}, tuitionPaidThrough: {}, classJoinedAt: {},
    };
    next.push(student);
    byCode.set(code, student);
    touched.add(student.id);
    plan.created.push({ line: row.line, student });
  }
  plan.next = next;
  return plan;
}
