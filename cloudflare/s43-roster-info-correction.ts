import type { DemoClass, DemoLessonSession } from "./operations-types";
import type { DemoStudent } from "./people-types";
import type { DemoFinance } from "./finance-types";
import { mergeSepayLedger } from "./sepay-engine";

export const S43_CLASS_ID = "class-20f4e3b3-1eec-4d59-8c51-9aa75535b061";

/** Trần Đức Nam — đã nghỉ học, hồ sơ còn sót link lớp + phiếu OPEN. */
export const S43_WITHDRAWN_STUDENT_ID = "student-04faa9ea-8998-44ba-8ee3-c9472a481832";

// Thông tin liên hệ lớp S43 theo danh sách Excel: chỉ điền vào trường đang
// trống, tuyệt đối không ghi đè dữ liệu web đã có (SĐT1, tên phụ huynh, tên
// học viên, trạng thái). Cột "tên zalo" không có trường tương ứng nên bỏ qua.
const S43_INFO_PATCH: Readonly<Record<string, {
  dateOfBirth?: string;
  parentPhone2?: string;
  nationalId?: string;
  address?: string;
}>> = {
  HV0959: { dateOfBirth: "2020-10-10", parentPhone2: "0911093435", nationalId: "042191001477", address: "SN 02, ngõ 15, Đường Lê Văn Huân, T31, P Thành Sen, Tỉnh Hà Tĩnh" },
  HV0961: { dateOfBirth: "2020-10-06", parentPhone2: "0989887662", nationalId: "042189019882", address: "Tổ 22, Phường Thành Sen, Tỉnh Hà Tĩnh" },
  HV0962: { dateOfBirth: "2020-06-27", parentPhone2: "0985112499", nationalId: "042184004080", address: "Thôn Bắc Thắng, Xã Thạch Lạc Tỉnh Hà Tĩnh" },
  HV0963: { dateOfBirth: "2020-12-31", parentPhone2: "0834560886", nationalId: "042086001891", address: "SN 69, Đường Đặng Tất, Phường Thành Sen, Tỉnh Hà Tĩnh" },
  HV0964: { dateOfBirth: "2020-01-15", parentPhone2: "0984304274", nationalId: "042197008951", address: "Thôn Long Tiên, Xã Đồng Tiến, Tỉnh Hà Tĩnh" },
  HV0965: { dateOfBirth: "2020-05-07", parentPhone2: "0941349796", nationalId: "042197003925", address: "Thôn Long Tiên, Xã Đồng Tiến, Tỉnh Hà Tĩnh" },
  HV0966: { dateOfBirth: "2020-11-05", parentPhone2: "0944380785", nationalId: "042191002053", address: "TDP 7, Phường Thành Sen, Tỉnh Hà Tĩnh" },
  HV0968: { dateOfBirth: "2020-09-14", parentPhone2: "0964483265", nationalId: "042192011862", address: "Thôn 2, Xã Từ Mỹ, Tỉnh Hà Tĩnh" },
  HV0969: { dateOfBirth: "2020-06-20", parentPhone2: "0917677792", nationalId: "042094020244", address: "Số 89, Đường vũ Quang, Phường Thành Sen, Tỉnh Hà Tĩnh" },
  HV0970: { dateOfBirth: "2020-07-20", parentPhone2: "0983921587", nationalId: "04208006757", address: "Phường Thành Sen, Tỉnh Hà Tĩnh" },
  HV0971: { dateOfBirth: "2020-01-09", parentPhone2: "0943696498", nationalId: "042193001786", address: "TDP18, Phường Thành Sen, Tỉnh Hà Tĩnh" },
  HV0972: { dateOfBirth: "2020-12-09", parentPhone2: "098071909", nationalId: "042191016901", address: "SN 23, Ngõ 15, Đường Hà Huy Tập, Phường Thành Sen, Tỉnh Hà Tĩnh" },
  HV1006: { dateOfBirth: "2020-07-03" },
};

