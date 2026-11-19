"use server";

import { revalidatePath } from "next/cache";

import { derivedNormalPackagePrice } from "@/lib/normal-tuition";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  captureRow,
  captureRows,
  diff,
  undoCreate,
  undoDelete,
  undoUpdate,
  undoUpdateAlso,
  writeAudit,
} from "@/lib/audit";
import {
  fail,
  money,
  optionalStr,
  parseMoney,
  requiredId,
  requiredStr,
  requiredTime,
  runAction,
  type ActionState,
} from "@/lib/form-utils";

/**
 * Server Action cho toàn bộ màn hình Cấu hình (PRD §17).
 *
 * Quy ước chung:
 * - Mọi action tự kiểm tra quyền `settings.manage` ở server (PRD §25), không tin UI.
 * - Không dùng `redirect()`; chỉ `revalidatePath()` để người dùng ở nguyên tab đang sửa.
 * - Mọi thay đổi đều ghi Audit Log (PRD §26).
 *
 * Màn hình chỉ nhập những trường thật sự cần khai báo. Các cột còn lại trong
 * schema (sức chứa phòng, thứ tự cấp học…) giữ giá trị mặc định khi tạo mới và
 * **không bị đụng tới** khi sửa, để dữ liệu cũ và các màn hình khác không bị ảnh hưởng.
 *
 * **Xóa là xóa hẳn, không có trạng thái "Ngưng dùng".** Lớp đang hoạt động vẫn an
 * toàn vì mọi khóa ngoại trỏ tới dữ liệu cấu hình đều `NULL` được và khai báo
 * `onDelete: SetNull`: lớp / buổi học / lịch / hồ sơ học phí giữ nguyên, chỉ mất
 * đường dẫn về mục vừa xóa. Những con số quan trọng đã được chép sẵn sang bản ghi
 * dùng nó — `ClassSchedule` chép giờ của ca học, `StudentTuition` chép số buổi và
 * số tiền — nên xóa cấu hình không làm sai lịch hay sai tiền.
 *
 * Ngoại lệ là Cấp học và Level: dòng bảng giá bắt buộc phải thuộc một cấp học và
 * một level, nên còn bảng giá thì `deleteLevel` / `deleteSubLevel` báo lỗi thay vì
 * âm thầm xóa lây.
 */

const BASE_PATH = "/cai-dat";

function refresh(tab: string) {
  revalidatePath(`${BASE_PATH}/${tab}`);
}

// ==================================================================
// 17.1 — Thông tin trung tâm
// ==================================================================

export async function saveCenter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const data = {
      name: requiredStr(fd, "name", "Tên trung tâm"),
      logoUrl: optionalStr(fd, "logoUrl"),
      address: optionalStr(fd, "address"),
      phone: optionalStr(fd, "phone", 50),
      email: optionalStr(fd, "email", 200),
    };

    // Chỉ có duy nhất 1 bản ghi Center — lấy bản cũ nhất làm bản chính thức.
    const current = await prisma.center.findFirst({ orderBy: { createdAt: "asc" } });

    if (!current) {
      const created = await prisma.center.create({ data });
      await writeAudit({
        userId: user.id,
        action: "CREATE",
        entity: "Center",
        entityId: created.id,
        newValue: data,
        undo: undoCreate(
          { model: "center", id: created.id },
          { label: "Hoàn tác? Thông tin trung tâm vừa khai báo sẽ bị xoá." },
        ),
      });
      return "Đã lưu thông tin trung tâm.";
    }

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    await prisma.center.update({ where: { id: current.id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Center",
      entityId: current.id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "center",
        current.id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        { label: "Hoàn tác? Thông tin trung tâm trở về các giá trị trước đó." },
      ),
    });
    return "Đã lưu thông tin trung tâm.";
  }).finally(() => refresh("trung-tam"));
}

// ==================================================================
// Chi nhánh
// ==================================================================

export async function createBranch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const data = { name: requiredStr(fd, "name", "Tên chi nhánh", 100) };

    const created = await prisma.branch.create({ data });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Branch",
      entityId: created.id,
      newValue: data,
      undo: undoCreate(
        { model: "branch", id: created.id },
        { label: `Hoàn tác? Chi nhánh ${created.name} vừa thêm sẽ bị xoá.` },
      ),
    });
    return `Đã thêm chi nhánh ${created.name}.`;
  }).finally(() => refresh("chi-nhanh"));
}

export async function updateBranch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "chi nhánh");
    const data = { name: requiredStr(fd, "name", "Tên chi nhánh", 100) };

    const current = await prisma.branch.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy chi nhánh.");

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    await prisma.branch.update({ where: { id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Branch",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "branch",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        { label: "Hoàn tác? Chi nhánh trở về tên trước đó." },
      ),
    });
    return "Đã lưu.";
  }).finally(() => refresh("chi-nhanh"));
}

export async function deleteBranch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "chi nhánh");

    const current = await prisma.branch.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy chi nhánh.");

    // Lớp và phòng học chỉ bị gỡ `branchId` (SetNull), ghi lại để gắn trả về.
    const classIds = (
      await prisma.class.findMany({ where: { branchId: id }, select: { id: true } })
    ).map((row) => row.id);
    const roomIds = (
      await prisma.room.findMany({ where: { branchId: id }, select: { id: true } })
    ).map((row) => row.id);
    const snapshot = await captureRow(prisma, "branch", id);

    await prisma.branch.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Branch",
      entityId: id,
      oldValue: { name: current.name },
      undo: undoDelete([snapshot], {
        label: `Hoàn tác? Chi nhánh ${current.name} được khôi phục cùng ${classIds.length} lớp và ${roomIds.length} phòng học thuộc chi nhánh.`,
        relink: [
          ...(classIds.length ? [{ model: "class" as const, ids: classIds, data: { branchId: id } }] : []),
          ...(roomIds.length ? [{ model: "room" as const, ids: roomIds, data: { branchId: id } }] : []),
        ],
      }),
    });
    return `Đã xóa chi nhánh ${current.name}.`;
  }).finally(() => refresh("chi-nhanh"));
}

// ==================================================================
// 17.2 — Phòng học
// ==================================================================

function readRoom(fd: FormData) {
  return {
    // Phòng học dùng chung toàn trung tâm, không gắn chi nhánh.
    branchId: null,
    name: requiredStr(fd, "name", "Tên phòng", 100),
  };
}

export async function createRoom(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const data = readRoom(fd);

    const created = await prisma.room.create({ data });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Room",
      entityId: created.id,
      newValue: data,
      undo: undoCreate(
        { model: "room", id: created.id },
        { label: `Hoàn tác? Phòng ${created.name} vừa thêm sẽ bị xoá.` },
      ),
    });
    return `Đã thêm phòng ${created.name}.`;
  }).finally(() => refresh("phong-hoc"));
}

export async function updateRoom(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "phòng học");
    const data = readRoom(fd);

    const current = await prisma.room.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy phòng học.");

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    await prisma.room.update({ where: { id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Room",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "room",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        { label: "Hoàn tác? Phòng học trở về các giá trị trước đó." },
      ),
    });
    return "Đã lưu.";
  }).finally(() => refresh("phong-hoc"));
}

