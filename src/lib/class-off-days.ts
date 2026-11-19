import { prisma } from "@/lib/prisma";
import { PLAN_HORIZON_DAYS } from "@/lib/class-plan";
import { addDaysUtc, dateKey, todayUtc } from "@/lib/date";
import { fail } from "@/lib/form-utils";
import type { Prisma } from "@/generated/prisma/client";

type Client = Prisma.TransactionClient | typeof prisma;

export type ClassOffDayOption = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  sequence: number;
  isOff: boolean;
  /** Buổi có dữ liệu thật thì chỉ hiển thị trạng thái, không cho cấu hình hàng loạt ghi đè. */
  locked: boolean;
};

function weeklyKey(slot: { weekday: number; startTime: string; endTime: string }) {
  return `${slot.weekday}|${slot.startTime}|${slot.endTime}`;
}

function sessionWeeklyKey(session: { date: Date; startTime: string; endTime: string }) {
  return weeklyKey({
    weekday: session.date.getUTCDay(),
    startTime: session.startTime,
    endTime: session.endTime,
  });
}

/**
 * Các buổi sắp tới được sinh đúng từ thời khoá biểu tuần của lớp.
 *
 * Không đưa buổi thêm / buổi bù / buổi đã hoàn thành hoặc huỷ vào cấu hình nghỉ hàng loạt.
 * Buổi đã có điểm danh, điểm kiểm tra, báo cáo hoặc bút toán học phí vẫn hiện nhưng bị khoá để không mất dữ liệu.
 */
export async function loadClassOffDayOptions(client: Client, classId: string) {
  const cls = await client.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, status: true },
  });
  if (!cls) return null;

  const schedules = await client.classSchedule.findMany({
    where: { classId },
    select: { weekday: true, startTime: true, endTime: true },
  });
  const scheduleKeys = new Set(schedules.map(weeklyKey));
  if (scheduleKeys.size === 0) return { cls, options: [] as ClassOffDayOption[] };

  const from = todayUtc();
  const to = addDaysUtc(from, PLAN_HORIZON_DAYS);
  const sessions = (
    await client.lessonSession.findMany({
      where: {
        classId,
        date: { gte: from, lte: to },
        status: "SCHEDULED",
        isExtra: false,
        makeupForId: null,
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        sequence: true,
        isOff: true,
        testColumns: true,
      },
    })
  ).filter((session) => scheduleKeys.has(sessionWeeklyKey(session)));

  const ids = sessions.map((session) => session.id);
  const protectedIds = new Set<string>();
  for (const session of sessions) {
    if (Array.isArray(session.testColumns) && session.testColumns.length > 0) {
      protectedIds.add(session.id);
    }
  }
  if (ids.length > 0) {
    // Đọc tuần tự để dùng được cả trong interactive transaction của Prisma/pg.
    const attendances = await client.attendance.findMany({
      where: { sessionId: { in: ids } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    });
    const tuitionEntries = await client.tuitionEntry.findMany({
      where: { sessionId: { in: ids } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    });
    const reports = await client.lessonReport.findMany({
      where: { sessionId: { in: ids } },
      select: { sessionId: true },
    });
    for (const row of [...attendances, ...tuitionEntries, ...reports]) {
      if (row.sessionId) protectedIds.add(row.sessionId);
    }
  }

  return {
    cls,
    options: sessions.map((session) => ({
      id: session.id,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      sequence: session.sequence,
      isOff: session.isOff,
      locked: protectedIds.has(session.id),
    })),
  };
}

/** Đặt toàn bộ danh sách ngày nghỉ tương lai của một lớp trong một lần lưu. */
export async function setClassOffDays(
  client: Client,
  classId: string,
  selectedIds: string[],
) {
  const loaded = await loadClassOffDayOptions(client, classId);
  if (!loaded) fail("Không tìm thấy lớp học.");
  if (loaded.cls.status === "FINISHED") {
    fail("Lớp đã kết thúc nên không cấu hình thêm lịch nghỉ được.");
  }

  const selected = new Set(selectedIds);
  const optionIds = new Set(loaded.options.map((option) => option.id));
  if ([...selected].some((id) => !optionIds.has(id))) {
    fail("Danh sách buổi nghỉ không còn khớp thời khoá biểu. Hãy tải lại trang và chọn lại.");
  }

  const editable = loaded.options.filter((option) => !option.locked);
  const turnOff = editable.filter((option) => selected.has(option.id) && !option.isOff);
  const resume = editable.filter((option) => !selected.has(option.id) && option.isOff);

  if (turnOff.length > 0) {
    await client.lessonSession.updateMany({
      where: { id: { in: turnOff.map((option) => option.id) } },
      data: { isOff: true },
    });
  }
  if (resume.length > 0) {
    await client.lessonSession.updateMany({
      where: { id: { in: resume.map((option) => option.id) } },
      data: { isOff: false },
    });
  }

  const before = loaded.options.filter((option) => option.isOff);
  const after = loaded.options.filter((option) =>
    option.locked ? option.isOff : selected.has(option.id),
  );

  return {
    className: loaded.cls.name,
    before: before.map((option) => ({ id: option.id, date: dateKey(option.date) })),
    after: after.map((option) => ({ id: option.id, date: dateKey(option.date) })),
    marked: turnOff.length,
    unmarked: resume.length,
    changedSessionIds: [...turnOff, ...resume].map((option) => option.id),
  };
}
