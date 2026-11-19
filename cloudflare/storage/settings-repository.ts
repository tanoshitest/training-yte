import type { DemoSettings } from "../settings-types";
import type { BlockRepository } from "./block-repository";
import { rowsOf } from "./relational-read";
import { syncTables, type Row, type RowDelegate, type TxClient } from "./relational-table-sync";

/** Cấu hình trung tâm là một khối duy nhất nên chỉ có một dòng, khóa cố định. */
const CENTER_ROW_ID = "center";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

interface CenterRow { name: string; phone: string; email: string; logoUrl: string; address: string }
interface BranchRow { id: string; name: string }
interface ClassTypeRow { id: string; name: string; description: string }
interface TuitionPackageRow { id: string; classTypeId: string; name: string; sessions: number; amount: number }
interface LessonPeriodRow { id: string; name: string; startTime: string; endTime: string }
interface RoomRow { id: string; name: string; capacity: number; branchId: string }

interface SettingsQuery {
  center: CenterRow | null;
  branches: BranchRow[] | null;
  classTypes: ClassTypeRow[] | null;
  tuitionPackages: TuitionPackageRow[] | null;
  lessonPeriods: LessonPeriodRow[] | null;
  rooms: RoomRow[] | null;
}

export const settingsRepository: BlockRepository<DemoSettings> = {
  key: "settings:steps-demo",

  async read(tx: TxClient) {
    const [result] = await tx.$queryRaw<SettingsQuery[]>`
      SELECT
        (SELECT row_to_json(c) FROM center_settings c WHERE c.id = ${CENTER_ROW_ID}) AS center,
        (SELECT json_agg(b ORDER BY b.position) FROM branches b) AS branches,
        (SELECT json_agg(t ORDER BY t.position) FROM class_types t) AS "classTypes",
        (SELECT json_agg(p ORDER BY p.position) FROM tuition_packages p) AS "tuitionPackages",
        (SELECT json_agg(p ORDER BY p.position) FROM lesson_periods p) AS "lessonPeriods",
        (SELECT json_agg(r ORDER BY r.position) FROM rooms r) AS rooms
    `;
    return {
      center: {
        name: result.center?.name ?? "",
        phone: result.center?.phone ?? "",
        email: result.center?.email ?? "",
        logoUrl: result.center?.logoUrl ?? "",
        address: result.center?.address ?? "",
      },
      branches: rowsOf<BranchRow>(result.branches).map((row) => ({ id: row.id, name: row.name })),
      classTypes: rowsOf<ClassTypeRow>(result.classTypes).map((row) => ({ id: row.id, name: row.name, description: row.description })),
      tuitionPackages: rowsOf<TuitionPackageRow>(result.tuitionPackages).map((row) => ({
        id: row.id,
        classTypeId: row.classTypeId,
        name: row.name,
        sessions: row.sessions,
        amount: row.amount,
      })),
      lessonPeriods: rowsOf<LessonPeriodRow>(result.lessonPeriods).map((row) => ({ id: row.id, name: row.name, startTime: row.startTime, endTime: row.endTime })),
      rooms: rowsOf<RoomRow>(result.rooms).map((row) => ({ id: row.id, name: row.name, capacity: row.capacity, branchId: row.branchId })),
    };
  },

  async write(tx: TxClient, value: DemoSettings) {
    const center = {
      name: text(value.center?.name),
      phone: text(value.center?.phone),
      email: text(value.center?.email),
      logoUrl: text(value.center?.logoUrl),
      address: text(value.center?.address),
    };
    await tx.opsCenterSetting.upsert({
      where: { id: CENTER_ROW_ID },
      create: { id: CENTER_ROW_ID, ...center },
      update: center,
    });

    const branches: Row[] = (value.branches ?? []).map((row, position) => ({ id: row.id, position, name: text(row.name) }));
    const classTypes: Row[] = (value.classTypes ?? []).map((row, position) => ({ id: row.id, position, name: text(row.name), description: text(row.description) }));
    const tuitionPackages: Row[] = (value.tuitionPackages ?? []).map((row, position) => ({
      id: row.id,
      position,
      classTypeId: text(row.classTypeId),
      name: text(row.name),
      sessions: Math.round(Number(row.sessions) || 0),
      amount: Math.round(Number(row.amount) || 0),
    }));
    const lessonPeriods: Row[] = (value.lessonPeriods ?? []).map((row, position) => ({
      id: row.id,
      position,
      name: text(row.name),
      startTime: text(row.startTime),
      endTime: text(row.endTime),
    }));
    const rooms: Row[] = (value.rooms ?? []).map((row, position) => ({
      id: row.id,
      position,
      name: text(row.name),
      capacity: Math.round(Number(row.capacity) || 0),
      branchId: text(row.branchId),
    }));

    return syncTables(tx, [
      { name: "branches", delegate: tx.opsBranch as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: branches },
      { name: "class_types", delegate: tx.opsClassType as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: classTypes },
      { name: "tuition_packages", delegate: tx.opsTuitionPackage as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: tuitionPackages },
      { name: "lesson_periods", delegate: tx.opsLessonPeriod as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: lessonPeriods },
      { name: "rooms", delegate: tx.opsRoom as unknown as RowDelegate, keyFields: ["id"], orderField: "position", rows: rooms },
    ]);
  },
};