// 5 bạn trên danh sách S43 mà chưa có hồ sơ trong hệ thống — tạo mới và xếp
// vào lớp. Mã học viên tiếp nối dãy hiện có (lớn nhất HV1008).
const S43_NEW_STUDENTS: ReadonlyArray<DemoStudent> = [
  { id: "student-import-1009", code: "HV1009", fullName: "Nguyễn Minh Triết", phone: "0972727792", address: "Thạch Khê, Tỉnh Hà Tĩnh", school: "", parentZalo: "0972727792", parentPhone1: "0972727792", parentPhone2: "0823590534", status: "STUDYING", dateOfBirth: "2020-11-24", parentName: "Nguyễn Thị Thảo", nationalId: "042192004974", note: "" },
  { id: "student-import-1010", code: "HV1010", fullName: "Nguyễn Quang Khôi", phone: "0946612268", address: "Tổ 17, Phường Thành Sen, Tỉnh Hà Tĩnh", school: "", parentZalo: "0946612268", parentPhone1: "0946612268", parentPhone2: "0945776577", status: "STUDYING", dateOfBirth: "2020-01-04", parentName: "Lê Thị Thu Hiền", nationalId: "042193010574", note: "" },
  { id: "student-import-1011", code: "HV1011", fullName: "Dương Kim Anh Đức", phone: "0941283822", address: "Thôn Sơn Hà, Xã Thạch Lạc, Tỉnh Hà Tĩnh", school: "", parentZalo: "0941283822", parentPhone1: "0941283822", parentPhone2: "0943388866", status: "STUDYING", dateOfBirth: "2020-03-09", parentName: "Dương Thị Bê Phương", nationalId: "042195009326", note: "" },
  { id: "student-import-1012", code: "HV1012", fullName: "Nguyễn Thị Trâm Anh", phone: "0949966955", address: "Tổ Dân Phố 24, Phường Thành Sen, Tỉnh Hà Tĩnh", school: "", parentZalo: "0949966955", parentPhone1: "0949966955", parentPhone2: "0975404524", status: "STUDYING", dateOfBirth: "2020-06-24", parentName: "Nguyễn Văn Thảo", nationalId: "042084001992", note: "" },
  { id: "student-import-1013", code: "HV1013", fullName: "Nguyễn Khánh Ngọc", phone: "0849827998", address: "Tổ Dân Phố 24, Phường Thành Sen, Tỉnh Hà Tĩnh", school: "", parentZalo: "0849827998", parentPhone1: "0849827998", parentPhone2: "0961786573", status: "STUDYING", dateOfBirth: "2020-04-20", parentName: "Nguyễn Thị Chương", nationalId: "042187012832", note: "" },
];

/**
 * Điền trường còn trống cho 13 học viên S43 hiện có, tạo 5 hồ sơ mới và xếp
 * vào lớp. Idempotent: chạy lại không đổi gì thêm.
 */
export function s43RosterInfoCorrection(
  students: DemoStudent[],
  classes: DemoClass[],
): { students: DemoStudent[]; classes: DemoClass[] } {
  const cls = classes.find((row) => row.id === S43_CLASS_ID);
  if (!cls) return { students, classes };

  const newStudents = S43_NEW_STUDENTS;
  const byCode = new Map(newStudents.map((row) => [row.code, row]));
  const knownCodes = new Set(students.map((row) => String(row.code || "").trim().toUpperCase()));

  const patched = students.map((row) => {
    const patch = S43_INFO_PATCH[String(row.code || "").trim().toUpperCase()];
    if (!patch) return row;
    const next = { ...row };
    if (!next.dateOfBirth && patch.dateOfBirth) next.dateOfBirth = patch.dateOfBirth;
    if (!next.parentPhone2 && patch.parentPhone2) next.parentPhone2 = patch.parentPhone2;
    if (!next.nationalId && patch.nationalId) next.nationalId = patch.nationalId;
    if (!next.address && patch.address) next.address = patch.address;
    return next;
  });

  const created = newStudents.filter((row) => !knownCodes.has(String(row.code || "").trim().toUpperCase()));
  const nextStudents = created.length ? [...patched, ...created] : patched;

  const roster = new Set(cls.studentIds || []);
  let classChanged = false;
  // Xếp vào lớp theo id thật của hồ sơ (mới tạo hoặc đã có sẵn theo mã).
  for (const row of nextStudents) {
    if (byCode.has(String(row.code || "").trim().toUpperCase()) && !roster.has(row.id)) {
      roster.add(row.id);
      classChanged = true;
    }
  }
  const nextClasses = classChanged
    ? classes.map((item) => item.id === S43_CLASS_ID ? { ...item, studentIds: [...roster] } : item)
    : classes;

  return { students: nextStudents, classes: nextClasses };
}

function normalizedName(value: string | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[Đđ]/g, "d")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function nameEndsWith(value: string | undefined, suffix: string) {
  const name = normalizedName(value);
  return name === suffix || name.endsWith(` ${suffix}`);
}

// Ba bạn bị xếp nhầm vào S43 — học ở lớp khác, chỉ gỡ khỏi S43 theo tên.
const S43_WRONG_ROSTER_NAME_SUFFIXES: readonly string[] = ["bao tram", "tu uyen", "nguyen khang"];

/**
 * Chỉnh roster S43: gỡ Bảo Trâm/Tú Uyên/Nguyên Khang khỏi riêng lớp S43 (hồ
 * sơ và lớp khác giữ nguyên), đưa Dương Kim Anh Đức (HV1011), Nguyễn Thị Trâm
 * Anh (HV1012), Nguyễn Khánh Ngọc (HV1013) vào lớp — tạo hồ sơ nếu thiếu.
 * Phiếu S43 chưa thu của các bạn bị gỡ chuyển CANCELLED + đơn QR treo hủy;
 * điểm danh trong các buổi S43 của họ được gỡ. Idempotent.
 */