export async function deleteRoom(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "phòng học");

    const current = await prisma.room.findUnique({
      where: { id },
      include: { _count: { select: { classes: true, lessonSessions: true } } },
    });
    if (!current) fail("Không tìm thấy phòng học.");

    // `Class.roomId` và `LessonSession.roomId` đều `onDelete: SetNull` nên lớp và
    // buổi học vẫn còn, chỉ trống phòng cho tới khi xếp phòng khác.
    const used = current._count.classes + current._count.lessonSessions;
    const classIds = (
      await prisma.class.findMany({ where: { roomId: id }, select: { id: true } })
    ).map((row) => row.id);
    const sessionIds = (
      await prisma.lessonSession.findMany({ where: { roomId: id }, select: { id: true } })
    ).map((row) => row.id);
    const snapshot = await captureRow(prisma, "room", id);

    await prisma.room.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Room",
      entityId: id,
      oldValue: { name: current.name },
      undo: undoDelete([snapshot], {
        label: `Hoàn tác? Phòng ${current.name} được khôi phục và ${classIds.length} lớp, ${sessionIds.length} buổi học được xếp lại vào phòng này.`,
        relink: [
          ...(classIds.length ? [{ model: "class" as const, ids: classIds, data: { roomId: id } }] : []),
          ...(sessionIds.length
            ? [{ model: "lessonSession" as const, ids: sessionIds, data: { roomId: id } }]
            : []),
        ],
      }),
    });
    return used > 0
      ? `Đã xóa phòng ${current.name}. ${current._count.classes} lớp và ${current._count.lessonSessions} buổi học từng dùng phòng này giờ đang trống phòng, hãy xếp phòng khác cho chúng.`
      : `Đã xóa phòng ${current.name}.`;
  }).finally(() => refresh("phong-hoc"));
}

// ==================================================================
// 17.4 — Cấp học
// ==================================================================

export async function createLevel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const data = { name: requiredStr(fd, "name", "Tên cấp học", 100) };

    // `order` không còn nhập tay nhưng vẫn quyết định thứ tự hiển thị ở các
    // màn hình khác → cấp học mới xếp cuối danh sách.
    const last = await prisma.level.aggregate({ _max: { order: true } });

    const created = await prisma.level.create({
      data: { ...data, order: (last._max.order ?? 0) + 1 },
    });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "Level",
      entityId: created.id,
      newValue: data,
      undo: undoCreate(
        { model: "level", id: created.id },
        { label: `Hoàn tác? Cấp học ${created.name} vừa thêm sẽ bị xoá.` },
      ),
    });
    return `Đã thêm cấp học ${created.name}.`;
  }).finally(() => refresh("cap-hoc"));
}

export async function updateLevel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "cấp học");
    const data = { name: requiredStr(fd, "name", "Tên cấp học", 100) };

    const current = await prisma.level.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy cấp học.");

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    await prisma.level.update({ where: { id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Level",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "level",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        { label: "Hoàn tác? Cấp học trở về tên trước đó." },
      ),
    });
    return "Đã lưu.";
  }).finally(() => refresh("cap-hoc"));
}

export async function deleteLevel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "cấp học");

    const current = await prisma.level.findUnique({
      where: { id },
      include: {
        _count: {
          select: { classes: true, syllabuses: true, normalPackages: true, subLevels: true },
        },
      },
    });
    if (!current) fail("Không tìm thấy cấp học.");

    // Dòng bảng giá bắt buộc phải thuộc một cấp học (`NormalPackage.levelId` không
    // nullable) nên không thể xóa cấp học mà giữ lại bảng giá. Báo lỗi để người dùng
    // tự quyết định, thay vì âm thầm xóa lây sang tab Cấu hình học phí.
    if (current._count.normalPackages > 0) {
      fail(
        `Cấp học ${current.name} còn ${current._count.normalPackages} dòng bảng giá. Hãy xóa các dòng đó ở tab Cấu hình học phí trước.`,
      );
    }

    // Lớp và syllabus thì `onDelete: SetNull`, xóa xong chúng chỉ trống cấp học.
    // Các level bên trong cấp học thì mất theo (`onDelete: Cascade`).
    const used = current._count.classes + current._count.syllabuses;
    const subLevels = current._count.subLevels;

    // Lớp và syllabus chỉ mất đường dẫn về cấp học; level con thì mất hẳn theo cascade.
    const classRows = await prisma.class.findMany({
      where: { levelId: id },
      select: { id: true, subLevelId: true },
    });
    const syllabusIds = (
      await prisma.syllabus.findMany({ where: { levelId: id }, select: { id: true } })
    ).map((row) => row.id);
    const bySubLevel = new Map<string, string[]>();
    for (const row of classRows) {
      if (!row.subLevelId) continue;
      const bucket = bySubLevel.get(row.subLevelId);
      if (bucket) bucket.push(row.id);
      else bySubLevel.set(row.subLevelId, [row.id]);
    }
    const snapshots = [
      ...(await captureRows(prisma, "level", { id })),
      ...(await captureRows(prisma, "subLevel", { levelId: id }, { order: "asc" })),
    ];

    await prisma.level.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Level",
      entityId: id,
      oldValue: { name: current.name },
      undo: undoDelete(snapshots, {
        label: `Hoàn tác? Cấp học ${current.name} được khôi phục cùng ${subLevels} level, ${classRows.length} lớp và ${syllabusIds.length} syllabus nhận lại cấp học.`,
        relink: [
          ...(classRows.length
            ? [{ model: "class" as const, ids: classRows.map((row) => row.id), data: { levelId: id } }]
            : []),
          ...[...bySubLevel].map(([subLevelId, ids]) => ({
            model: "class" as const,
            ids,
            data: { subLevelId },
          })),
          ...(syllabusIds.length
            ? [{ model: "syllabus" as const, ids: syllabusIds, data: { levelId: id } }]
            : []),
        ],
      }),
    });
    let message = `Đã xóa cấp học ${current.name}.`;
    if (subLevels > 0) message += ` ${subLevels} level bên trong cấp này cũng bị xóa theo.`;
    if (used > 0) {
      message += ` ${current._count.classes} lớp và ${current._count.syllabuses} syllabus từng thuộc cấp này giờ đang trống cấp học.`;
    }
    return message;
  }).finally(() => {
    refresh("cap-hoc");
    refresh("level");
  });
}

// ==================================================================
// 17.4b — Level bên trong cấp học
// ==================================================================

/**
 * Level là danh mục con của cấp học, tên do người dùng tự đặt
 * (VD: Kids 1 → Starters, Movers). Bảng giá và lớp học chọn level từ đây.
 */
function readSubLevel(fd: FormData) {
  return {
    levelId: requiredId(fd, "levelId", "cấp học"),
    name: requiredStr(fd, "name", "Tên level", 100),
  };
}

