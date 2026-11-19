import type { DemoAccountant, DemoAssistant, DemoTeacher } from "../people-types";
import type { BlockRepository } from "./block-repository";
import { groupBy, rowsOf } from "./relational-read";
import { syncTables, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

interface PersonRow {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  address: string;
  email: string;
}

function personRows(value: { id: string; code?: string; fullName?: string; phone?: string; address?: string; email?: string }[]): Row[] {
  return value.map((row, position) => ({
    id: row.id,
    position,
    code: text(row.code),
    fullName: text(row.fullName),
    phone: text(row.phone),
    address: text(row.address),
    email: text(row.email),
  }));
}

function toPerson(row: PersonRow) {
  return { id: row.id, code: row.code, fullName: row.fullName, phone: row.phone, address: row.address, email: row.email };
}

interface TeachersQuery {
  teachers: PersonRow[] | null;
  assignedClasses: { teacherId: string; className: string }[] | null;
}

export const teachersRepository: BlockRepository<DemoTeacher[]> = {
  key: "teachers:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<TeachersQuery[]>`
      SELECT
        (SELECT json_agg(t ORDER BY t.position) FROM teachers t) AS teachers,
        (SELECT json_agg(a ORDER BY a."teacherId", a.position) FROM teacher_assigned_classes a) AS "assignedClasses"
    `;
    const assigned = groupBy(rowsOf<{ teacherId: string; className: string }>(result.assignedClasses), (row) => row.teacherId);
    return rowsOf<PersonRow>(result.teachers).map((row): DemoTeacher => ({
      ...toPerson(row),
      assignedClasses: (assigned.get(row.id) ?? []).map((item) => item.className),
    }));
  },

  async write(tx: TxClient, value: DemoTeacher[]) {
    const assigned: Row[] = [];
    value.forEach((row) => {
      (row.assignedClasses ?? []).forEach((className, position) => {
        assigned.push({ teacherId: row.id, className: text(className), position });
      });
    });
    return syncTables(tx, [
      { name: "teachers", delegate: tx.opsTeacher as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: personRows(value) },
      { name: "teacher_assigned_classes", delegate: tx.opsTeacherAssignedClass as unknown as RowDelegate, keyFields: ["teacherId", "className"], orderField: "position", orderGroup: ["teacherId"], rows: assigned },
    ]);
  },
};

export const accountantsRepository: BlockRepository<DemoAccountant[]> = {
  key: "accountants:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<{ people: PersonRow[] | null }[]>`
      SELECT (SELECT json_agg(a ORDER BY a.position) FROM accountants a) AS people
    `;
    return rowsOf<PersonRow>(result.people).map(toPerson);
  },

  async write(tx: TxClient, value: DemoAccountant[]) {
    return syncTables(tx, [
      { name: "accountants", delegate: tx.opsAccountant as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: personRows(value) },
    ]);
  },
};

export const assistantsRepository: BlockRepository<DemoAssistant[]> = {
  key: "assistants:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<{ people: PersonRow[] | null }[]>`
      SELECT (SELECT json_agg(a ORDER BY a.position) FROM assistants a) AS people
    `;
    return rowsOf<PersonRow>(result.people).map(toPerson);
  },

  async write(tx: TxClient, value: DemoAssistant[]) {
    return syncTables(tx, [
      { name: "assistants", delegate: tx.opsAssistant as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: personRows(value) },
    ]);
  },
};
