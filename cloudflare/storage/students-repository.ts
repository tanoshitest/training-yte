import type { DemoStudent } from "../people-types";
import type { BlockRepository } from "./block-repository";
import { groupBy, mapOf, rowsOf } from "./relational-read";
import { syncTables, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

interface StudentRow {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  address: string;
  school: string;
  parentZalo: string;
  parentPhone1: string;
  parentPhone2: string;
  status: DemoStudent["status"];
  dateOfBirth: string;
  parentName: string;
  nationalId: string;
  note: string;
  loginEmail: string;
  loginPassword: string;
  tuitionExempt: boolean;
}

interface ClassValueRow<T> {
  studentId: string;
  classId: string;
  value: T;
}

interface StudentsQuery {
  students: StudentRow[] | null;
  balances: ClassValueRow<number>[] | null;
  credits: ClassValueRow<number>[] | null;
  paidThrough: ClassValueRow<string>[] | null;
  joinedAts: ClassValueRow<string>[] | null;
}

export const studentsRepository: BlockRepository<DemoStudent[]> = {
  key: "students:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<StudentsQuery[]>`
      SELECT
        (SELECT json_agg(s ORDER BY s.position) FROM students s) AS students,
        (SELECT json_agg(json_build_object('studentId', b."studentId", 'classId', b."classId", 'value', b.balance)
           ORDER BY b."studentId", b."classId") FROM student_session_balances b) AS balances,
        (SELECT json_agg(json_build_object('studentId', c."studentId", 'classId', c."classId", 'value', c.sessions)
           ORDER BY c."studentId", c."classId") FROM student_tuition_credits c) AS credits,
        (SELECT json_agg(json_build_object('studentId', p."studentId", 'classId', p."classId", 'value', p.month)
           ORDER BY p."studentId", p."classId") FROM student_tuition_paid_through p) AS "paidThrough",
        (SELECT json_agg(json_build_object('studentId', j."studentId", 'classId', j."classId", 'value', j."joinedAt")
           ORDER BY j."studentId", j."classId") FROM student_class_joined_at j) AS "joinedAts"
    `;
    const byStudent = <T>(value: unknown) => groupBy(rowsOf<ClassValueRow<T>>(value), (row) => row.studentId);
    const balances = byStudent<number>(result.balances);
    const credits = byStudent<number>(result.credits);
    const paidThrough = byStudent<string>(result.paidThrough);
    const joinedAts = byStudent<string>(result.joinedAts);

    return rowsOf<StudentRow>(result.students).map((row): DemoStudent => ({
      id: row.id,
      code: row.code,
      fullName: row.fullName,
      phone: row.phone,
      address: row.address,
      school: row.school,
      parentZalo: row.parentZalo,
      parentPhone1: row.parentPhone1,
      parentPhone2: row.parentPhone2,
      status: row.status,
      dateOfBirth: row.dateOfBirth,
      parentName: row.parentName,
      nationalId: row.nationalId,
      note: row.note,
      loginEmail: row.loginEmail,
      loginPassword: row.loginPassword,
      tuitionExempt: row.tuitionExempt,
      sessionBalances: mapOf(balances.get(row.id), (item) => item.classId, (item) => item.value),
      tuitionCredits: mapOf(credits.get(row.id), (item) => item.classId, (item) => item.value),
      tuitionPaidThrough: mapOf(paidThrough.get(row.id), (item) => item.classId, (item) => item.value),
      classJoinedAt: mapOf(joinedAts.get(row.id), (item) => item.classId, (item) => item.value),
    }));
  },

  async write(tx: TxClient, value: DemoStudent[]) {
    const students: Row[] = [];
    const balances: Row[] = [];
    const credits: Row[] = [];
    const paidThrough: Row[] = [];
    const joinedAts: Row[] = [];

    value.forEach((row, position) => {
      students.push({
        id: row.id,
        position,
        code: text(row.code),
        fullName: text(row.fullName),
        phone: text(row.phone),
        address: text(row.address),
        school: text(row.school),
        parentZalo: text(row.parentZalo),
        parentPhone1: text(row.parentPhone1),
        parentPhone2: text(row.parentPhone2),
        status: text(row.status),
        dateOfBirth: text(row.dateOfBirth),
        parentName: text(row.parentName),
        nationalId: text(row.nationalId),
        note: text(row.note),
        loginEmail: text(row.loginEmail),
        loginPassword: text(row.loginPassword),
        tuitionExempt: row.tuitionExempt === true,
      });
      for (const [classId, balance] of Object.entries(row.sessionBalances ?? {})) {
        balances.push({ studentId: row.id, classId, balance: Math.round(Number(balance) || 0) });
      }
      for (const [classId, sessions] of Object.entries(row.tuitionCredits ?? {})) {
        credits.push({ studentId: row.id, classId, sessions: Math.round(Number(sessions) || 0) });
      }
      for (const [classId, month] of Object.entries(row.tuitionPaidThrough ?? {})) {
        paidThrough.push({ studentId: row.id, classId, month: text(month) });
      }
      for (const [classId, joinedAt] of Object.entries(row.classJoinedAt ?? {})) {
        if (!joinedAt) continue;
        joinedAts.push({ studentId: row.id, classId, joinedAt: text(joinedAt) });
      }
    });

    return syncTables(tx, [
      { name: "students", delegate: tx.opsStudent as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: students },
      { name: "student_session_balances", delegate: tx.opsStudentSessionBalance as unknown as RowDelegate, keyFields: ["studentId", "classId"], rows: balances },
      { name: "student_tuition_credits", delegate: tx.opsStudentTuitionCredit as unknown as RowDelegate, keyFields: ["studentId", "classId"], rows: credits },
      { name: "student_tuition_paid_through", delegate: tx.opsStudentTuitionPaidThrough as unknown as RowDelegate, keyFields: ["studentId", "classId"], rows: paidThrough },
      { name: "student_class_joined_at", delegate: tx.opsStudentClassJoinedAt as unknown as RowDelegate, keyFields: ["studentId", "classId"], rows: joinedAts },
    ]);
  },
};
