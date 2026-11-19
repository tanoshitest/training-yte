"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { captureRows, diff, undoCreate, undoDelete, undoUpdate, writeAudit } from "@/lib/audit";
import { nextSyllabusCode } from "@/lib/code";
import {
  fail,
  optionalInt,
  optionalStr,
  requiredId,
  requiredStr,
  runAction,
  type ActionState,
} from "@/lib/form-utils";
import type { SyllabusStatus } from "@/generated/prisma/enums";
import { cardsFromForm, serializeVocab } from "./vocab";

/**
 * Server Action cho module Syllabus (PRD §4).
 *
 * Cấu trúc: 1 syllabus → nhiều Unit → mỗi Unit nhiều buổi học.
 * Số buổi tuỳ từng Unit, không chia đều — popup tạo chỉ dựng sẵn khung Unit rỗng,
 * số buổi đặt riêng cho từng Unit và sửa được bất cứ lúc nào.
 *
 * Quy ước giống Phase 1: không `redirect()`, chỉ `revalidatePath()`,
 * kiểm tra quyền ở server và ghi Audit Log cho mọi thay đổi.
 */

const STATUSES: SyllabusStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

function readStatus(fd: FormData): SyllabusStatus {
  const raw = String(fd.get("status") ?? "").trim();
  if (!STATUSES.includes(raw as SyllabusStatus)) fail("Trạng thái không hợp lệ.");
  return raw as SyllabusStatus;
}

/** `levelId` rỗng nghĩa là không gắn cấp học nào. */
function readLevelId(fd: FormData) {
  const raw = String(fd.get("levelId") ?? "").trim();
  return raw || null;
}

function refreshList() {
  revalidatePath("/syllabus");
}

function refreshSyllabus(id: string) {
  revalidatePath("/syllabus");
  revalidatePath(`/syllabus/${id}`, "layout");
}

// ==================================================================
// 4.3 — Syllabus
// ==================================================================

export async function createSyllabus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.create");

  return runAction(async () => {
    const data = {
      code: optionalStr(fd, "code", 30) ?? (await nextSyllabusCode()),
      name: requiredStr(fd, "name", "Tên syllabus", 150),
      levelId: readLevelId(fd),
      description: optionalStr(fd, "description", 1000),
      status: readStatus(fd),
    };
    // Khung Unit dựng sẵn cho đỡ phải bấm thêm từng cái; số buổi để trống,
    // mỗi Unit tự đặt số buổi riêng ở màn hình chi tiết.
    const unitCount = optionalInt(fd, "unitCount", "Số unit", { min: 0, max: 50 }) ?? 0;

    const created = await prisma.syllabus.create({
      data: {
        ...data,
        units: {
          create: Array.from({ length: unitCount }, (_, i) => ({
            name: `Unit ${i + 1}`,
            order: i + 1,
          })),
        },
      },
    });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Syllabus",
      entityId: created.id,
      newValue: { ...data, unitCount },
      undo: undoCreate(
        { model: "syllabus", id: created.id },
        { label: `Hoàn tác? Syllabus ${created.name} vừa tạo sẽ bị xoá cùng ${unitCount} unit.` },
      ),
    });
    return `Đã tạo syllabus ${created.name} (mã ${created.code}) với ${unitCount} unit.`;
  }).finally(refreshList);
}

export async function updateSyllabus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const id = requiredId(fd, "id", "syllabus");

  return runAction(async () => {
    const data = {
      code: requiredStr(fd, "code", "Mã syllabus", 30),
      name: requiredStr(fd, "name", "Tên syllabus", 150),
      levelId: readLevelId(fd),
      levelLabel: optionalStr(fd, "levelLabel", 80),
      description: optionalStr(fd, "description", 1000),
      status: readStatus(fd),
    };

    const current = await prisma.syllabus.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy syllabus.");

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    await prisma.syllabus.update({ where: { id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Syllabus",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "syllabus",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        {
          label: "Hoàn tác? Syllabus trở về các giá trị trước đó.",
          after: { revalidate: [`/syllabus/${id}`] },
        },
      ),
    });
    return "Đã lưu.";
  }).finally(() => refreshSyllabus(id));
}

