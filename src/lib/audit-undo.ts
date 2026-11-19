/**
 * Bộ máy hoàn tác cho Nhật ký hệ thống — PRD §26.
 *
 * `AuditLog.oldValue/newValue` chỉ đủ để *hiển thị* (điểm danh chỉ ghi số lượng, DELETE
 * chỉ ghi 2–3 cột…), nên không thể viết một bộ máy "đọc payload rồi tự đảo". Thay vào đó
 * mỗi action **tự khai báo cách đảo ngược của chính nó** vào cột `AuditLog.undo` ngay lúc
 * ghi log; ở đây chỉ việc thực thi bản khai báo đó.
 *
 * Hệ quả: dòng nhật ký ghi trước khi có tính năng này (`undo` NULL) không hoàn tác được.
 */

import { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus, SessionStatus } from "@/generated/prisma/enums";
import { assignLessons } from "@/lib/class-plan";
import { syncStudentStatus } from "@/lib/enrollment";
import { fail } from "@/lib/form-utils";
import {
  applyStudentAdvanceToAll,
  chargeSessionForStudents,
  isBillableAttendance,
  recalcTuition,
  refundSessionForStudents,
  revertSessionCompletion,
  revertStudentAdvance,
} from "@/lib/tuition";

// ------------------------------------------------------------------
// Bảng model được phép đụng tới
// ------------------------------------------------------------------

/**
 * Tên delegate trên Prisma Client của những bảng mà hoàn tác được phép ghi.
 * Cố tình **không** có `auditLog` (không sửa nhật ký) và `user` chỉ dùng khi khôi phục
 * tài khoản bị xoá kèm học viên / giáo viên.
 */
export const UNDO_MODELS = {
  user: "Tài khoản",
  teacher: "Giáo viên",
  center: "Trung tâm",
  branch: "Cơ sở",
  room: "Phòng học",
  level: "Cấp độ",
  subLevel: "Cấp độ con",
  lessonPeriod: "Ca học",
  normalPackage: "Gói học phí",
  ieltsCourse: "Khoá IELTS",
  syllabus: "Giáo trình",
  syllabusUnit: "Unit giáo trình",
  syllabusLesson: "Bài học",
  class: "Lớp học",
  classSyllabus: "Giáo trình của lớp",
  classSchedule: "Lịch cố định",
  student: "Học viên",
  studentAdvance: "Khoản thu trước",
  enrollment: "Ghi danh",
  lessonSession: "Buổi học",
  attendance: "Điểm danh",
  lessonReport: "Báo cáo buổi học",
  studentTuition: "Hồ sơ học phí",
  tuitionEntry: "Bút toán học phí",
  tuitionPayment: "Phiếu thu",
} as const;

export type UndoModel = keyof typeof UNDO_MODELS;

/** Dòng dữ liệu đã mã hoá để cất vào JSON (xem `serializeRow`). */
export type UndoRowData = Record<string, unknown>;

// ------------------------------------------------------------------
// UndoPlan
// ------------------------------------------------------------------

/** Việc cần làm sau khi đảo xong — tính lại tiền, đồng bộ trạng thái, làm mới trang. */
export type UndoAfter = {
  recalcTuitionIds?: string[];
  syncStudentIds?: string[];
  /** Rót lại bài Syllabus cho lớp sau khi số buổi thay đổi (thêm/xoá buổi). */
  assignLessonsClassIds?: string[];
  revalidate?: string[];
};

type PlanBase = {
  /** Câu mô tả hậu quả, dùng làm nội dung hộp xác nhận trên giao diện. */
  label?: string;
  after?: UndoAfter;
};