export async function createSubLevel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const data = readSubLevel(fd);

    // `order` không nhập tay nhưng quyết định thứ tự hiển thị → level mới xếp cuối
    // danh sách của chính cấp học đó.
    const last = await prisma.subLevel.aggregate({
      where: { levelId: data.levelId },
      _max: { order: true },
    });

    const created = await prisma.subLevel.create({
      data: { ...data, order: (last._max.order ?? 0) + 1 },
    });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "SubLevel",
      entityId: created.id,
      newValue: data,
      undo: undoCreate(
        { model: "subLevel", id: created.id },
        { label: `Hoàn tác? Level ${created.name} vừa thêm sẽ bị xoá.` },
      ),
    });
    return `Đã thêm level ${created.name}.`;
  }).finally(() => refresh("level"));
}

export async function updateSubLevel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "level");
    const data = readSubLevel(fd);

    const current = await prisma.subLevel.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy level.");

    // Chuyển level sang cấp học khác thì dòng bảng giá của nó cũng phải theo, nếu
    // không `NormalPackage.levelId` sẽ chỉ về cấp học cũ.
    const movingLevel = current.levelId !== data.levelId;

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    // Dòng bảng giá bị kéo sang cấp học mới cũng phải trả về được, ghi lại trước khi sửa.
    const movedPackages = movingLevel
      ? await prisma.normalPackage.findMany({ where: { subLevelId: id }, select: { id: true } })
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.subLevel.update({ where: { id }, data });
      if (movingLevel) {
        await tx.normalPackage.updateMany({
          where: { subLevelId: id },
          data: { levelId: data.levelId },
        });
      }
    });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "SubLevel",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "subLevel",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        {
          label: movingLevel
            ? `Hoàn tác? Level trở lại cấp học cũ cùng ${movedPackages.length} dòng bảng giá.`
            : "Hoàn tác? Level trở về các giá trị trước đó.",
          also: movedPackages.map((row) =>
            undoUpdateAlso("normalPackage", row.id, { levelId: current.levelId }, ["levelId"]),
          ),
        },
      ),
    });
    return "Đã lưu.";
  }).finally(() => {
    refresh("level");
    refresh("bang-gia");
  });
}

export async function deleteSubLevel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "level");

    const current = await prisma.subLevel.findUnique({
      where: { id },
      include: { _count: { select: { normalPackages: true, classes: true } } },
    });
    if (!current) fail("Không tìm thấy level.");

    // Dòng bảng giá mất level thì không còn biết nó là giá của level nào — bắt dọn
    // trước, giống cách cấp học chặn xóa khi còn bảng giá.
    if (current._count.normalPackages > 0) {
      fail(
        `Level ${current.name} còn ${current._count.normalPackages} dòng bảng giá. Hãy xóa các dòng đó ở tab Cấu hình học phí trước.`,
      );
    }

    // Lớp thì `onDelete: SetNull`, xóa xong lớp chỉ trống ô level.
    const classes = current._count.classes;
    const classIds = (
      await prisma.class.findMany({ where: { subLevelId: id }, select: { id: true } })
    ).map((row) => row.id);
    const snapshot = await captureRow(prisma, "subLevel", id);

    await prisma.subLevel.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "SubLevel",
      entityId: id,
      oldValue: { name: current.name },
      undo: undoDelete([snapshot], {
        label: `Hoàn tác? Level ${current.name} được khôi phục và ${classIds.length} lớp nhận lại level này.`,
        relink: classIds.length
          ? [{ model: "class" as const, ids: classIds, data: { subLevelId: id } }]
          : [],
      }),
    });
    return classes > 0
      ? `Đã xóa level ${current.name}. ${classes} lớp đang học level này giờ đang trống level.`
      : `Đã xóa level ${current.name}.`;
  }).finally(() => refresh("level"));
}

/**
 * Lưu cả danh sách level của một cấp học: thêm / đổi tên / xóa trong một lần.
 * Còn bảng giá thì không xóa được level đó — phải dọn tab Cấu hình học phí trước.
 */
export async function saveSubLevels(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const levelId = requiredId(fd, "levelId", "cấp học");
    const ids = fd.getAll("subLevelId").map((value) => String(value).trim());
    const names = fd.getAll("levelName").map((value) => String(value).trim());

    if (names.length === 0) fail("Hãy nhập ít nhất một level.");
    if (ids.length !== names.length) fail("Danh sách level gửi lên không hợp lệ. Vui lòng nhập lại.");

    const seen = new Set<string>();
    for (const name of names) {
      if (!name) fail("Tên level không được để trống.");
      if (name.length > 100) fail("Tên level tối đa 100 ký tự.");
      const key = name.toLocaleLowerCase("vi");
      if (seen.has(key)) fail(`Level ${name} bị nhập hai lần.`);
      seen.add(key);
    }

    const level = await prisma.level.findUnique({
      where: { id: levelId },
      select: {
        id: true,
        name: true,
        subLevels: {
          select: {
            id: true,
            name: true,
            order: true,
            _count: { select: { normalPackages: true, classes: true } },
          },
        },
      },
    });
    if (!level) fail("Không tìm thấy cấp học.");

    const submittedIds = new Set(ids.filter(Boolean));
    const removed = level.subLevels.filter((item) => !submittedIds.has(item.id));
    for (const item of removed) {
      if (item._count.normalPackages > 0) {
        fail(
          `Level ${item.name} còn ${item._count.normalPackages} dòng bảng giá. Hãy xóa các dòng đó ở tab Cấu hình học phí trước.`,
        );
      }
    }

    const byId = new Map(level.subLevels.map((item) => [item.id, item]));
    let created = 0;
    let updated = 0;
    let classesEmptied = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of removed) {
        const classIds = (
          await tx.class.findMany({ where: { subLevelId: item.id }, select: { id: true } })
        ).map((row) => row.id);
        const snapshot = await captureRow(tx, "subLevel", item.id);

        await tx.subLevel.delete({ where: { id: item.id } });
        await writeAudit(
          {
            userId: user.id,
            action: "DELETE",
            entity: "SubLevel",
            entityId: item.id,
            oldValue: { name: item.name },
            undo: undoDelete([snapshot], {
              label: `Hoàn tác? Level ${item.name} được khôi phục và ${classIds.length} lớp nhận lại level này.`,
              relink: classIds.length
                ? [{ model: "class" as const, ids: classIds, data: { subLevelId: item.id } }]
                : [],
            }),
          },
          tx,
        );
        classesEmptied += item._count.classes;
      }

      for (let index = 0; index < names.length; index += 1) {
        const id = ids[index];
        const name = names[index];
        const order = index + 1;

        if (!id) {
          const createdRow = await tx.subLevel.create({
            data: { levelId, name, order },
          });
          created += 1;
          await writeAudit(
            {
              userId: user.id,
              action: "CREATE",
              entity: "SubLevel",
              entityId: createdRow.id,
              newValue: { levelId, name },
              undo: undoCreate(
                { model: "subLevel", id: createdRow.id },
                { label: `Hoàn tác? Level ${name} vừa thêm sẽ bị xoá.` },
              ),
            },
            tx,
          );
          continue;
        }

        const current = byId.get(id);
        if (!current) fail("Không tìm thấy level đã chọn.");
        if (current.name === name && current.order === order) continue;

        await tx.subLevel.update({ where: { id }, data: { name, order } });
        updated += 1;
        await writeAudit(
          {
            userId: user.id,
            action: "UPDATE",
            entity: "SubLevel",
            entityId: id,
            oldValue: { name: current.name },
            newValue: { name },
            undo: undoUpdate(
              "subLevel",
              id,
              { name: current.name, order: current.order },
              ["name", "order"],
              { label: `Hoàn tác? Level trở lại tên ${current.name} và thứ tự cũ.` },
            ),
          },
          tx,
        );
      }
    });

    if (created + updated + removed.length === 0) return "Không có thay đổi nào.";

    const parts = [
      created > 0 ? `thêm ${created} level` : "",
      updated > 0 ? `sửa ${updated} level` : "",
      removed.length > 0 ? `xóa ${removed.length} level` : "",
    ].filter(Boolean);
    let message = `${level.name}: đã ${parts.join(", ")}.`;
    if (classesEmptied > 0) {
      message += ` ${classesEmptied} lớp đang học level vừa xóa giờ đang trống level.`;
    }
    return message;
  }).finally(() => {
    refresh("level");
    refresh("bang-gia");
  });
}

