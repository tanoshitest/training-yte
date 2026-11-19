import type { PrismaClient } from "../../src/generated/prisma/client";
import type { DurableObjectStorageLike } from "../durable-object-base";
import type { SyllabusMeta } from "../syllabus-types";

/**
 * Kho dữ liệu của hai Durable Object syllabus, đặt trên bảng quan hệ thay cho
 * `vps_app_state`.
 *
 * `cloudflare/syllabus-storage.ts` chỉ dùng đúng hai khóa: `items` (danh mục) và
 * `document` (nội dung giáo trình), nên hai lớp dưới đây chỉ phục vụ đúng hai khóa đó
 * và báo lỗi với khóa lạ — im lặng bỏ qua một khóa mới sẽ làm mất dữ liệu.
 */

function unsupported(key: string, where: string): never {
  throw new Error(`Kho ${where} không hỗ trợ khóa "${key}".`);
}

/** Danh mục syllabus: một tập thực thể, mỗi syllabus một dòng, giữ nguyên thứ tự. */
export class RelationalSyllabusCatalogStorage implements DurableObjectStorageLike {
  constructor(private readonly prisma: PrismaClient) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (key !== "items") unsupported(key, "danh mục syllabus");
    const rows = await this.prisma.opsSyllabusCatalogItem.findMany({ orderBy: { position: "asc" } });
    if (!rows.length) return undefined;
    return rows.map((row): SyllabusMeta => ({
      id: row.id,
      code: row.code,
      name: row.name,
      levelId: row.levelId,
      level: row.level,
      description: row.description,
      status: row.status as SyllabusMeta["status"],
      totalCourseDays: row.totalCourseDays,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })) as T;
  }

  async put<T>(key: string, value: T): Promise<void> {
    if (key !== "items") unsupported(key, "danh mục syllabus");
    const items = (Array.isArray(value) ? value : []) as SyllabusMeta[];
    const rows = items.map((item, position) => ({
      id: item.id,
      position,
      code: item.code ?? "",
      name: item.name ?? "",
      levelId: item.levelId ?? null,
      level: item.level ?? "",
      description: item.description ?? "",
      status: String(item.status ?? ""),
      totalCourseDays: Math.round(Number(item.totalCourseDays) || 0),
      sortOrder: Math.round(Number(item.sortOrder) || 0),
      createdAt: item.createdAt ?? "",
      updatedAt: item.updatedAt ?? "",
    }));
    await this.prisma.$transaction([
      this.prisma.opsSyllabusCatalogItem.deleteMany({ where: { id: { notIn: rows.map((row) => row.id) } } }),
      ...rows.map((row) => this.prisma.opsSyllabusCatalogItem.upsert({ where: { id: row.id }, create: row, update: row })),
    ]);
  }

  async deleteAll(): Promise<void> {
    await this.prisma.opsSyllabusCatalogItem.deleteMany({});
  }
}

/** Nội dung giáo trình của một syllabus, đọc và ghi trọn gói. */
export class RelationalSyllabusDocumentStorage implements DurableObjectStorageLike {
  constructor(private readonly prisma: PrismaClient, private readonly syllabusId: string) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (key !== "document") unsupported(key, "nội dung syllabus");
    const row = await this.prisma.opsSyllabusDocument.findUnique({ where: { syllabusId: this.syllabusId } });
    return (row?.document as T | undefined) ?? undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    if (key !== "document") unsupported(key, "nội dung syllabus");
    const document = JSON.parse(JSON.stringify(value));
    await this.prisma.opsSyllabusDocument.upsert({
      where: { syllabusId: this.syllabusId },
      create: { syllabusId: this.syllabusId, document },
      update: { document },
    });
  }

  async deleteAll(): Promise<void> {
    await this.prisma.opsSyllabusDocument.deleteMany({ where: { syllabusId: this.syllabusId } });
  }
}
