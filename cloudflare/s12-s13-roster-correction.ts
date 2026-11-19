import type { DemoClass, DemoLessonSession } from "./operations-types";
import type { DemoStudent } from "./people-types";
import type { DemoFinance } from "./finance-types";
import { mergeSepayLedger } from "./sepay-engine";

export const S12_CLASS_ID = "class-import-s12";
export const S13_CLASS_ID = "class-import-s13";
/** Xuân Khoa — sheet báo phí đặt bạn ở S13 khóa 2, hiện xếp nhầm S12.
 * Id/mã trên từng môi trường có thể khác nhau nên tìm theo tên trước. */
export const S12_S13_MOVED_STUDENT_ID = "student-import-0174";
const MOVED_STUDENT_CODE = "HV0174";
const MOVED_STUDENT_NAME = "xuan khoa";
const TUE_MAN_CODE = "HV0164";
const TUE_MAN_NAME = "tue man";

function normalizedName(value: string | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[Đđ]/g, "d")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Khớp "Xuân Khoa" kể cả khi hồ sơ ghi đầy đủ họ đệm ("Nguyễn Xuân Khoa"). */
function isMovedStudentName(value: string | undefined) {
  return normalizedName(value).includes(MOVED_STUDENT_NAME);
}

function nextFreeStudentId(students: DemoStudent[]) {
  const used = new Set(students.map((row) => row.id));
  if (!used.has(S12_S13_MOVED_STUDENT_ID)) return S12_S13_MOVED_STUDENT_ID;
  let index = 9000;
  while (used.has(`student-import-${index}`)) index += 1;
  return `student-import-${index}`;
}