export function s43RosterSwapCorrection(input: {
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
  finance: DemoFinance | null;
}): {
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
  finance: DemoFinance | null;
} {
  const cls = input.classes.find((row) => row.id === S43_CLASS_ID);
  if (!cls) return input;

  const rosterIds = new Set(cls.studentIds || []);
  const removedIds = new Set(
    input.students
      .filter((row) => rosterIds.has(row.id)
        && S43_WRONG_ROSTER_NAME_SUFFIXES.some((suffix) => nameEndsWith(row.fullName, suffix)))
      .map((row) => row.id),
  );

  const knownCodes = new Set(input.students.map((row) => String(row.code || "").trim().toUpperCase()));
  const knownNames = new Set(input.students.map((row) => normalizedName(row.fullName)));
  // Tạo hồ sơ khi thiếu hẳn — nếu ai đó đã tạo tay cùng tên/mã khác thì tái
  // sử dụng hồ sơ đó, không sinh trùng.
  const created = S43_NEW_STUDENTS.filter((row) =>
    !knownCodes.has(String(row.code).toUpperCase()) && !knownNames.has(normalizedName(row.fullName)));
  const students = created.length ? [...input.students, ...created] : input.students;
  const wantedIds = S43_NEW_STUDENTS
    .map((row) => students.find((stu) =>
      String(stu.code || "").trim().toUpperCase() === String(row.code).toUpperCase()
      || normalizedName(stu.fullName) === normalizedName(row.fullName))?.id)
    .filter((id): id is string => Boolean(id));

  const nextRoster = (cls.studentIds || []).filter((id) => !removedIds.has(id));
  for (const id of wantedIds) {
    if (!nextRoster.includes(id)) nextRoster.push(id);
  }
  const classes = input.classes.map((row) =>
    row.id === S43_CLASS_ID ? { ...row, studentIds: nextRoster } : row);

  const sessions = input.sessions.map((session) =>
    session.classId === S43_CLASS_ID && (session.attendance || []).some((row) => removedIds.has(row.studentId))
      ? { ...session, attendance: (session.attendance || []).filter((row) => !removedIds.has(row.studentId)) }
      : session);

  let finance = input.finance;
  if (finance?.sepay && removedIds.size) {
    const ledger = mergeSepayLedger(finance.sepay);
    const deadReceivableIds = new Set(
      ledger.receivables
        .filter((row) => removedIds.has(row.studentId) && row.classId === S43_CLASS_ID)
        .map((row) => row.id),
    );
    const receivables = ledger.receivables.map((row) =>
      deadReceivableIds.has(row.id) && row.status !== "PAID" && row.status !== "REFUNDED" && row.status !== "CANCELLED"
        ? { ...row, status: "CANCELLED" as const, balanceDue: 0 }
        : row,
    );
    const paymentOrders = ledger.paymentOrders.map((row) =>
      deadReceivableIds.has(row.receivableId) && row.status === "ACTIVE"
        ? { ...row, status: "CANCELLED" as const }
        : row,
    );
    finance = { ...finance, sepay: { ...ledger, receivables, paymentOrders } };
  }

  return { students, classes, sessions, finance };
}

/**
 * Xoá hoàn toàn học viên đã nghỉ khỏi hệ thống: gỡ khỏi hồ sơ, roster mọi
 * lớp, điểm danh các buổi; hủy phiếu chưa thu + đơn QR đang treo. Biên lai /
 * giao dịch tiền thật vẫn giữ để đối soát (bạn này chưa đóng khoản nào).
 * Idempotent: chạy lại không đổi gì thêm.
 */
export function purgeWithdrawnStudent(
  studentId: string,
  input: {
    students: DemoStudent[];
    classes: DemoClass[];
    sessions: DemoLessonSession[];
    finance: DemoFinance | null;
  },
): {
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
  finance: DemoFinance | null;
} {
  const students = input.students.filter((row) => row.id !== studentId);

  const classes = input.classes.map((cls) => {
    const roster = cls.studentIds || [];
    return roster.includes(studentId)
      ? { ...cls, studentIds: roster.filter((id) => id !== studentId) }
      : cls;
  });

  const sessions = input.sessions.map((session) => {
    const rows = session.attendance || [];
    return rows.some((row) => row.studentId === studentId)
      ? { ...session, attendance: rows.filter((row) => row.studentId !== studentId) }
      : session;
  });

  let finance = input.finance;
  if (finance?.sepay) {
    const ledger = mergeSepayLedger(finance.sepay);
    const deadReceivableIds = new Set(
      ledger.receivables.filter((row) => row.studentId === studentId).map((row) => row.id),
    );
    const receivables = ledger.receivables.map((row) =>
      row.studentId === studentId && row.status !== "PAID" && row.status !== "REFUNDED" && row.status !== "CANCELLED"
        ? { ...row, status: "CANCELLED" as const, balanceDue: 0 }
        : row,
    );
    const paymentOrders = ledger.paymentOrders.map((row) =>
      (row.studentId === studentId || deadReceivableIds.has(row.receivableId)) && row.status === "ACTIVE"
        ? { ...row, status: "CANCELLED" as const }
        : row,
    );
    finance = { ...finance, sepay: { ...ledger, receivables, paymentOrders } };
  }

  return { students, classes, sessions, finance };
}