export type UndoPlan = PlanBase &
  (
    | {
        /** Đảo một thao tác tạo mới: xoá lại các bản ghi vừa tạo (con trước, cha sau). */
        kind: "deleteCreated";
        rows: { model: UndoModel; id: string }[];
        /** Các dòng có sẵn bị sửa trong cùng thao tác, trả về giá trị cũ sau khi xoá. */
        also?: { model: UndoModel; id: string; data: UndoRowData }[];
      }
    | {
        /** Đảo một thao tác sửa: ghi đè lại các cột về giá trị cũ. */
        kind: "restoreFields";
        model: UndoModel;
        id: string;
        data: UndoRowData;
        /** Các dòng khác cũng bị sửa trong cùng thao tác (ví dụ họ tên bên tài khoản đăng nhập). */
        also?: { model: UndoModel; id: string; data: UndoRowData }[];
      }
    | {
        /** Đảo một thao tác xoá: tạo lại các dòng đã chụp (cha trước, con sau). */
        kind: "restoreDeleted";
        rows: { model: UndoModel; data: UndoRowData }[];
        /** Trả lại các FK bị `SetNull` khi xoá (ví dụ `teacherId` của lớp / buổi). */
        relink?: { model: UndoModel; ids: string[]; data: UndoRowData }[];
      }
    | {
        /** Đảo "Hoàn thành buổi": hoàn học phí → xoá điểm danh → buổi về `SCHEDULED`. */
        kind: "sessionCompletion";
        sessionId: string;
      }
    | {
        /** Trả buổi về trạng thái cũ, kèm trừ / hoàn học phí nếu đi qua `COMPLETED`. */
        kind: "sessionStatus";
        sessionId: string;
        /** Trạng thái mà action đã đặt — khác đi nghĩa là dữ liệu đã đổi, không đảo nữa. */
        expect: SessionStatus;
        status: SessionStatus;
        cancelReason: string | null;
        completedAt: string | null;
      }
    | {
        /** Trả điểm danh từng học viên về như trước, bù trừ chênh lệch học phí. */
        kind: "attendanceState";
        sessionId: string;
        /** `status: null` = trước đó học viên này chưa có dòng điểm danh. */
        rows: { studentId: string; status: AttendanceStatus | null; note: string | null }[];
      }
    | {
        /** Trả lại nhận xét từng học viên (không đụng tới trạng thái điểm danh). */
        kind: "attendanceNotes";
        sessionId: string;
        rows: { studentId: string; note: string | null }[];
        /** Snapshot cột kiểm tra trước khi lưu — thiếu thì hoàn tác không đụng tới cột đó. */
        testColumns?: unknown;
      }
    | {
        /** Thu trước / xoá khoản thu trước — phải đi qua FIFO của `student_advances`. */
        kind: "studentAdvance";
        op: "delete" | "restore";
        studentId: string;
        advanceId: string;
        /** Dữ liệu dòng để tạo lại khi `op: "restore"`. */
        data?: UndoRowData;
      }
  );

// ------------------------------------------------------------------
// Serialize / deserialize
// ------------------------------------------------------------------

const DATE_KEY = "$d";
const DECIMAL_KEY = "$n";

/**
 * Đổi một dòng Prisma thành JSON thuần: `Date` → `{ $d }`, `Decimal` → `{ $n }`.
 *
 * Tự mô tả nên khi khôi phục không cần biết kiểu của từng cột — generator `prisma-client`
 * mới **không** xuất `Prisma.dmmf` nên không suy kiểu lúc chạy được.
 */
export function serializeRow<T>(value: T): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return { [DATE_KEY]: value.toISOString() };
  if (Prisma.Decimal.isDecimal(value)) return { [DECIMAL_KEY]: value.toString() };
  if (Array.isArray(value)) return value.map((item) => serializeRow(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeRow(item);
    }
    return out;
  }
  return value;
}

/** Đảo lại `serializeRow` để đưa dữ liệu về đúng kiểu Prisma cần khi ghi. */
export function deserializeRow(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => deserializeRow(item));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const iso = record[DATE_KEY];
    if (typeof iso === "string" && Object.keys(record).length === 1) return new Date(iso);
    const num = record[DECIMAL_KEY];
    if (typeof num === "string" && Object.keys(record).length === 1) {
      return new Prisma.Decimal(num);
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) out[key] = deserializeRow(item);
    return out;
  }
  return value;
}

function toData(row: UndoRowData): Record<string, unknown> {
  return deserializeRow(row) as Record<string, unknown>;
}

// ------------------------------------------------------------------
// Truy cập delegate
// ------------------------------------------------------------------

type RowDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: {
    where: { id: { in: string[] } };
    data: Record<string, unknown>;
  }): Promise<unknown>;
  findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
  }): Promise<Record<string, unknown>[]>;
};