// ==================================================================
// 17.5 — Ca học
// ==================================================================

/**
 * Ca học khai báo sẵn khung giờ để lúc xếp lịch chỉ cần chọn ca.
 *
 * Sửa giờ của ca **không** ảnh hưởng tới lớp đang hoạt động: `ClassSchedule` chép
 * `startTime`/`endTime` vào chính nó lúc tạo lịch, chỉ giữ `periodId` để tham chiếu.
 */
function readPeriod(fd: FormData) {
  const startTime = requiredTime(fd, "startTime", "Giờ bắt đầu");
  const endTime = requiredTime(fd, "endTime", "Giờ kết thúc");
  // "HH:mm" so sánh chuỗi là đúng thứ tự thời gian.
  if (endTime <= startTime) fail("Giờ kết thúc phải sau giờ bắt đầu.");

  return { name: requiredStr(fd, "name", "Tên ca học", 100), startTime, endTime };
}

export async function createPeriod(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const data = readPeriod(fd);

    const created = await prisma.lessonPeriod.create({ data });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "LessonPeriod",
      entityId: created.id,
      newValue: data,
      undo: undoCreate(
        { model: "lessonPeriod", id: created.id },
        { label: `Hoàn tác? Ca học ${created.name} vừa thêm sẽ bị xoá.` },
      ),
    });
    return `Đã thêm ${created.name}.`;
  }).finally(() => refresh("ca-hoc"));
}

export async function updatePeriod(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "ca học");
    const data = readPeriod(fd);

    const current = await prisma.lessonPeriod.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy ca học.");

    const changes = diff(current as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    await prisma.lessonPeriod.update({ where: { id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "LessonPeriod",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "lessonPeriod",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        { label: `Hoàn tác? Ca học trở về các giá trị trước đó.` },
      ),
    });
    return "Đã lưu.";
  }).finally(() => refresh("ca-hoc"));
}

export async function deletePeriod(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "ca học");

    const current = await prisma.lessonPeriod.findUnique({
      where: { id },
      include: { _count: { select: { schedules: true } } },
    });
    if (!current) fail("Không tìm thấy ca học.");

    // Lịch lớp chép sẵn giờ bắt đầu / kết thúc vào chính nó lúc tạo, `periodId` chỉ
    // là tham chiếu và `onDelete: SetNull` — xóa ca học không đổi giờ của lớp nào.
    const used = current._count.schedules;
    const scheduleIds = (
      await prisma.classSchedule.findMany({ where: { periodId: id }, select: { id: true } })
    ).map((row) => row.id);
    const snapshot = await captureRow(prisma, "lessonPeriod", id);

    await prisma.lessonPeriod.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "LessonPeriod",
      entityId: id,
      oldValue: { name: current.name },
      undo: undoDelete([snapshot], {
        label: `Hoàn tác? Ca học ${current.name} được khôi phục và ${scheduleIds.length} lịch lớp tham chiếu lại ca này.`,
        relink: scheduleIds.length
          ? [{ model: "classSchedule" as const, ids: scheduleIds, data: { periodId: id } }]
          : [],
      }),
    });
    return used > 0
      ? `Đã xóa ${current.name}. ${used} lịch lớp từng dùng ca này vẫn giữ nguyên khung giờ cũ.`
      : `Đã xóa ${current.name}.`;
  }).finally(() => refresh("ca-hoc"));
}

// ==================================================================
// 17.6a — Bảng giá lớp thường (NormalPackage)
// ==================================================================

/**
 * Bảng giá khai báo theo **level**, mỗi level một bảng nhiều mức: `24 buổi → giá A`,
 * `48 buổi → giá B`… Khai xong cả bảng trong một lần thay vì thêm từng dòng.
 *
 * Form gửi lên ba mảng song song `tierId` / `tierSessions` / `tierPrice`, luôn đủ cả
 * ba kể cả khi `tierId` rỗng (mức mới), để ghép lại đúng theo chỉ số dòng.
 */
function readTiers(fd: FormData) {
  const ids = fd.getAll("tierId");
  const sessions = fd.getAll("tierSessions");
  const prices = fd.getAll("tierPrice");

  if (sessions.length === 0) fail("Hãy nhập ít nhất một mức số buổi.");
  if (ids.length !== sessions.length || prices.length !== sessions.length) {
    fail("Bảng giá gửi lên không hợp lệ. Vui lòng nhập lại.");
  }

  const tiers = sessions.map((raw, index) => {
    const totalSessions = Number(String(raw).trim());
    if (!Number.isInteger(totalSessions) || totalSessions < 1 || totalSessions > 1000) {
      fail("Số buổi phải là số nguyên trong khoảng 1–1000.");
    }
    return {
      id: String(ids[index] ?? "").trim() || null,
      totalSessions,
      price: parseMoney(String(prices[index] ?? ""), `Số tiền của mức ${totalSessions} buổi`),
    };
  });

  // Một số buổi chỉ có một giá, nếu không thì lúc xếp lớp không biết lấy dòng nào.
  const seen = new Set<number>();
  for (const tier of tiers) {
    if (seen.has(tier.totalSessions)) fail(`Mức ${tier.totalSessions} buổi bị nhập hai lần.`);
    seen.add(tier.totalSessions);
  }

  return tiers.sort((a, b) => a.totalSessions - b.totalSessions);
}

const PACKAGE_SESSIONS = [24, 48] as const;

/**
 * Bảng giá lớp thường: nhập học phí gốc 24 tuần và hai mức miễn giảm 24 / 12 tuần;
 * giá 24 / 48 buổi suy ra theo kỳ đóng tương ứng. Level chưa có thì tạo mới;
 * trùng tên trong cùng cấp thì chỉ cập nhật các mức đó, các mức khác (96 buổi…) giữ nguyên.
 */