/**
 * Xoá hẳn syllabus cùng toàn bộ Unit và buổi học bên trong (onDelete: Cascade).
 * Lớp đang dùng thì bị gỡ khỏi syllabus, buổi dạy đã sinh vẫn còn nhưng mất nội
 * dung bài (`syllabusLessonId` được set null) — nói rõ ở hộp thoại xác nhận.
 */
export async function deleteSyllabus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const id = requiredId(fd, "id", "syllabus");

  return runAction(async () => {
    const current = await prisma.syllabus.findUnique({
      where: { id },
      include: { _count: { select: { classes: true, units: true } } },
    });
    if (!current) fail("Không tìm thấy syllabus.");

    // Buổi dạy đã dùng bài của syllabus này chỉ bị gỡ `syllabusLessonId`,
    // ghi lại theo từng bài để hoàn tác gắn nội dung trở lại.
    const usedSessions = await prisma.lessonSession.findMany({
      where: { syllabusLesson: { unit: { syllabusId: id } } },
      select: { id: true, syllabusLessonId: true },
    });
    const usedLessons = usedSessions.length;
    const relink = new Map<string, string[]>();
    for (const session of usedSessions) {
      if (!session.syllabusLessonId) continue;
      const bucket = relink.get(session.syllabusLessonId);
      if (bucket) bucket.push(session.id);
      else relink.set(session.syllabusLessonId, [session.id]);
    }

    const unitIds = (
      await prisma.syllabusUnit.findMany({ where: { syllabusId: id }, select: { id: true } })
    ).map((row) => row.id);
    const snapshots = [
      ...(await captureRows(prisma, "syllabus", { id })),
      ...(await captureRows(prisma, "syllabusUnit", { syllabusId: id }, { order: "asc" })),
      ...(await captureRows(prisma, "syllabusLesson", { unitId: { in: unitIds } })),
      ...(await captureRows(prisma, "classSyllabus", { syllabusId: id })),
    ];

    await prisma.$transaction(async (tx) => {
      // Khoá ngoại của dòng gán lớp ↔ syllabus là `Restrict`, phải gỡ trước khi xoá.
      await tx.classSyllabus.deleteMany({ where: { syllabusId: id } });
      await tx.syllabus.delete({ where: { id } });
    });

    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Syllabus",
      entityId: id,
      oldValue: {
        name: current.name,
        status: current.status,
        units: current._count.units,
        classes: current._count.classes,
        usedLessons,
      },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? Syllabus ${current.name} được khôi phục cùng ${current._count.units} unit, ${current._count.classes} lớp và ${usedLessons} buổi dạy nhận lại nội dung bài.`,
        relink: [...relink].map(([lessonId, ids]) => ({
          model: "lessonSession" as const,
          ids,
          data: { syllabusLessonId: lessonId },
        })),
      }),
    });
    return `Đã xoá syllabus ${current.name} cùng ${current._count.units} unit. ${current._count.classes} lớp bị gỡ khỏi syllabus này.`;
  }).finally(refreshList);
}

/** 4.7 — nhân bản toàn bộ cây Unit / Buổi học sang một syllabus mới. */
export async function duplicateSyllabus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.create");
  const id = requiredId(fd, "id", "syllabus");

  return runAction(async () => {
    const source = await prisma.syllabus.findUnique({
      where: { id },
      include: { units: { include: { lessons: true }, orderBy: { order: "asc" } } },
    });
    if (!source) fail("Không tìm thấy syllabus.");

    const created = await prisma.syllabus.create({
      data: {
        code: await nextSyllabusCode(),
        name: `${source.name} (bản sao)`.slice(0, 150),
        levelId: source.levelId,
        description: source.description,
        status: "DRAFT",
        units: {
          create: source.units.map((unit) => ({
            name: unit.name,
            order: unit.order,
            lessons: {
              create: unit.lessons
                .sort((a, b) => a.order - b.order)
                .map((lesson) => ({
                  name: lesson.name,
                  order: lesson.order,
                  lessonPlan: lesson.lessonPlan,
                  vocabulary: lesson.vocabulary,
                  grammar: lesson.grammar,
                  homework: lesson.homework,
                  materials: lesson.materials ?? undefined,
                })),
            },
          })),
        },
      },
    });

    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Syllabus",
      entityId: created.id,
      newValue: { name: created.name, duplicatedFrom: source.id },
      undo: undoCreate(
        { model: "syllabus", id: created.id },
        { label: `Hoàn tác? Bản sao "${created.name}" sẽ bị xoá, syllabus gốc không đổi.` },
      ),
    });
    return `Đã nhân bản thành "${created.name}" ở trạng thái Nháp.`;
  }).finally(refreshList);
}

// ==================================================================
// 4.4 — Unit
// ==================================================================

export async function createUnit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");

  return runAction(async () => {
    const name = requiredStr(fd, "name", "Tên unit", 150);
    // Số buổi của mỗi Unit là khác nhau nên nhập ngay lúc thêm cho nhanh,
    // vẫn thêm/bớt được từng buổi sau đó.
    const lessonCount = optionalInt(fd, "lessonCount", "Số buổi", { min: 0, max: 100 }) ?? 0;

    const last = await prisma.syllabusUnit.findFirst({
      where: { syllabusId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const created = await prisma.syllabusUnit.create({
      data: {
        syllabusId,
        name,
        order: (last?.order ?? 0) + 1,
        lessons: {
          create: Array.from({ length: lessonCount }, (_, i) => ({
            name: `Buổi ${i + 1}`,
            order: i + 1,
          })),
        },
      },
    });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "SyllabusUnit",
      entityId: created.id,
      newValue: { syllabusId, name, order: created.order, lessonCount },
      undo: undoCreate(
        { model: "syllabusUnit", id: created.id },
        {
          label: `Hoàn tác? ${created.name} vừa thêm sẽ bị xoá cùng ${lessonCount} buổi học.`,
          after: { revalidate: [`/syllabus/${syllabusId}`] },
        },
      ),
    });
    return `Đã thêm ${created.name} với ${lessonCount} buổi học.`;
  }).finally(() => refreshSyllabus(syllabusId));
}

export async function updateUnit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "unit");

  return runAction(async () => {
    const name = requiredStr(fd, "name", "Tên unit", 150);

    const current = await prisma.syllabusUnit.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy unit.");
    if (current.name === name) return "Không có thay đổi nào.";

    await prisma.syllabusUnit.update({ where: { id }, data: { name } });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "SyllabusUnit",
      entityId: id,
      oldValue: { name: current.name },
      newValue: { name },
      undo: undoUpdate("syllabusUnit", id, current as unknown as Record<string, unknown>, ["name"], {
        label: `Hoàn tác? Unit trở lại tên "${current.name}".`,
        after: { revalidate: [`/syllabus/${syllabusId}`] },
      }),
    });
    return "Đã lưu.";
  }).finally(() => refreshSyllabus(syllabusId));
}

/** Nút xoá ở thanh điều hướng chỉ gửi `id` nên `syllabusId` lấy ngược từ chính unit. */
export async function deleteUnit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const id = requiredId(fd, "id", "unit");
  let syllabusId = "";

  return runAction(async () => {
    const current = await prisma.syllabusUnit.findUnique({
      where: { id },
      include: { _count: { select: { lessons: true } } },
    });
    if (!current) fail("Không tìm thấy unit.");
    syllabusId = current.syllabusId;

    const usedLessons = await prisma.lessonSession.count({
      where: { syllabusLesson: { unitId: id } },
    });
    if (usedLessons > 0) {
      fail(`Unit này có buổi học đã được ${usedLessons} buổi dạy sử dụng, không xoá được.`);
    }

    const snapshots = [
      ...(await captureRows(prisma, "syllabusUnit", { id })),
      ...(await captureRows(prisma, "syllabusLesson", { unitId: id }, { order: "asc" })),
    ];

    await prisma.syllabusUnit.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "SyllabusUnit",
      entityId: id,
      oldValue: { name: current.name, lessons: current._count.lessons },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? ${current.name} được khôi phục cùng ${current._count.lessons} buổi học.`,
        after: { revalidate: [`/syllabus/${current.syllabusId}`] },
      }),
    });
    return `Đã xoá ${current.name}.`;
  }).finally(() => (syllabusId ? refreshSyllabus(syllabusId) : refreshList()));
}