/**
 * Lấy delegate theo tên model. Prisma sinh type riêng cho từng bảng nên không index động
 * được — ép kiểu về một interface tối giản chỉ dùng `id`, hợp lệ với mọi bảng ở trên.
 */
function delegate(tx: Prisma.TransactionClient, model: UndoModel): RowDelegate {
  const client = tx as unknown as Record<string, RowDelegate | undefined>;
  const found = client[model];
  if (!found || typeof found.create !== "function") {
    fail(`Không hoàn tác được: hệ thống không nhận ra bảng dữ liệu "${model}".`);
  }
  return found;
}

function label(model: UndoModel) {
  return UNDO_MODELS[model] ?? model;
}

async function exists(tx: Prisma.TransactionClient, model: UndoModel, id: string) {
  const row = await delegate(tx, model).findUnique({ where: { id }, select: { id: true } });
  return Boolean(row);
}

/** Đổi lỗi Prisma khi ghi thành câu tiếng Việt nói rõ vì sao không đảo được. */
async function guard<T>(model: UndoModel, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2003" || code === "P2014") {
      fail(
        `Không hoàn tác được: ${label(model)} đã phát sinh dữ liệu liên quan sau thao tác này. Hãy gỡ các dữ liệu đó trước.`,
      );
    }
    if (code === "P2002") {
      fail(`Không hoàn tác được: ${label(model)} bị trùng với dữ liệu đang có.`);
    }
    if (code === "P2025") {
      fail(`Không hoàn tác được: ${label(model)} không còn tồn tại.`);
    }
    throw error;
  }
}

// ------------------------------------------------------------------
// describeUndo — trang nhật ký dùng để vẽ nút
// ------------------------------------------------------------------

export type UndoDescription =
  | { ok: true; label: string }
  | { ok: false; reason: string };

const DEFAULT_LABEL = "Hoàn tác thao tác này? Dữ liệu sẽ quay về trạng thái trước đó.";

/** Có hoàn tác được dòng nhật ký này không — tính thuần từ chính dòng log. */
export function describeUndo(log: {
  action: string;
  undo: unknown;
  rolledBackAt: Date | null;
}): UndoDescription {
  if (log.rolledBackAt) return { ok: false, reason: "Đã hoàn tác." };
  if (log.action === "LOGIN") return { ok: false, reason: "Đăng nhập không phải thao tác dữ liệu." };
  if (log.action === "ROLLBACK") {
    return { ok: false, reason: "Đây đã là một lần hoàn tác, không hoàn tác tiếp." };
  }
  const plan = parseUndo(log.undo);
  if (!plan) {
    return {
      ok: false,
      reason: "Thao tác này không kèm dữ liệu hoàn tác (bản ghi cũ, hoặc không thể đảo ngược).",
    };
  }
  return { ok: true, label: plan.label ?? DEFAULT_LABEL };
}

/** Đọc cột `undo` (JSON) về `UndoPlan`, trả `null` nếu rỗng / sai định dạng. */
export function parseUndo(value: unknown): UndoPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== "string") return null;
  return value as UndoPlan;
}

// ------------------------------------------------------------------
// Helper cho các call site `writeAudit`
// ------------------------------------------------------------------

/** Đảo một thao tác tạo mới. Truyền nhiều dòng khi action tạo cả cụm (cha trước, con sau). */
export function undoCreate(
  rows: { model: UndoModel; id: string } | { model: UndoModel; id: string }[],
  extra?: PlanBase & { also?: Extract<UndoPlan, { kind: "deleteCreated" }>["also"] },
): UndoPlan {
  return { kind: "deleteCreated", rows: Array.isArray(rows) ? rows : [rows], ...extra };
}

/**
 * Đảo một thao tác sửa: chụp lại giá trị **trước khi sửa** của đúng những cột bị đụng tới.
 * Gọi trước hoặc sau `update` đều được vì `before` là bản đã đọc từ trước.
 */
export function undoUpdate<T extends Record<string, unknown>>(
  model: UndoModel,
  id: string,
  before: T,
  fields: readonly (keyof T & string)[],
  extra?: PlanBase & { also?: Extract<UndoPlan, { kind: "restoreFields" }>["also"] },
): UndoPlan {
  const data: UndoRowData = {};
  for (const field of fields) data[field] = serializeRow(before[field]);
  return { kind: "restoreFields", model, id, data, ...extra };
}