export async function createPackageTable(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const levelId = requiredId(fd, "levelId", "cấp học");
    const names = fd.getAll("levelName").map((value) => String(value).trim());
    const basePrices = fd.getAll("basePrice");
    const discounts24 = fd.getAll("discount24Weeks");
    const discounts12 = fd.getAll("discount12Weeks");

    if (names.length === 0) fail("Hãy nhập ít nhất một level.");
    if (
      names.length !== basePrices.length ||
      names.length !== discounts24.length ||
      names.length !== discounts12.length
    ) {
      fail("Bảng giá gửi lên không hợp lệ. Vui lòng nhập lại.");
    }

    const seen = new Set<string>();
    const rows = names.map((name, index) => {
      if (!name) fail("Tên level không được để trống.");
      if (name.length > 100) fail("Tên level tối đa 100 ký tự.");
      const key = name.toLocaleLowerCase("vi");
      if (seen.has(key)) fail(`Level ${name} bị nhập hai lần.`);
      seen.add(key);
      const basePrice = parseMoney(
        String(basePrices[index] ?? ""),
        `Học phí gốc 24 tuần của ${name}`,
      );
      const discount24Weeks = parseMoney(
        String(discounts24[index] ?? ""),
        `Miễn giảm 24 tuần của ${name}`,
      );
      const discount12Weeks = parseMoney(
        String(discounts12[index] ?? ""),
        `Miễn giảm 12 tuần của ${name}`,
      );
      const baseNum = Number(basePrice);
      const price24 = derivedNormalPackagePrice(baseNum, 24, discount24Weeks, discount12Weeks);
      const price48 = derivedNormalPackagePrice(baseNum, 48, discount24Weeks, discount12Weeks);
      if (price24 == null || price48 == null) {
        fail(`Học phí gốc 24 tuần của ${name} phải lớn hơn 0.`);
      }
      return {
        name,
        basePrice,
        discount24Weeks,
        discount12Weeks,
        basePrice12Weeks: String(Math.round(baseNum / 2)),
        prices: {
          24: String(price24),
          48: String(price48),
        },
      };
    });

    const level = await prisma.level.findUnique({
      where: { id: levelId },
      select: { id: true, name: true },
    });
    if (!level) fail("Không tìm thấy cấp học đã chọn.");

    let createdLevels = 0;
    let createdTiers = 0;
    let updatedTiers = 0;

    await prisma.$transaction(async (tx) => {
      const last = await tx.subLevel.aggregate({
        where: { levelId },
        _max: { order: true },
      });
      let order = last._max.order ?? 0;

      for (const row of rows) {
        let subLevel = await tx.subLevel.findUnique({
          where: { levelId_name: { levelId, name: row.name } },
        });

        if (!subLevel) {
          order += 1;
          subLevel = await tx.subLevel.create({
            data: {
              levelId,
              name: row.name,
              order,
              basePrice: row.basePrice,
              basePrice12Weeks: row.basePrice12Weeks,
              discount24Weeks: row.discount24Weeks,
              discount12Weeks: row.discount12Weeks,
            },
          });
          createdLevels += 1;
          await writeAudit(
            {
              userId: user.id,
              action: "CREATE",
              entity: "SubLevel",
              entityId: subLevel.id,
              newValue: {
                levelId,
                name: row.name,
                basePrice: row.basePrice,
                basePrice12Weeks: row.basePrice12Weeks,
                discount24Weeks: row.discount24Weeks,
                discount12Weeks: row.discount12Weeks,
              },
              undo: undoCreate(
                { model: "subLevel", id: subLevel.id },
                { label: `Hoàn tác? Level ${row.name} vừa thêm sẽ bị xoá.` },
              ),
            },
            tx,
          );
        } else {
          const before = {
            name: subLevel.name,
            basePrice: subLevel.basePrice?.toString() ?? null,
            basePrice12Weeks: subLevel.basePrice12Weeks?.toString() ?? null,
            discount24Weeks: subLevel.discount24Weeks?.toString() ?? null,
            discount12Weeks: subLevel.discount12Weeks?.toString() ?? null,
          };
          const next = {
            name: row.name,
            basePrice: row.basePrice,
            basePrice12Weeks: row.basePrice12Weeks,
            discount24Weeks: row.discount24Weeks,
            discount12Weeks: row.discount12Weeks,
          };
          const changes = diff(before as unknown as Record<string, unknown>, next);
          if (changes.hasChanges) {
            await tx.subLevel.update({
              where: { id: subLevel.id },
              data: next,
            });
            await writeAudit(
              {
                userId: user.id,
                action: "UPDATE",
                entity: "SubLevel",
                entityId: subLevel.id,
                oldValue: changes.oldValue,
                newValue: changes.newValue,
                undo: undoUpdate(
                  "subLevel",
                  subLevel.id,
                  subLevel as unknown as Record<string, unknown>,
                  Object.keys(changes.newValue),
                  { label: `Hoàn tác? Level ${row.name} trở về giá trị trước đó.` },
                ),
              },
              tx,
            );
          }
        }

        for (const totalSessions of PACKAGE_SESSIONS) {
          const price = row.prices[totalSessions];
          const data = {
            levelId,
            subLevelId: subLevel.id,
            totalSessions,
            price,
            name: `${level.name} · ${row.name} · ${totalSessions} buổi`,
          };
          const existing = await tx.normalPackage.findUnique({
            where: { subLevelId_totalSessions: { subLevelId: subLevel.id, totalSessions } },
          });

          if (!existing) {
            const created = await tx.normalPackage.create({ data });
            createdTiers += 1;
            await writeAudit(
              {
                userId: user.id,
                action: "CREATE",
                entity: "NormalPackage",
                entityId: created.id,
                newValue: data,
                undo: undoCreate(
                  { model: "normalPackage", id: created.id },
                  { label: `Hoàn tác? Mức giá ${data.name} vừa thêm sẽ bị xoá.` },
                ),
              },
              tx,
            );
            continue;
          }

          const before = { ...existing, price: existing.price.toString() };
          const changes = diff(before as unknown as Record<string, unknown>, data);
          if (!changes.hasChanges) continue;

          await tx.normalPackage.update({ where: { id: existing.id }, data });
          updatedTiers += 1;
          await writeAudit(
            {
              userId: user.id,
              action: "UPDATE",
              entity: "NormalPackage",
              entityId: existing.id,
              oldValue: changes.oldValue,
              newValue: changes.newValue,
              undo: undoUpdate(
                "normalPackage",
                existing.id,
                existing as unknown as Record<string, unknown>,
                Object.keys(changes.newValue),
                { label: `Hoàn tác? Mức giá ${existing.name} trở về giá trị trước đó.` },
              ),
            },
            tx,
          );
        }
      }
    });

    if (createdLevels + createdTiers + updatedTiers === 0) return "Không có thay đổi nào.";

    const parts = [
      createdLevels > 0 ? `thêm ${createdLevels} level` : "",
      createdTiers > 0 ? `thêm ${createdTiers} mức giá` : "",
      updatedTiers > 0 ? `sửa ${updatedTiers} mức giá` : "",
    ].filter(Boolean);
    return `Bảng giá ${level.name}: đã ${parts.join(", ")}.`;
  }).finally(() => {
    refresh("bang-gia");
    refresh("level");
  });
}

