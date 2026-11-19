import type { DemoAuditLog, DemoPeriodicReport } from "../operations-types";
import type { BlockRepository } from "./block-repository";
import { rowsOf } from "./relational-read";
import { syncTables, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function score(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDetails(value: unknown): { label: string; from: string; to: string }[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

interface AuditLogRow {
  id: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  role: DemoAuditLog["role"];
  action: DemoAuditLog["action"];
  entity: string;
  entityId: string;
  summary: string;
  category: string | null;
  details: string | null;
}

interface PeriodicReportRow {
  id: string;
  classId: string;
  studentId: string;
  periodType: DemoPeriodicReport["periodType"];
  periodKey: string;
  periodLabel: string;
  fromDate: string;
  toDate: string;
  listening: number | null;
  speaking: number | null;
  reading: number | null;
  writing: number | null;
  comment: string;
  updatedAt: string;
  updatedBy: string;
}

export const auditRepository: BlockRepository<DemoAuditLog[]> = {
  key: "audit:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<{ logs: AuditLogRow[] | null }[]>`
      SELECT (SELECT json_agg(a ORDER BY a.position) FROM audit_logs a) AS logs
    `;
    return rowsOf<AuditLogRow>(result.logs).map((row): DemoAuditLog => ({
      id: row.id,
      createdAt: row.createdAt,
      userName: row.userName,
      userEmail: row.userEmail,
      role: row.role,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      summary: row.summary,
      ...(row.category ? { category: row.category } : {}),
      ...(parseDetails(row.details) ? { details: parseDetails(row.details)! } : {}),
    }));
  },

  async write(tx: TxClient, value: DemoAuditLog[]) {
    const rows: Row[] = value.map((row, position) => ({
      id: row.id,
      position,
      createdAt: text(row.createdAt),
      userName: text(row.userName),
      userEmail: text(row.userEmail),
      role: text(row.role),
      action: text(row.action),
      entity: text(row.entity),
      entityId: text(row.entityId),
      summary: text(row.summary),
      category: text(row.category),
      details: Array.isArray(row.details) && row.details.length ? JSON.stringify(row.details) : "",
    }));
    return syncTables(tx, [
      { name: "audit_logs", delegate: tx.opsAuditLog as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows },
    ]);
  },
};

export const periodicReportsRepository: BlockRepository<DemoPeriodicReport[]> = {
  key: "periodic-reports:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<{ reports: PeriodicReportRow[] | null }[]>`
      SELECT (SELECT json_agg(r ORDER BY r.position) FROM periodic_reports r) AS reports
    `;
    return rowsOf<PeriodicReportRow>(result.reports).map((row): DemoPeriodicReport => ({
      id: row.id,
      classId: row.classId,
      studentId: row.studentId,
      periodType: row.periodType,
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      fromDate: row.fromDate,
      toDate: row.toDate,
      scores: {
        listening: row.listening,
        speaking: row.speaking,
        reading: row.reading,
        writing: row.writing,
      },
      comment: row.comment,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    }));
  },

  async write(tx: TxClient, value: DemoPeriodicReport[]) {
    const rows: Row[] = value.map((row, position) => ({
      id: row.id,
      position,
      classId: text(row.classId),
      studentId: text(row.studentId),
      periodType: text(row.periodType),
      periodKey: text(row.periodKey),
      periodLabel: text(row.periodLabel),
      fromDate: text(row.fromDate),
      toDate: text(row.toDate),
      listening: score(row.scores?.listening),
      speaking: score(row.scores?.speaking),
      reading: score(row.scores?.reading),
      writing: score(row.scores?.writing),
      comment: text(row.comment),
      updatedAt: text(row.updatedAt),
      updatedBy: text(row.updatedBy),
    }));
    return syncTables(tx, [
      { name: "periodic_reports", delegate: tx.opsPeriodicReport as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows },
    ]);
  },
};