/** Một dòng phụ cho `undoUpdate(..., { also: [...] })`. */
export function undoUpdateAlso<T extends Record<string, unknown>>(
  model: UndoModel,
  id: string,
  before: T,
  fields: readonly (keyof T & string)[],
): { model: UndoModel; id: string; data: UndoRowData } {
  const data: UndoRowData = {};
  for (const field of fields) data[field] = serializeRow(before[field]);
  return { model, id, data };
}

/** Chụp một dòng để khôi phục sau khi xoá. **Gọi trước khi xoá.** */
export async function captureRow(
  tx: Prisma.TransactionClient,
  model: UndoModel,
  id: string,
): Promise<{ model: UndoModel; data: UndoRowData } | null> {
  const rows = await captureRows(tx, model, { id });
  return rows[0] ?? null;
}

/**
 * Chụp nhiều dòng theo điều kiện để khôi phục sau khi xoá (dùng cho dữ liệu bị cascade).
 * **Gọi trước khi xoá**, và xếp kết quả theo thứ tự cha → con khi ghép vào `undoDelete`.
 */
export async function captureRows(
  tx: Prisma.TransactionClient,
  model: UndoModel,
  where: Record<string, unknown>,
  orderBy?: Record<string, unknown>,
): Promise<{ model: UndoModel; data: UndoRowData }[]> {
  const rows = await delegate(tx, model).findMany({ where, ...(orderBy ? { orderBy } : {}) });
  return rows.map((row) => ({ model, data: serializeRow(row) as UndoRowData }));
}

/** Ghép các dòng đã chụp thành kế hoạch khôi phục (thứ tự truyền vào = thứ tự tạo lại). */
export function undoDelete(
  rows: ({ model: UndoModel; data: UndoRowData } | null)[],
  extra?: PlanBase & { relink?: Extract<UndoPlan, { kind: "restoreDeleted" }>["relink"] },
): UndoPlan | undefined {
  const clean = rows.filter((row): row is { model: UndoModel; data: UndoRowData } => Boolean(row));
  if (clean.length === 0) return undefined;
  return { kind: "restoreDeleted", rows: clean, ...extra };
}

// ------------------------------------------------------------------
// runUndo
// ------------------------------------------------------------------

/**
 * Thực thi bản khai báo hoàn tác trong một transaction đang mở.
 * Trạng thái hiện tại không còn khớp thì `fail()` với câu tiếng Việt, transaction rollback.
 */
export async function runUndo(tx: Prisma.TransactionClient, plan: UndoPlan): Promise<void> {
  switch (plan.kind) {
    case "deleteCreated":
      await undoDeleteCreated(tx, plan.rows);
      for (const item of plan.also ?? []) {
        await undoRestoreFields(tx, item.model, item.id, item.data);
      }
      break;
    case "restoreFields":
      await undoRestoreFields(tx, plan.model, plan.id, plan.data);
      for (const item of plan.also ?? []) {
        await undoRestoreFields(tx, item.model, item.id, item.data);
      }
      break;
    case "restoreDeleted":
      await undoRestoreDeleted(tx, plan.rows, plan.relink);
      break;
    case "sessionCompletion":
      await undoSessionCompletion(tx, plan.sessionId);
      break;
    case "sessionStatus":
      await undoSessionStatus(tx, plan);
      break;
    case "attendanceState":
      await undoAttendanceState(tx, plan.sessionId, plan.rows);
      break;
    case "attendanceNotes":
      await undoAttendanceNotes(tx, plan.sessionId, plan.rows, plan.testColumns);
      break;
    case "studentAdvance":
      await undoStudentAdvance(tx, plan);
      break;
    default: {
      const never: never = plan;
      void never;
      fail("Không nhận ra kiểu hoàn tác của thao tác này.");
    }
  }

  await runAfter(tx, plan.after);
}