/**
 * Lưu cả bảng giá của một level: mức mới thì thêm, mức đổi giá thì sửa, mức bị bỏ
 * khỏi form thì xóa. Gộp trong một transaction để bảng giá không bao giờ ở trạng
 * thái nửa vời.
 *
 * Cột `name` là NOT NULL và còn hiển thị ở màn hình Học phí nên được sinh tự động.
 */
export async function savePackageTiers(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const subLevelId = requiredId(fd, "subLevelId", "level");
    const tiers = readTiers(fd);

    // Cấp học suy ra từ level đã chọn, form không cần gửi lên.
    const subLevel = await prisma.subLevel.findUnique({
      where: { id: subLevelId },
      include: { level: { select: { id: true, name: true } } },
    });
    if (!subLevel) fail("Không tìm thấy level đã chọn.");

    const existing = await prisma.normalPackage.findMany({ where: { subLevelId } });
    const byId = new Map(existing.map((row) => [row.id, row]));

    const rows = tiers.map((tier) => ({
      ...tier,
      data: {
        levelId: subLevel.level.id,
        subLevelId,
        totalSessions: tier.totalSessions,
        price: tier.price,
        name: `${subLevel.level.name} · ${subLevel.name} · ${tier.totalSessions} buổi`,
      },
    }));

    const kept = new Set(rows.map((row) => row.id).filter(Boolean));
    const removed = existing.filter((row) => !kept.has(row.id));

    let added = 0;
    let changed = 0;

    await prisma.$transaction(async (tx) => {
      for (const row of removed) {
        const snapshot = await captureRow(tx, "normalPackage", row.id);
        await tx.normalPackage.delete({ where: { id: row.id } });
        await writeAudit(
          {
            userId: user.id,
            action: "DELETE",
            entity: "NormalPackage",
            entityId: row.id,
            oldValue: { name: row.name, price: row.price.toString() },
            undo: undoDelete([snapshot], {
              label: `Hoàn tác? Mức giá ${row.name} được khôi phục.`,
            }),
          },
          tx,
        );
      }

      for (const row of rows) {
        const current = row.id ? byId.get(row.id) : null;

        if (!current) {
          const created = await tx.normalPackage.create({ data: row.data });
          added += 1;
          await writeAudit(
            {
              userId: user.id,
              action: "CREATE",
              entity: "NormalPackage",
              entityId: created.id,
              newValue: row.data,
              undo: undoCreate(
                { model: "normalPackage", id: created.id },
                { label: `Hoàn tác? Mức giá ${row.data.name} vừa thêm sẽ bị xoá.` },
              ),
            },
            tx,
          );
          continue;
        }

        // Decimal cần so sánh bằng chuỗi, nên chuẩn hoá bản ghi cũ trước khi diff.
        const before = { ...current, price: current.price.toString() };
        const changes = diff(before as unknown as Record<string, unknown>, row.data);
        if (!changes.hasChanges) continue;

        await tx.normalPackage.update({ where: { id: current.id }, data: row.data });
        changed += 1;
        await writeAudit(
          {
            userId: user.id,
            action: "UPDATE",
            entity: "NormalPackage",
            entityId: current.id,
            oldValue: changes.oldValue,
            newValue: changes.newValue,
            undo: undoUpdate(
              "normalPackage",
              current.id,
              current as unknown as Record<string, unknown>,
              Object.keys(changes.newValue),
              { label: `Hoàn tác? Mức giá ${current.name} trở về giá trị trước đó.` },
            ),
          },
          tx,
        );
      }
    });

    if (added + changed + removed.length === 0) return "Không có thay đổi nào.";

    const parts = [
      added > 0 ? `thêm ${added} mức` : "",
      changed > 0 ? `sửa ${changed} mức` : "",
      removed.length > 0 ? `xóa ${removed.length} mức` : "",
    ].filter(Boolean);
    return `Bảng giá ${subLevel.level.name} · ${subLevel.name}: đã ${parts.join(", ")}.`;
  }).finally(() => refresh("bang-gia"));
}

/**
 * Chụp một mức giá kèm danh sách hồ sơ học phí / lớp đang trỏ tới nó để hoàn tác được.
 * Cả hai khoá ngoại đều `onDelete: SetNull` nên xoá xong chỉ mất tham chiếu, phải
 * ghi lại id trước khi xoá mới gắn lại được.
 *
 * Gọi **trước** khi xoá, dùng chung cho các nút xóa hàng loạt bảng giá.
 */
async function capturePackageUndo(row: { id: string; name: string }) {
  const snapshot = await captureRow(prisma, "normalPackage", row.id);
  const tuitionIds = (
    await prisma.studentTuition.findMany({ where: { packageId: row.id }, select: { id: true } })
  ).map((item) => item.id);
  const classIds = (
    await prisma.class.findMany({ where: { packageId: row.id }, select: { id: true } })
  ).map((item) => item.id);

  return undoDelete([snapshot], {
    label: `Hoàn tác? Mức giá ${row.name} được khôi phục, ${tuitionIds.length} hồ sơ học phí và ${classIds.length} lớp trỏ lại mức này.`,
    relink: [
      ...(tuitionIds.length
        ? [{ model: "studentTuition" as const, ids: tuitionIds, data: { packageId: row.id } }]
        : []),
      ...(classIds.length
        ? [{ model: "class" as const, ids: classIds, data: { packageId: row.id } }]
        : []),
    ],
  });
}

/**
 * Xóa toàn bộ bảng giá của một cấp học — nút Xóa trên dòng Cấp 1 / Cấp 2.
 * Level vẫn giữ; chỉ bỏ các mức giá. Hồ sơ học phí đã lập không đổi tiền.
 */
export async function deleteLevelPackages(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const levelId = requiredId(fd, "id", "cấp học");
    const level = await prisma.level.findUnique({
      where: { id: levelId },
      select: { id: true, name: true },
    });
    if (!level) fail("Không tìm thấy cấp học.");

    const rows = await prisma.normalPackage.findMany({
      where: { levelId },
      include: { _count: { select: { tuitions: true, classes: true } } },
    });
    if (rows.length === 0) fail("Cấp này chưa có bảng giá nào.");

    const used = rows.reduce((sum, row) => sum + row._count.tuitions, 0);
    const classes = rows.reduce((sum, row) => sum + row._count.classes, 0);

    const undos = new Map(
      await Promise.all(rows.map(async (row) => [row.id, await capturePackageUndo(row)] as const)),
    );

    await prisma.$transaction(async (tx) => {
      await tx.normalPackage.deleteMany({ where: { levelId } });
      for (const row of rows) {
        await writeAudit(
          {
            userId: user.id,
            action: "DELETE",
            entity: "NormalPackage",
            entityId: row.id,
            oldValue: { name: row.name, price: row.price.toString() },
            undo: undos.get(row.id),
          },
          tx,
        );
      }
    });

    let message = `Đã xóa ${rows.length} mức giá của ${level.name}.`;
    if (used > 0) {
      message += ` ${used} hồ sơ học phí đã lập theo bảng giá này vẫn giữ nguyên số buổi và số tiền.`;
    }
    if (classes > 0) {
      message += ` ${classes} lớp đang dùng làm gói học phí, hãy chọn lại gói cho các lớp đó.`;
    }
    return message;
  }).finally(() => refresh("bang-gia"));
}