export async function moveUnit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "unit");
  const direction = String(fd.get("direction") ?? "");

  return runAction(async () => {
    const current = await prisma.syllabusUnit.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy unit.");

    const neighbour = await prisma.syllabusUnit.findFirst({
      where:
        direction === "up"
          ? { syllabusId: current.syllabusId, order: { lt: current.order } }
          : { syllabusId: current.syllabusId, order: { gt: current.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return "Đã ở vị trí đầu/cuối rồi.";

    // `@@unique([syllabusId, order])` nên phải mượn một giá trị tạm khi hoán đổi.
    await prisma.$transaction([
      prisma.syllabusUnit.update({ where: { id: current.id }, data: { order: -1 } }),
      prisma.syllabusUnit.update({ where: { id: neighbour.id }, data: { order: current.order } }),
      prisma.syllabusUnit.update({ where: { id: current.id }, data: { order: neighbour.order } }),
    ]);
    return "Đã đổi thứ tự.";
  }).finally(() => refreshSyllabus(syllabusId));
}

// ==================================================================
// 4.5 / 4.6 — Buổi học (Lesson)
// ==================================================================

export async function createLesson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const unitId = requiredId(fd, "unitId", "unit");

  return runAction(async () => {
    const last = await prisma.syllabusLesson.findFirst({
      where: { unitId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = (last?.order ?? 0) + 1;
    // Bỏ trống tên thì đặt luôn "Buổi N" cho khớp cách đánh số của Unit.
    const name = optionalStr(fd, "name", 150) ?? `Buổi ${order}`;

    const created = await prisma.syllabusLesson.create({
      data: { unitId, name, order },
    });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "SyllabusLesson",
      entityId: created.id,
      newValue: { unitId, name, order: created.order },
      undo: undoCreate(
        { model: "syllabusLesson", id: created.id },
        {
          label: `Hoàn tác? Buổi ${created.name} vừa thêm sẽ bị xoá.`,
          after: { revalidate: [`/syllabus/${syllabusId}`] },
        },
      ),
    });
    return `Đã thêm buổi ${created.name}.`;
  }).finally(() => refreshSyllabus(syllabusId));
}

export async function renameLesson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "buổi học");

  return runAction(async () => {
    const name = requiredStr(fd, "name", "Tên buổi học", 150);

    const current = await prisma.syllabusLesson.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy buổi học.");
    if (current.name === name) return "Không có thay đổi nào.";

    await prisma.syllabusLesson.update({ where: { id }, data: { name } });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "SyllabusLesson",
      entityId: id,
      oldValue: { name: current.name },
      newValue: { name },
      undo: undoUpdate(
        "syllabusLesson",
        id,
        current as unknown as Record<string, unknown>,
        ["name"],
        {
          label: `Hoàn tác? Buổi học trở lại tên "${current.name}".`,
          after: { revalidate: [`/syllabus/${syllabusId}`] },
        },
      ),
    });
    return "Đã lưu.";
  }).finally(() => {
    refreshSyllabus(syllabusId);
  });
}