function nextFreeStudentCode(students: DemoStudent[]) {
  const used = new Set(students.map((row) => String(row.code || "").trim().toUpperCase()));
  if (!used.has(MOVED_STUDENT_CODE)) return MOVED_STUDENT_CODE;
  const max = students.reduce((acc, row) => {
    const match = /^HV(\d+)$/.exec(String(row.code || "").trim().toUpperCase());
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `HV${String(max + 1).padStart(4, "0")}`;
}

/**
 * Roster + công nợ S12/S13 theo sheet báo phí khóa 2:
 * - S12 = 17 bạn: gỡ mọi hồ sơ tên "Xuân Khoa" (bạn thuộc S13).
 * - S13 = 20 bạn: xếp Xuân Khoa vào đầu danh sách — tìm theo tên (chịu cả
 *   tên đầy đủ có họ đệm), rồi mã HV0174/id nếu tên khớp; thiếu hẳn thì tạo
 *   hồ sơ mới như luồng S43.
 * - Tuệ Mẫn được miễn học phí: đảm bảo tuitionExempt + hủy phiếu S12 chưa
 *   thu của bạn (sync bỏ qua học viên miễn nên không tự lập lại).
 * - Số dư buổi lớp đích = số dư phổ biến của các bạn S13 (giống luồng
 *   transfer-student); mốc lớp cũ gỡ đi.
 * - Phiếu S12 chưa thu của các bạn bị gỡ → CANCELLED + đơn QR treo hủy;
 *   phiếu đã thu/biên lai giữ nguyên. Phiếu S13 khóa 2 do
 *   syncTuitionReceivables tự lập như các bạn khác. Idempotent.
 */
export function s12S13RosterSwapCorrection(input: {
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
  const s12 = input.classes.find((row) => row.id === S12_CLASS_ID);
  const s13 = input.classes.find((row) => row.id === S13_CLASS_ID);
  if (!s12 || !s13) return input;

  // Bạn cần chuyển: mọi hồ sơ tên khớp "Xuân Khoa" đều gỡ khỏi S12; bản ghi
  // dùng để xếp vào S13 ưu tiên tên → mã/id (chỉ nhận mã/id khi tên cũng
  // khớp — tránh kéo nhầm hồ sơ khác nếu môi trường dùng id này cho bạn
  // khác). Thiếu hẳn → tạo hồ sơ mới.
  const nameMatches = input.students.filter((row) => isMovedStudentName(row.fullName));
  let moved = nameMatches[0];
  if (!moved) {
    const byCodeOrId = input.students.find((row) =>
      String(row.code || "").trim().toUpperCase() === MOVED_STUDENT_CODE
      || row.id === S12_S13_MOVED_STUDENT_ID);
    if (byCodeOrId && isMovedStudentName(byCodeOrId.fullName)) moved = byCodeOrId;
  }
  const students = moved
    ? input.students
    : [...input.students, {
        id: nextFreeStudentId(input.students),
        code: nextFreeStudentCode(input.students),
        fullName: "Xuân Khoa",
        phone: "",
        address: "",
        school: "",
        parentZalo: "",
        parentPhone1: "",
        parentPhone2: "",
        status: "STUDYING" as const,
        dateOfBirth: "",
        parentName: "",
        nationalId: "",
        note: "",
        sessionBalances: {},
        tuitionCredits: {},
        tuitionPaidThrough: {},
        classJoinedAt: {},
      } satisfies DemoStudent];
  if (!moved) moved = students[students.length - 1];

  const movedIds = new Set([...nameMatches.map((row) => row.id), moved.id]);

  const tueMan = students.find((row) => normalizedName(row.fullName) === TUE_MAN_NAME)
    || students.find((row) => String(row.code || "").trim().toUpperCase() === TUE_MAN_CODE);

  const classes = input.classes.map((row) => {
    if (row.id === S12_CLASS_ID) {
      const ids = (row.studentIds || []).filter((id) => !movedIds.has(id));
      if (tueMan && !ids.includes(tueMan.id)) ids.push(tueMan.id);
      return { ...row, studentIds: ids };
    }
    if (row.id === S13_CLASS_ID) {
      const ids = (row.studentIds || []).filter((id) => !movedIds.has(id));
      return { ...row, studentIds: [moved.id, ...ids] };
    }
    return row;
  });

  // Số buổi tồn lớp đích = số dư phổ biến của các bạn S13 (transfer-student
  // dùng classPeerSessionBalance); mốc lớp cũ gỡ đi vì bạn không còn thuộc S12.
  const peerCounts = new Map<number, number>();
  for (const memberId of s13.studentIds || []) {
    if (movedIds.has(memberId)) continue;
    const value = students.find((row) => row.id === memberId)?.sessionBalances?.[S13_CLASS_ID];
    if (value === undefined) continue;
    const balance = Math.round(Number(value) || 0);
    peerCounts.set(balance, (peerCounts.get(balance) || 0) + 1);
  }
  const peerBalance = [...peerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const nextStudents = students.map((row) => {
    if (movedIds.has(row.id)) {
      const sessionBalances = { ...(row.sessionBalances || {}) };
      const fallback = sessionBalances[S12_CLASS_ID];
      delete sessionBalances[S12_CLASS_ID];
      sessionBalances[S13_CLASS_ID] = peerBalance !== undefined ? peerBalance : Math.round(Number(fallback) || 0);
      return { ...row, sessionBalances };
    }
    if (tueMan && row.id === tueMan.id && !row.tuitionExempt) {
      return { ...row, tuitionExempt: true };
    }
    return row;
  });

  // Phiếu S12 chưa thu của bạn bị gỡ + của Tuệ Mẫn (miễn phí) → CANCELLED +
  // đơn QR ACTIVE hủy; phiếu đã thu/biên lai giữ nguyên.
  let finance = input.finance;
  if (finance?.sepay) {
    const cancelStudentIds = new Set(movedIds);
    if (tueMan) cancelStudentIds.add(tueMan.id);
    const ledger = mergeSepayLedger(finance.sepay);
    const deadReceivableIds = new Set(
      ledger.receivables
        .filter((row) => cancelStudentIds.has(row.studentId) && row.classId === S12_CLASS_ID)
        .map((row) => row.id),
    );
    if (deadReceivableIds.size) {
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
  }

  return { students: nextStudents, classes, sessions: input.sessions, finance };
}