/**
 * Bản song sinh của {@link capturePackageUndo} cho khóa IELTS — cũng hai khoá ngoại
 * `onDelete: SetNull` (`StudentTuition.ieltsCourseId`, `Class.ieltsCourseId`).
 */
async function captureCourseUndo(row: { id: string; name: string }) {
  const snapshot = await captureRow(prisma, "ieltsCourse", row.id);
  const tuitionIds = (
    await prisma.studentTuition.findMany({ where: { ieltsCourseId: row.id }, select: { id: true } })
  ).map((item) => item.id);
  const classIds = (
    await prisma.class.findMany({ where: { ieltsCourseId: row.id }, select: { id: true } })
  ).map((item) => item.id);

  return undoDelete([snapshot], {
    label: `Hoàn tác? Khóa ${row.name} được khôi phục, ${tuitionIds.length} hồ sơ học phí và ${classIds.length} lớp trỏ lại khóa này.`,
    relink: [
      ...(tuitionIds.length
        ? [{ model: "studentTuition" as const, ids: tuitionIds, data: { ieltsCourseId: row.id } }]
        : []),
      ...(classIds.length
        ? [{ model: "class" as const, ids: classIds, data: { ieltsCourseId: row.id } }]
        : []),
    ],
  });
}

/**
 * Xóa toàn bộ khóa IELTS — nút Xóa trên dòng Khóa IELTS.
 * Hồ sơ học phí đã lập giữ nguyên số tiền; lớp đang gắn khóa thì phải chọn lại.
 */
export async function deleteIeltsCourses(): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const rows = await prisma.ieltsCourse.findMany({
      include: { _count: { select: { tuitions: true, classes: true } } },
    });
    if (rows.length === 0) fail("Chưa có khóa IELTS nào.");

    const used = rows.reduce((sum, row) => sum + row._count.tuitions, 0);
    const classes = rows.reduce((sum, row) => sum + row._count.classes, 0);

    const undos = new Map(
      await Promise.all(rows.map(async (row) => [row.id, await captureCourseUndo(row)] as const)),
    );

    await prisma.$transaction(async (tx) => {
      await tx.ieltsCourse.deleteMany();
      for (const row of rows) {
        await writeAudit(
          {
            userId: user.id,
            action: "DELETE",
            entity: "IeltsCourse",
            entityId: row.id,
            oldValue: { name: row.name, price: row.price.toString() },
            undo: undos.get(row.id),
          },
          tx,
        );
      }
    });

    let message = `Đã xóa ${rows.length} khóa IELTS.`;
    if (used > 0) {
      message += ` ${used} hồ sơ học phí đã lập theo khóa này vẫn giữ nguyên số tiền.`;
    }
    if (classes > 0) {
      message += ` ${classes} lớp đang dùng khóa IELTS làm gói học phí, hãy chọn lại gói cho các lớp đó.`;
    }
    return message;
  }).finally(() => refresh("bang-gia"));
}

/**
 * Xóa cả bảng giá của một level — nút Xóa trên dòng của level đó.
 * `id` gửi lên là `subLevelId` vì mỗi dòng trên bảng là một level, không phải một mức.
 */
export async function deletePackageTiers(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const subLevelId = requiredId(fd, "id", "level");

    const rows = await prisma.normalPackage.findMany({
      where: { subLevelId },
      include: { _count: { select: { tuitions: true, classes: true } } },
    });
    if (rows.length === 0) fail("Level này chưa có bảng giá nào.");

    // Hồ sơ học phí chép sẵn số buổi và số tiền vào chính nó, `packageId` chỉ là
    // tham chiếu và `onDelete: SetNull` — xóa bảng giá không đổi tiền của ai.
    const used = rows.reduce((sum, row) => sum + row._count.tuitions, 0);
    // Lớp đang lấy mức nào làm rule học phí thì mất rule, phải chọn lại mới thêm được học viên.
    const classes = rows.reduce((sum, row) => sum + row._count.classes, 0);

    const undos = new Map(
      await Promise.all(rows.map(async (row) => [row.id, await capturePackageUndo(row)] as const)),
    );

    await prisma.$transaction(async (tx) => {
      await tx.normalPackage.deleteMany({ where: { subLevelId } });
      for (const row of rows) {
        await writeAudit(
          {
            userId: user.id,
            action: "DELETE",
            entity: "NormalPackage",
            entityId: row.id,
            oldValue: { name: row.name, price: row.price.toString() },
            undo: undos.get(row.id),
          },
          tx,
        );
      }
    });

    let message = `Đã xóa ${rows.length} mức giá của ${rows[0].name.split(" · ").slice(0, 2).join(" · ")}.`;
    if (used > 0) {
      message += ` ${used} hồ sơ học phí đã lập theo bảng giá này vẫn giữ nguyên số buổi và số tiền.`;
    }
    if (classes > 0) {
      message += ` ${classes} lớp đang dùng làm gói học phí, hãy chọn lại gói cho các lớp đó.`;
    }
    return message;
  }).finally(() => refresh("bang-gia"));
}

// ==================================================================
// 17.6b — Khóa IELTS
// ==================================================================

function readCourse(fd: FormData) {
  return {
    name: requiredStr(fd, "name", "Tên khóa IELTS", 100),
    price: money(fd, "price", "Học phí toàn khóa"),
  };
}

export async function createCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const data = readCourse(fd);

    const created = await prisma.ieltsCourse.create({ data });
    await writeAudit({
      userId: user.id,
      action: "CREATE",
      entity: "IeltsCourse",
      entityId: created.id,
      newValue: data,
      undo: undoCreate(
        { model: "ieltsCourse", id: created.id },
        { label: `Hoàn tác? Khóa ${created.name} vừa thêm sẽ bị xoá.` },
      ),
    });
    return `Đã thêm khóa ${created.name}.`;
  }).finally(() => refresh("bang-gia"));
}

export async function updateCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "khóa IELTS");
    const data = readCourse(fd);

    const current = await prisma.ieltsCourse.findUnique({ where: { id } });
    if (!current) fail("Không tìm thấy khóa IELTS.");

    const before = { ...current, price: current.price.toString() };
    const changes = diff(before as unknown as Record<string, unknown>, data);
    if (!changes.hasChanges) return "Không có thay đổi nào.";

    await prisma.ieltsCourse.update({ where: { id }, data });
    await writeAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "IeltsCourse",
      entityId: id,
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      undo: undoUpdate(
        "ieltsCourse",
        id,
        current as unknown as Record<string, unknown>,
        Object.keys(changes.newValue),
        { label: `Hoàn tác? Khóa ${current.name} trở về tên và học phí trước đó.` },
      ),
    });
    return "Đã lưu.";
  }).finally(() => refresh("bang-gia"));
}