export async function deleteLesson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const id = requiredId(fd, "id", "buổi học");
  let syllabusId = "";

  return runAction(async () => {
    const current = await prisma.syllabusLesson.findUnique({
      where: { id },
      include: {
        _count: { select: { sessions: true } },
        unit: { select: { syllabusId: true } },
        courseDay: { select: { syllabusId: true } },
      },
    });
    if (!current) fail("Không tìm thấy buổi học.");
    syllabusId = current.unit?.syllabusId ?? current.courseDay?.syllabusId ?? "";
    if (!syllabusId) fail("Buổi học không thuộc syllabus nào.");
    if (current._count.sessions > 0) {
      fail(`Buổi học này đã được ${current._count.sessions} buổi dạy sử dụng, không xoá được.`);
    }

    const snapshots = await captureRows(prisma, "syllabusLesson", { id });

    await prisma.syllabusLesson.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "SyllabusLesson",
      entityId: id,
      oldValue: { name: current.name },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? Buổi ${current.name} được khôi phục cùng toàn bộ nội dung bài.`,
        after: { revalidate: [`/syllabus/${syllabusId}`] },
      }),
    });
    return `Đã xoá buổi ${current.name}.`;
  }).finally(() => (syllabusId ? refreshSyllabus(syllabusId) : refreshList()));
}

export async function moveLesson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "buổi học");
  const direction = String(fd.get("direction") ?? "");

  return runAction(async () => {
    const current = await prisma.syllabusLesson.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy buổi học.");

    const neighbour = await prisma.syllabusLesson.findFirst({
      where:
        direction === "up"
          ? { unitId: current.unitId, order: { lt: current.order } }
          : { unitId: current.unitId, order: { gt: current.order } },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return "Đã ở vị trí đầu/cuối rồi.";

    await prisma.$transaction([
      prisma.syllabusLesson.update({ where: { id: current.id }, data: { order: -1 } }),
      prisma.syllabusLesson.update({ where: { id: neighbour.id }, data: { order: current.order } }),
      prisma.syllabusLesson.update({ where: { id: current.id }, data: { order: neighbour.order } }),
    ]);
    return "Đã đổi thứ tự.";
  }).finally(() => refreshSyllabus(syllabusId));
}

/** Học liệu lưu dạng `[{ title, url }]` — đọc từ các input lặp lại của form. */
function readMaterials(fd: FormData) {
  const titles = fd.getAll("materialTitle").map((v) => String(v).trim());
  const urls = fd.getAll("materialUrl").map((v) => String(v).trim());

  const items: { title: string; url: string }[] = [];
  for (let i = 0; i < Math.max(titles.length, urls.length); i += 1) {
    const title = titles[i] ?? "";
    const url = urls[i] ?? "";
    if (!title && !url) continue;
    if (!url) fail(`Học liệu "${title}" chưa có link.`);
    if (!/^https?:\/\//i.test(url)) fail(`Link học liệu phải bắt đầu bằng http:// hoặc https://`);
    items.push({ title: title || url, url: url.slice(0, 1000) });
  }
  return items;
}