async function runAfter(tx: Prisma.TransactionClient, after?: UndoAfter) {
  if (!after) return;
  for (const tuitionId of after.recalcTuitionIds ?? []) {
    const found = await tx.studentTuition.findUnique({
      where: { id: tuitionId },
      select: { id: true },
    });
    if (found) await recalcTuition(tuitionId, tx);
  }
  for (const studentId of after.syncStudentIds ?? []) {
    const found = await tx.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (found) await syncStudentStatus(tx, studentId);
  }
  for (const classId of after.assignLessonsClassIds ?? []) {
    const found = await tx.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (found) await assignLessons(tx, classId);
  }
}

async function undoDeleteCreated(
  tx: Prisma.TransactionClient,
  rows: { model: UndoModel; id: string }[],
) {
  // Ngược thứ tự lúc tạo: con trước, cha sau.
  for (const row of [...rows].reverse()) {
    if (!(await exists(tx, row.model, row.id))) {
      fail(`Không hoàn tác được: ${label(row.model)} vừa tạo đã bị xoá trước đó.`);
    }
    await guard(row.model, () => delegate(tx, row.model).delete({ where: { id: row.id } }));
  }
}

async function undoRestoreFields(
  tx: Prisma.TransactionClient,
  model: UndoModel,
  id: string,
  data: UndoRowData,
) {
  if (!(await exists(tx, model, id))) {
    fail(`Không hoàn tác được: ${label(model)} không còn tồn tại.`);
  }
  await guard(model, () => delegate(tx, model).update({ where: { id }, data: toData(data) }));
}

async function undoRestoreDeleted(
  tx: Prisma.TransactionClient,
  rows: { model: UndoModel; data: UndoRowData }[],
  relink?: { model: UndoModel; ids: string[]; data: UndoRowData }[],
) {
  // Đúng thứ tự lúc chụp: cha trước, con sau.
  for (const row of rows) {
    const id = row.data.id;
    if (typeof id === "string" && (await exists(tx, row.model, id))) {
      fail(`Không hoàn tác được: ${label(row.model)} đã được tạo lại trước đó.`);
    }
    await guard(row.model, () => delegate(tx, row.model).create({ data: toData(row.data) }));
  }

  for (const item of relink ?? []) {
    if (item.ids.length === 0) continue;
    await guard(item.model, () =>
      delegate(tx, item.model).updateMany({
        where: { id: { in: item.ids } },
        data: toData(item.data),
      }),
    );
  }
}

/**
 * Hoàn tác "Hoàn thành buổi".
 *
 * Thứ tự bắt buộc: `revertSessionCompletion` đọc danh sách học viên bị tính phí **từ chính
 * bảng điểm danh**, nên phải hoàn tiền trước rồi mới xoá điểm danh.
 */
async function undoSessionCompletion(tx: Prisma.TransactionClient, sessionId: string) {
  const session = await tx.lessonSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!session) fail("Không hoàn tác được: buổi học không còn tồn tại.");
  if (session.status !== "COMPLETED") {
    fail("Không hoàn tác được: buổi học không còn ở trạng thái Hoàn thành.");
  }

  await revertSessionCompletion(tx, sessionId);
  await tx.attendance.deleteMany({ where: { sessionId } });
  await tx.lessonSession.update({
    where: { id: sessionId },
    data: { status: "SCHEDULED", completedAt: null },
  });
}

async function undoSessionStatus(
  tx: Prisma.TransactionClient,
  plan: Extract<UndoPlan, { kind: "sessionStatus" }>,
) {
  const session = await tx.lessonSession.findUnique({
    where: { id: plan.sessionId },
    select: { id: true, status: true },
  });
  if (!session) fail("Không hoàn tác được: buổi học không còn tồn tại.");
  if (session.status !== plan.expect) {
    fail("Không hoàn tác được: trạng thái buổi học đã thay đổi sau thao tác này.");
  }

  // Rời khỏi COMPLETED thì hoàn tiền trước khi đổi trạng thái (điểm danh giữ nguyên).
  if (session.status === "COMPLETED" && plan.status !== "COMPLETED") {
    await revertSessionCompletion(tx, plan.sessionId);
  }

  await tx.lessonSession.update({
    where: { id: plan.sessionId },
    data: {
      status: plan.status,
      cancelReason: plan.cancelReason,
      completedAt: plan.completedAt ? new Date(plan.completedAt) : null,
    },
  });

  if (plan.status === "COMPLETED" && session.status !== "COMPLETED") {
    await chargeSessionForStudents(tx, plan.sessionId, await billableNow(tx, plan.sessionId));
  }
}