export async function deleteCourse(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const id = requiredId(fd, "id", "khóa IELTS");

    const current = await prisma.ieltsCourse.findUnique({
      where: { id },
      include: { _count: { select: { tuitions: true, classes: true } } },
    });
    if (!current) fail("Không tìm thấy khóa IELTS.");

    // Giống bảng giá lớp thường: `StudentTuition.ieltsCourseId` là `onDelete: SetNull`
    // và số tiền đã nằm sẵn trong hồ sơ học phí.
    const used = current._count.tuitions;
    // Lớp IELTS đang lấy khóa này làm rule học phí thì mất rule, phải chọn lại.
    const classes = current._count.classes;
    const undo = await captureCourseUndo(current);

    await prisma.ieltsCourse.delete({ where: { id } });
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entity: "IeltsCourse",
      entityId: id,
      oldValue: { name: current.name, price: current.price.toString() },
      undo,
    });
    let message = `Đã xóa khóa ${current.name}.`;
    if (used > 0) {
      message += ` ${used} hồ sơ học phí đã lập theo khóa này vẫn giữ nguyên số tiền.`;
    }
    if (classes > 0) {
      message += ` ${classes} lớp đang dùng khóa này làm gói học phí, hãy chọn lại gói cho các lớp đó.`;
    }
    return message;
  }).finally(() => refresh("bang-gia"));
}

/**
 * Lưu cả danh sách khóa IELTS: thêm / đổi tên-giá / xóa trong một lần.
 * Hồ sơ học phí đã lập giữ nguyên số tiền; lớp đang gắn khóa bị xóa thì phải chọn lại.
 */
export async function saveIeltsCourses(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("settings.manage");

  return runAction(async () => {
    const ids = fd.getAll("courseId").map((value) => String(value).trim());
    const names = fd.getAll("courseName").map((value) => String(value).trim());
    const basePrices = fd.getAll("baseCoursePrice");
    const prices = fd.getAll("coursePrice");

    if (names.length === 0) fail("Hãy nhập ít nhất một khóa IELTS.");
    if (ids.length !== names.length || basePrices.length !== names.length || prices.length !== names.length) {
      fail("Danh sách khóa gửi lên không hợp lệ. Vui lòng nhập lại.");
    }

    const seen = new Set<string>();
    const rows = names.map((name, index) => {
      if (!name) fail("Tên khóa IELTS không được để trống.");
      if (name.length > 100) fail("Tên khóa IELTS tối đa 100 ký tự.");
      const key = name.toLocaleLowerCase("vi");
      if (seen.has(key)) fail(`Khóa ${name} bị nhập hai lần.`);
      seen.add(key);
      const basePriceRaw = String(basePrices[index] ?? "").trim();
      return {
        id: ids[index] || null,
        name,
        basePrice: basePriceRaw ? parseMoney(basePriceRaw, `Học phí gốc của ${name}`) : null,
        price: parseMoney(String(prices[index] ?? ""), `Học phí của ${name}`),
      };
    });

    const existing = await prisma.ieltsCourse.findMany({
      include: { _count: { select: { tuitions: true, classes: true } } },
    });
    const byId = new Map(existing.map((item) => [item.id, item]));
    const submittedIds = new Set(rows.map((row) => row.id).filter(Boolean));
    const removed = existing.filter((item) => !submittedIds.has(item.id));

    let created = 0;
    let updated = 0;
    let tuitionsKept = 0;
    let classesEmptied = 0;

    const undos = new Map(
      await Promise.all(
        removed.map(async (item) => [item.id, await captureCourseUndo(item)] as const),
      ),
    );

    await prisma.$transaction(async (tx) => {
      for (const item of removed) {
        await tx.ieltsCourse.delete({ where: { id: item.id } });
        await writeAudit(
          {
            userId: user.id,
            action: "DELETE",
            entity: "IeltsCourse",
            entityId: item.id,
            oldValue: {
              name: item.name,
              basePrice: item.basePrice?.toString() ?? null,
              price: item.price.toString(),
            },
            undo: undos.get(item.id),
          },
          tx,
        );
        tuitionsKept += item._count.tuitions;
        classesEmptied += item._count.classes;
      }

      for (const row of rows) {
        if (!row.id) continue;
        const current = byId.get(row.id);
        if (!current) fail("Không tìm thấy khóa IELTS đã chọn.");
        const before = {
          name: current.name,
          basePrice: current.basePrice?.toString() ?? null,
          price: current.price.toString(),
        };
        const next = { name: row.name, basePrice: row.basePrice, price: row.price };
        const changes = diff(before, next);
        if (!changes.hasChanges) continue;

        await tx.ieltsCourse.update({
          where: { id: row.id },
          data: next,
        });
        updated += 1;
        await writeAudit(
          {
            userId: user.id,
            action: "UPDATE",
            entity: "IeltsCourse",
            entityId: row.id,
            oldValue: changes.oldValue,
            newValue: changes.newValue,
            undo: undoUpdate(
              "ieltsCourse",
              row.id,
              current as unknown as Record<string, unknown>,
              Object.keys(changes.newValue),
              { label: `Hoàn tác? Khóa ${current.name} trở về tên và học phí trước đó.` },
            ),
          },
          tx,
        );
      }

      for (const row of rows) {
        if (row.id) continue;
        const createdRow = await tx.ieltsCourse.create({
          data: { name: row.name, basePrice: row.basePrice, price: row.price },
        });
        created += 1;
        await writeAudit(
          {
            userId: user.id,
            action: "CREATE",
            entity: "IeltsCourse",
            entityId: createdRow.id,
            newValue: { name: row.name, basePrice: row.basePrice, price: row.price },
            undo: undoCreate(
              { model: "ieltsCourse", id: createdRow.id },
              { label: `Hoàn tác? Khóa ${row.name} vừa thêm sẽ bị xoá.` },
            ),
          },
          tx,
        );
      }
    });

    if (created + updated + removed.length === 0) return "Không có thay đổi nào.";

    const parts = [
      created > 0 ? `thêm ${created} khóa` : "",
      updated > 0 ? `sửa ${updated} khóa` : "",
      removed.length > 0 ? `xóa ${removed.length} khóa` : "",
    ].filter(Boolean);
    let message = `Khóa IELTS: đã ${parts.join(", ")}.`;
    if (tuitionsKept > 0) {
      message += ` ${tuitionsKept} hồ sơ học phí đã lập vẫn giữ nguyên số tiền.`;
    }
    if (classesEmptied > 0) {
      message += ` ${classesEmptied} lớp đang dùng khóa vừa xóa, hãy chọn lại gói cho các lớp đó.`;
    }
    return message;
  }).finally(() => refresh("bang-gia"));
}