/** Flashcard từ vựng — đọc `vocabFront` / `vocabBack` / `vocabImage`, lưu JSON trong cột Text. */
function readVocab(fd: FormData) {
  const json = serializeVocab(cardsFromForm(fd));
  if (json && json.length > 2_000_000) fail("Từ vựng quá dài — bớt ảnh hoặc chọn ảnh nhẹ hơn.");
  return json;
}

/** 4.6 — nội dung một buổi học. */
export async function updateLessonContent(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requirePermission("syllabus.update");
  const syllabusId = requiredId(fd, "syllabusId", "syllabus");
  const id = requiredId(fd, "id", "buổi học");

  return runAction(async () => {
    const grammarPoints = fd.getAll("grammarPoint").map((value) => String(value).trim()).filter(Boolean);
    const planSteps = fd.getAll("lessonPlanStep").map((value) => String(value).trim()).filter(Boolean);
    const data = {
      name: requiredStr(fd, "name", "Tên buổi học", 150),
      lessonPlan: planSteps.join("\n") || optionalStr(fd, "lessonPlan", 20_000),
      vocabulary: readVocab(fd),
      grammar: grammarPoints.join("\n") || optionalStr(fd, "grammar", 20_000),
      homework: optionalStr(fd, "homework", 20_000),
      materials: readMaterials(fd),
    };

    const current = await prisma.syllabusLesson.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy buổi học.");

    await prisma.syllabusLesson.update({
      where: { id },
      data: { ...data, materials: data.materials },
    });

    // So sánh trên chuỗi JSON để audit log chỉ ghi lại phần thực sự đổi.
    const changes = diff(
      { ...current, materials: JSON.stringify(current.materials ?? []) } as unknown as Record<
        string,
        unknown
      >,
      { ...data, materials: JSON.stringify(data.materials) },
    );
    if (changes.hasChanges) {
      await writeAudit({
        userId: user.id,
        action: "UPDATE",
        entity: "SyllabusLesson",
        entityId: id,
        oldValue: changes.oldValue,
        newValue: changes.newValue,
        // Lấy giá trị cũ từ `current` (materials còn nguyên dạng JSON, không phải chuỗi so sánh).
        undo: undoUpdate(
          "syllabusLesson",
          id,
          current as unknown as Record<string, unknown>,
          Object.keys(changes.newValue),
          {
            label: "Hoàn tác? Nội dung buổi học trở về bản trước đó.",
            after: {
              revalidate: [`/syllabus/${syllabusId}`, `/syllabus/${syllabusId}/buoi/${id}`],
            },
          },
        ),
      });
    }

    return "Đã lưu nội dung buổi học.";
  }).finally(() => {
    refreshSyllabus(syllabusId);
    revalidatePath(`/syllabus/${syllabusId}/buoi/${id}`);
    revalidatePath(`/syllabus/${syllabusId}/tu-vung`);
  });
}