/** Học viên đang bị tính phí ở buổi này theo điểm danh **hiện tại**. */
async function billableNow(tx: Prisma.TransactionClient, sessionId: string) {
  const rows = await tx.attendance.findMany({
    where: { sessionId },
    select: { studentId: true, status: true },
  });
  return rows.filter((row) => isBillableAttendance(row.status)).map((row) => row.studentId);
}

async function undoAttendanceState(
  tx: Prisma.TransactionClient,
  sessionId: string,
  rows: { studentId: string; status: AttendanceStatus | null; note: string | null }[],
) {
  const session = await tx.lessonSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!session) fail("Không hoàn tác được: buổi học không còn tồn tại.");
  if (session.status === "CANCELLED") {
    fail("Không hoàn tác được: buổi học đã bị huỷ.");
  }

  const chargedBefore = new Set(await billableNow(tx, sessionId));

  for (const row of rows) {
    if (row.status === null) {
      await tx.attendance.deleteMany({ where: { sessionId, studentId: row.studentId } });
      continue;
    }
    await tx.attendance.upsert({
      where: { sessionId_studentId: { sessionId, studentId: row.studentId } },
      create: { sessionId, studentId: row.studentId, status: row.status, note: row.note },
      update: { status: row.status, note: row.note },
    });
  }

  // Đọc lại từ DB thay vì suy từ `rows`: buổi có thể còn học viên khác không nằm trong
  // thao tác gốc (ví dụ người đã rời lớp), họ phải giữ nguyên phần học phí của mình.
  const chargedAfter = new Set(await billableNow(tx, sessionId));

  await chargeSessionForStudents(
    tx,
    sessionId,
    [...chargedAfter].filter((id) => !chargedBefore.has(id)),
  );
  await refundSessionForStudents(
    tx,
    sessionId,
    [...chargedBefore].filter((id) => !chargedAfter.has(id)),
  );
}

async function undoAttendanceNotes(
  tx: Prisma.TransactionClient,
  sessionId: string,
  rows: { studentId: string; note: string | null }[],
  testColumns?: unknown,
) {
  for (const row of rows) {
    await tx.attendance.updateMany({
      where: { sessionId, studentId: row.studentId },
      data: { note: row.note },
    });
  }
  if (testColumns !== undefined) {
    await tx.lessonSession.update({
      where: { id: sessionId },
      data: { testColumns: testColumns as Prisma.InputJsonValue },
    });
  }
}

async function undoStudentAdvance(
  tx: Prisma.TransactionClient,
  plan: Extract<UndoPlan, { kind: "studentAdvance" }>,
) {
  if (plan.op === "delete") {
    const found = await tx.studentAdvance.findUnique({
      where: { id: plan.advanceId },
      select: { id: true },
    });
    if (!found) fail("Không hoàn tác được: khoản thu này đã bị xoá trước đó.");

    // Trả lại phần đã trừ vào học phí rồi mới xoá dòng thu (đúng như `deleteAdvance`).
    await revertStudentAdvance(tx, plan.advanceId);
    return;
  }

  if (!plan.data) fail("Không hoàn tác được: thiếu dữ liệu khoản thu để khôi phục.");
  const found = await tx.studentAdvance.findUnique({
    where: { id: plan.advanceId },
    select: { id: true },
  });
  if (found) fail("Không hoàn tác được: khoản thu đã được tạo lại trước đó.");

  // Tạo lại với `usedAmount = 0` rồi để `applyStudentAdvanceToAll` trừ lại theo FIFO —
  // ghi thẳng `usedAmount` cũ sẽ lệch với `tuition_payments` (nguồn sự thật của "đã thu").
  const data = toData(plan.data);
  await guard("studentAdvance", () =>
    tx.studentAdvance.create({
      data: { ...data, usedAmount: new Prisma.Decimal(0) } as never,
    }),
  );
  await applyStudentAdvanceToAll(tx, plan.studentId);
}
