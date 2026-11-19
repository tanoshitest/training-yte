import type { DemoClass, DemoMaterialFee, DemoScheduleSlot } from "../operations-types";
import type { BlockRepository } from "./block-repository";
import { groupBy, rowsOf } from "./relational-read";
import { syncTables, withOptional, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** `undefined` trong JSON gốc được lưu thành NULL và phải đọc lại thành vắng mặt. */
function optionalText(value: unknown) {
  return typeof value === "string" ? value : null;
}

interface ClassRow {
  id: string;
  code: string;
  name: string;
  classTypeId: string;
  branchId: string;
  teacherId: string;
  roomId: string;
  syllabusId: string;
  status: DemoClass["status"];
  note: string;
  tuitionPackageId: string;
  billingMode: DemoClass["billingMode"];
  sessionPrice: number;
  courseSessions: number;
  courseStartDate: string | null;
  billingEnabled: boolean;
}

interface ClassStudentRow { classId: string; studentId: string }
interface ClassScheduleRow {
  classId: string;
  weekday: number;
  periodId: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}
interface ClassMaterialFeeRow { classId: string; periodKey: string; amount: number; description: string }

interface ClassesQuery {
  classes: ClassRow[] | null;
  students: ClassStudentRow[] | null;
  schedules: ClassScheduleRow[] | null;
  materialFees: ClassMaterialFeeRow[] | null;
}

export const classesRepository: BlockRepository<DemoClass[]> = {
  key: "classes:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<ClassesQuery[]>`
      SELECT
        (SELECT json_agg(c ORDER BY c.position) FROM classes c) AS classes,
        (SELECT json_agg(s ORDER BY s."classId", s.position) FROM class_students s) AS students,
        (SELECT json_agg(s ORDER BY s."classId", s.position) FROM class_schedules s) AS schedules,
        (SELECT json_agg(f ORDER BY f."classId", f."periodKey") FROM class_material_fees f) AS "materialFees"
    `;
    const students = groupBy(rowsOf<ClassStudentRow>(result.students), (row) => row.classId);
    const schedules = groupBy(rowsOf<ClassScheduleRow>(result.schedules), (row) => row.classId);
    const materialFees = groupBy(rowsOf<ClassMaterialFeeRow>(result.materialFees), (row) => row.classId);

    return rowsOf<ClassRow>(result.classes).map((row): DemoClass => {
      const fees: Record<string, DemoMaterialFee> = {};
      for (const fee of materialFees.get(row.id) ?? []) {
        fees[fee.periodKey] = { amount: fee.amount, description: fee.description };
      }
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        classTypeId: row.classTypeId,
        branchId: row.branchId,
        teacherId: row.teacherId,
        roomId: row.roomId,
        syllabusId: row.syllabusId,
        status: row.status,
        studentIds: (students.get(row.id) ?? []).map((item) => item.studentId),
        tuitionPackageId: row.tuitionPackageId,
        billingMode: row.billingMode,
        sessionPrice: row.sessionPrice,
        courseSessions: row.courseSessions,
        ...(row.courseStartDate === null ? {} : { courseStartDate: row.courseStartDate }),
        billingEnabled: row.billingEnabled,
        materialFees: fees,
        schedules: (schedules.get(row.id) ?? []).map((slot): DemoScheduleSlot => withOptional({
          weekday: slot.weekday,
          periodId: slot.periodId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        }, { effectiveFrom: slot.effectiveFrom, effectiveTo: slot.effectiveTo })),
        note: row.note,
      };
    });
  },

  async write(tx: TxClient, value: DemoClass[]) {
    const classes: Row[] = [];
    const students: Row[] = [];
    const schedules: Row[] = [];
    const materialFees: Row[] = [];

    value.forEach((row, position) => {
      classes.push({
        id: row.id,
        position,
        code: text(row.code),
        name: text(row.name),
        classTypeId: text(row.classTypeId),
        branchId: text(row.branchId),
        teacherId: text(row.teacherId),
        roomId: text(row.roomId),
        syllabusId: text(row.syllabusId),
        status: text(row.status),
        note: text(row.note),
        tuitionPackageId: text(row.tuitionPackageId),
        billingMode: text(row.billingMode),
        sessionPrice: Math.round(Number(row.sessionPrice) || 0),
        courseSessions: Math.round(Number(row.courseSessions) || 0),
        courseStartDate: optionalText(row.courseStartDate),
        billingEnabled: row.billingEnabled !== false,
      });
      (row.studentIds ?? []).forEach((studentId, index) => {
        students.push({ classId: row.id, studentId: text(studentId), position: index });
      });
      (row.schedules ?? []).forEach((slot, index) => {
        schedules.push({
          classId: row.id,
          position: index,
          weekday: Math.round(Number(slot.weekday) || 0),
          periodId: text(slot.periodId),
          startTime: text(slot.startTime),
          endTime: text(slot.endTime),
          effectiveFrom: optionalText(slot.effectiveFrom),
          effectiveTo: optionalText(slot.effectiveTo),
        });
      });
      for (const [periodKey, fee] of Object.entries(row.materialFees ?? {})) {
        materialFees.push({
          classId: row.id,
          periodKey,
          amount: Math.round(Number(fee?.amount) || 0),
          description: text(fee?.description),
        });
      }
    });

    return syncTables(tx, [
      { name: "classes", delegate: tx.opsClass as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: classes },
      { name: "class_students", delegate: tx.opsClassStudent as unknown as RowDelegate, keyFields: ["classId", "studentId"], orderField: "position", orderGroup: ["classId"], rows: students },
      { name: "class_schedules", delegate: tx.opsClassSchedule as unknown as RowDelegate, keyFields: ["classId", "position"], rows: schedules },
      { name: "class_material_fees", delegate: tx.opsClassMaterialFee as unknown as RowDelegate, keyFields: ["classId", "periodKey"], rows: materialFees },
    ]);
  },
};
