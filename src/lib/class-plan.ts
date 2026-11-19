import { prisma } from "@/lib/prisma";
import { addDaysUtc, dateKey, todayUtc } from "@/lib/date";
import { timeToMinutes } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Kế hoạch học của một lớp: thời khoá biểu lặp theo tuần, và Syllabus rót vào đó.
 *
 * Lớp **không có ngày bắt đầu, không có ngày kết thúc**. Cấu hình lịch tuần xong là
 * lớp chạy, và chạy tới khi Admin chuyển trạng thái sang Kết thúc. Ngày bắt đầu học
 * là của **từng học viên** (`Enrollment.joinedAt`), không phải của lớp.
 *
 * Vì thế buổi học được dựng theo **chân trời thời gian**: từ hôm nay tới hôm nay +
 * `PLAN_HORIZON_DAYS` ngày, cứ đúng thời khoá biểu mà xếp — không phụ thuộc lớp đã
 * gán syllabus hay chưa. Mỗi lần khởi động server, `backfillClassSessions` đẩy chân
 * trời này tiến lên nên lớp không bao giờ hết buổi.
 *
 * Một lớp gán được nhiều Syllabus (bảng `ClassSyllabus`), dạy nối tiếp theo `order`.
 * Bài học rót xuống các buổi còn trống theo thứ tự thời gian (`assignLessons`): học
 * hết syllabus này thì gán tiếp syllabus sau là bài nối luôn vào buổi kế tiếp. Buổi
 * chưa có bài vẫn hiện trên Lịch dạy, ghi rõ "Chưa gán syllabus".
 */

type Client = Prisma.TransactionClient | typeof prisma;

/** Danh sách bài học của lớp, phẳng theo thứ tự Syllabus.

 * Ưu tiên Course Day (curriculum IELTS / giáo trình mới); bài gắn Unit cũ vẫn
 * được nối tiếp nếu chưa nằm trong Course Day.
 */
export async function loadClassLessons(client: Client, classId: string) {
  const assigned = await client.classSyllabus.findMany({
    where: { classId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      syllabus: {
        select: {
          name: true,
          courseDays: {
            orderBy: [{ sortOrder: "asc" }, { courseDayNumber: "asc" }],
            select: {
              title: true,
              unit: { select: { name: true } },
              lessons: {
                orderBy: [{ order: "asc" }, { createdAt: "asc" }],
                select: { id: true, name: true },
              },
            },
          },
          units: {
            orderBy: { order: "asc" },
            select: {
              name: true,
              lessons: { orderBy: { order: "asc" }, select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  return assigned.flatMap((item) => flattenSyllabusLessons(item.syllabus));
}

function flattenSyllabusLessons(syllabus: {
  name: string;
  courseDays: {
    title: string | null;
    unit: { name: string } | null;
    lessons: { id: string; name: string }[];
  }[];
  units: { name: string; lessons: { id: string; name: string }[] }[];
}) {
  const out: { id: string; name: string; unitName: string; syllabusName: string }[] = [];
  const seen = new Set<string>();
  for (const day of syllabus.courseDays) {
    for (const lesson of day.lessons) {
      if (seen.has(lesson.id)) continue;
      seen.add(lesson.id);
      out.push({
        id: lesson.id,
        name: lesson.name,
        unitName: day.unit?.name ?? day.title ?? syllabus.name,
        syllabusName: syllabus.name,
      });
    }
  }
  for (const unit of syllabus.units) {
    for (const lesson of unit.lessons) {
      if (seen.has(lesson.id)) continue;
      seen.add(lesson.id);
      out.push({
        id: lesson.id,
        name: lesson.name,
        unitName: unit.name,
        syllabusName: syllabus.name,
      });
    }
  }
  return out;
}

/** Id của mọi syllabus đang gán cho lớp — dùng để kiểm tra bài học có thuộc lớp không. */
export async function classSyllabusIds(client: Client, classId: string) {
  const rows = await client.classSyllabus.findMany({
    where: { classId },
    select: { syllabusId: true },
  });
  return rows.map((row) => row.syllabusId);
}

/**
 * Vị trí bài học trong Syllabus của lớp: `classId` → (`syllabusLessonId` → thứ tự) kèm tổng số bài.
 * Gộp một truy vấn cho nhiều lớp để màn Lịch dạy không phải hỏi từng lớp một.
 */
export async function classLessonPositions(client: Client, classIds: string[]) {
  const byClass = new Map<string, { order: Map<string, number>; total: number }>();
  if (classIds.length === 0) return byClass;

  const assigned = await client.classSyllabus.findMany({
    where: { classId: { in: classIds } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      classId: true,
      syllabus: {
        select: {
          courseDays: {
            orderBy: [{ sortOrder: "asc" }, { courseDayNumber: "asc" }],
            select: {
              lessons: {
                orderBy: [{ order: "asc" }, { createdAt: "asc" }],
                select: { id: true },
              },
            },
          },
          units: {
            orderBy: { order: "asc" },
            select: { lessons: { orderBy: { order: "asc" }, select: { id: true } } },
          },
        },
      },
    },
  });

  for (const item of assigned) {
    let entry = byClass.get(item.classId);
    if (!entry) {
      entry = { order: new Map(), total: 0 };
      byClass.set(item.classId, entry);
    }
    const seen = new Set<string>();
    for (const day of item.syllabus.courseDays) {
      for (const lesson of day.lessons) {
        if (seen.has(lesson.id)) continue;
        seen.add(lesson.id);
        entry.total += 1;
        entry.order.set(lesson.id, entry.total);
      }
    }
    for (const unit of item.syllabus.units) {
      for (const lesson of unit.lessons) {
        if (seen.has(lesson.id)) continue;
        seen.add(lesson.id);
        entry.total += 1;
        entry.order.set(lesson.id, entry.total);
      }
    }
  }
  return byClass;
}

/**
 * Dựng buổi trước bao nhiêu ngày kể từ hôm nay.
 *
 * Lớp không có ngày kết thúc nên phải chốt một chân trời, nếu không sẽ dựng vô hạn.
 * ~6 tháng: setup lịch tuần là có buổi thật trên lịch, đủ nhìn cả học kỳ.
 */
export const PLAN_HORIZON_DAYS = 183;

/** Một ô trên màn lịch được nhận diện bằng ngày + giờ bắt đầu. */
function slotKey(slot: { date: Date; startTime: string }) {
  return `${dateKey(slot.date)} ${slot.startTime}`;
}

/** Một buổi do thời khoá biểu sinh ra phải khớp cả giờ kết thúc. */
function plannedSlotKey(slot: { date: Date; startTime: string; endTime: string }) {
  return `${slotKey(slot)} ${slot.endTime}`;
}

/** Nhận diện một ô lặp hằng tuần, dùng để đối chiếu lịch cũ khi Admin đổi thời khoá biểu. */
function weeklySlotKey(slot: { weekday: number; startTime: string; endTime: string }) {
  return `${slot.weekday} ${slot.startTime} ${slot.endTime}`;
}

function sessionWeeklySlotKey(slot: { date: Date; startTime: string; endTime: string }) {
  return weeklySlotKey({
    weekday: slot.date.getUTCDay(),
    startTime: slot.startTime,
    endTime: slot.endTime,
  });
}

/** Trải lịch tuần thành từng buổi cụ thể trong khoảng `[from, to]`. */
function spreadSchedule(
  from: Date,
  to: Date,
  schedules: { weekday: number; startTime: string; endTime: string }[],
) {
  const weekly = [...schedules].sort(
    (a, b) => a.weekday - b.weekday || timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );
  const slots: { date: Date; startTime: string; endTime: string }[] = [];

  for (let day = from; day <= to; day = addDaysUtc(day, 1)) {
    for (const slot of weekly) {
      if (slot.weekday !== day.getUTCDay()) continue;
      slots.push({ date: day, startTime: slot.startTime, endTime: slot.endTime });
    }
  }
  return slots;
}

/**
 * Rót bài của Syllabus xuống các buổi còn trống, theo thứ tự thời gian.
 *
 * Đây là chỗ hiện thực "học hết syllabus này thì học tiếp syllabus tiếp theo": bài
 * nào chưa buổi nào nhận thì xếp vào buổi trống gần nhất, nên gán thêm syllabus lúc
 * nào cũng nối đúng vào buổi kế tiếp chứ không lùi về buổi đầu.
 *
 * - Buổi đã có bài giữ nguyên (**R12**), buổi đã dạy xong hoặc đã huỷ không đụng tới.
 * - Buổi thêm là buổi rời do Admin đặt, không nhận bài và không chiếm chỗ của bài nào.
 * - Hết bài mà còn buổi thì buổi đó để trống — trên Lịch dạy hiện "Chưa gán syllabus".
 */
export async function assignLessons(client: Client, classId: string) {
  const lessons = await loadClassLessons(client, classId);
  if (lessons.length === 0) return 0;

  const sessions = await client.lessonSession.findMany({
    where: { classId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, status: true, isExtra: true, syllabusLessonId: true },
  });

  const taken = new Set(
    sessions.map((session) => session.syllabusLessonId).filter(Boolean) as string[],
  );
  const free = lessons.filter((lesson) => !taken.has(lesson.id));
  if (free.length === 0) return 0;

  const empty = sessions.filter(
    (session) => !session.isExtra && !session.syllabusLessonId && session.status === "SCHEDULED",
  );

  const pairs = Math.min(empty.length, free.length);
  for (let i = 0; i < pairs; i += 1) {
    await client.lessonSession.update({
      where: { id: empty[i].id },
      data: { syllabusLessonId: free[i].id },
    });
  }
  return pairs;
}

/**
 * Dựng buổi học của lớp đúng bằng lịch tuần đã cấu hình, trong chân trời
 * `[hôm nay, hôm nay + PLAN_HORIZON_DAYS]`. Nhờ vậy cấu hình lịch trong chi tiết lớp
 * là lịch dạy hiện ra ngay, không có bước "sinh buổi" riêng.
 *
 * - **Không cần syllabus**: lớp thường cứ điểm danh hằng ngày là chạy được; bài học
 *   gán sau lúc nào cũng được, `assignLessons` rót vào các buổi còn trống.
 * - Buổi mới lấy phòng / giáo viên mặc định của lớp.
 * - Buổi lệch lịch mới chỉ bị xoá khi còn `SCHEDULED`, chưa điểm danh/báo cáo, chưa
 *   phát sinh học phí, không phải buổi bù và không phải buổi thêm. Khi vừa đổi lịch tuần,
 *   buổi rỗng của lịch cũ được dọn cả ở ngày đã qua; buổi có dữ liệu luôn giữ làm lịch sử.
 * - Lớp đã Kết thúc thì dừng dựng buổi.
 */
export async function syncClassSessions(
  client: Client,
  classId: string,
  options?: {
    /**
     * Lịch tuần trước khi vừa được thay đổi. Có giá trị này thì các buổi rỗng của lịch cũ
     * được dọn cả ở những ngày đã qua; buổi có dấu vết dạy học luôn được giữ làm lịch sử.
     */
    previousSchedules?: { weekday: number; startTime: string; endTime: string }[];
    /** Tắt bước rót bài khi đang ở transaction; caller sẽ rót ngay sau khi commit. */
    assignLessons?: boolean;
  },
) {
  const classRow = await client.class.findUnique({
    where: { id: classId },
    select: {
      status: true,
      roomId: true,
      teacherId: true,
    },
  });
  if (!classRow || classRow.status === "FINISHED") {
    return { created: 0, removed: 0 };
  }
  // Đọc relation tuần tự để driver PostgreSQL không phải chạy hai query đồng thời trên
  // cùng interactive transaction (pg@9 sẽ không còn cho phép cách đó).
  const schedules = await client.classSchedule.findMany({
    where: { classId },
    select: { weekday: true, startTime: true, endTime: true },
  });
  const cls = { ...classRow, schedules };
  if (cls.schedules.length === 0 && options?.previousSchedules === undefined) {
    return { created: 0, removed: 0 };
  }

  const from = todayUtc();
  const to = addDaysUtc(from, PLAN_HORIZON_DAYS);
  // Tự sửa những ô lịch cũ còn sót trong bảy ngày gần nhất từ trước khi bản vá đổi lịch
  // được triển khai. Khoảng ngắn này phủ màn tuần hiện tại mà không quét sâu vào lịch sử.
  const recentRepairStart = addDaysUtc(from, -7);

  const existing = await client.lessonSession.findMany({
    where: { classId },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      sequence: true,
      status: true,
      isExtra: true,
      makeupForId: true,
      testColumns: true,
    },
  });
  // Đọc ba bảng dấu vết tuần tự. Nested relation của Prisma có thể phát nhiều query song
  // song trên cùng pg transaction; pg@9 sẽ không còn cho phép cách đó.
  const existingIds = existing.map((session) => session.id);
  const protectedSessionIds = new Set<string>();
  for (const session of existing) {
    if (Array.isArray(session.testColumns) && session.testColumns.length > 0) {
      protectedSessionIds.add(session.id);
    }
  }
  if (existingIds.length > 0) {
    const attendances = await client.attendance.findMany({
      where: { sessionId: { in: existingIds } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    });
    const tuitionEntries = await client.tuitionEntry.findMany({
      where: { sessionId: { in: existingIds } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    });
    const reports = await client.lessonReport.findMany({
      where: { sessionId: { in: existingIds } },
      select: { sessionId: true },
    });
    for (const row of [...attendances, ...tuitionEntries, ...reports]) {
      if (row.sessionId) protectedSessionIds.add(row.sessionId);
    }
  }

  const wanted = spreadSchedule(from, to, cls.schedules);
  const wantedKeys = new Set(wanted.map(plannedSlotKey));
  const currentWeeklyKeys = new Set(cls.schedules.map(weeklySlotKey));
  const previousWeeklyKeys = new Set((options?.previousSchedules ?? []).map(weeklySlotKey));

  const stale = existing.filter(
    (session) => {
      const emptyPlannedSession =
        session.status === "SCHEDULED" &&
        !session.makeupForId &&
        !session.isExtra &&
        !protectedSessionIds.has(session.id);
      if (!emptyPlannedSession) return false;

      const outsideCurrentPlan =
        session.date >= from &&
        session.date <= to &&
        !wantedKeys.has(plannedSlotKey(session));

      // Khi đổi lịch giữa tuần, một buổi rỗng ở Thứ 2 (lịch cũ) vẫn phải biến mất dù
      // hôm nay đã là Thứ 3. Chỉ dọn đúng ô từng thuộc lịch cũ và không thuộc lịch mới,
      // nên buổi được Admin dời riêng ngoài thời khoá biểu không bị nhận nhầm ở đây.
      const replacedPastSlot =
        previousWeeklyKeys.size > 0 &&
        previousWeeklyKeys.has(sessionWeeklySlotKey(session)) &&
        !currentWeeklyKeys.has(sessionWeeklySlotKey(session));

      const existingRecentDuplicate =
        session.date >= recentRepairStart &&
        session.date < from &&
        !currentWeeklyKeys.has(sessionWeeklySlotKey(session));

      return outsideCurrentPlan || replacedPastSlot || existingRecentDuplicate;
    },
  );
  if (stale.length > 0) {
    await client.lessonSession.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  const staleIds = new Set(stale.map((session) => session.id));
  const kept = existing.filter((session) => !staleIds.has(session.id));
  // Buổi thêm không tính là đã lấp chỗ: nó có thể trùng đúng ngày giờ một buổi trong
  // thời khoá biểu, mà buổi theo lịch tuần thì vẫn phải có.
  const keptKeys = new Set(kept.filter((session) => !session.isExtra).map(plannedSlotKey));
  const missing = wanted.filter((slot) => !keptKeys.has(plannedSlotKey(slot)));

  if (missing.length > 0) {
    // Lớp sạch buổi thì đánh số lại từ 1; còn buổi cũ thì nối tiếp để giữ `@@unique`.
    let sequence = kept.reduce((max, session) => Math.max(max, session.sequence), 0) + 1;
    const data = missing.map((slot) => {
      const row = {
        classId,
        sequence,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        roomId: cls.roomId,
        teacherId: cls.teacherId,
      };
      sequence += 1;
      return row;
    });
    await client.lessonSession.createMany({ data });
  }

  if (options?.assignLessons !== false) await assignLessons(client, classId);
  return { created: missing.length, removed: stale.length };
}

/**
 * Đẩy chân trời buổi học của mọi lớp đang chạy tiến lên.
 *
 * Lớp không có ngày kết thúc nên buổi chỉ dựng trước `PLAN_HORIZON_DAYS` ngày. Ngày
 * trôi qua thì chân trời cũ hết dần, vì vậy mỗi lần khởi động server hàm này chạy lại
 * `syncClassSessions` cho tất cả lớp chưa Kết thúc và đã có lịch tuần — lớp luôn còn
 * buổi phía trước mà không ai phải mở lớp ra bấm Lưu lại.
 *
 * Chạy tuần tự chứ không `Promise.all`: đây là việc chạy nền lúc khởi động, xếp hàng
 * từng lớp một cho nhẹ database hơn là nhanh.
 */
export async function backfillClassSessions(client: Client) {
  const pending = await client.class.findMany({
    where: { schedules: { some: {} }, status: { not: "FINISHED" } },
    select: { id: true },
  });

  let classes = 0;
  let sessions = 0;
  for (const cls of pending) {
    const result = await syncClassSessions(client, cls.id);
    if (result.created === 0) continue;
    classes += 1;
    sessions += result.created;
  }
  return { classes, sessions };
}

/**
 * Thêm một buổi rời cho **riêng lớp này** — ngày, giờ, phòng, giáo viên tự chọn.
 *
 * Lớp cần học thêm một buổi (ôn tập, kiểm tra, bù kiến thức) thì Admin đặt hẳn buổi
 * đó, kể cả rơi **ngoài** thời khoá biểu tuần. Buổi thêm không nhận bài của Syllabus
 * (`syllabusLessonId: null`) nên kế hoạch bài học của lớp không xê dịch: buổi kế tiếp
 * theo thời khoá biểu vẫn đúng bài của nó.
 *
 * Syllabus gốc và các lớp khác không đổi gì — chỉ thêm một `LessonSession` của lớp này.
 *
 * `sequence` nối tiếp số lớn nhất đang có, không đánh số lại, nên ràng buộc
 * `@@unique([classId, sequence])` vẫn đúng và số buổi cũ giữ nguyên.
 */
export async function addExtraSession(
  client: Client,
  input: {
    classId: string;
    date: Date;
    startTime: string;
    endTime: string;
    roomId: string | null;
    teacherId: string | null;
    academicStaffId?: string | null;
  },
) {
  const last = await client.lessonSession.findFirst({
    where: { classId: input.classId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  const session = await client.lessonSession.create({
    data: {
      classId: input.classId,
      sequence: (last?.sequence ?? 0) + 1,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      roomId: input.roomId,
      teacherId: input.teacherId,
      academicStaffId: input.academicStaffId ?? null,
      syllabusLessonId: null,
      isExtra: true,
    },
    select: { id: true, sequence: true },
  });

  return session;
}

/**
 * Lịch dự kiến của các lớp đang chạy, cho khoảng thời gian **vượt quá chân trời**
 * `PLAN_HORIZON_DAYS` — nơi buổi học chưa được dựng vào database.
 *
 * Admin xem lịch tháng sau nữa vẫn thấy lớp nào chiếm phòng / giờ nào, dù buổi đó
 * chưa tồn tại. Đây là dữ liệu suy ra lúc hiển thị: ô nào đã có `LessonSession` thật
 * trong khoảng đang xem thì bỏ qua, không vẽ trùng.
 */
export async function classScheduleHoles(
  client: Client,
  range: { from: Date; to: Date },
  filter: { teacherId?: string; classId?: string; branchId?: string },
) {
  const where = {
    status: { not: "FINISHED" as const },
    schedules: { some: {} },
    ...(filter.classId ? { id: filter.classId } : {}),
    ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
    ...(filter.branchId ? { branchId: filter.branchId } : {}),
  };

  const [classes, booked] = await Promise.all([
    client.class.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        room: { select: { id: true, name: true } },
        teacher: { select: { id: true, user: { select: { fullName: true } } } },
        schedules: { select: { weekday: true, startTime: true, endTime: true } },
      },
    }),
    client.lessonSession.findMany({
      where: { class: where, date: { gte: range.from, lte: range.to } },
      select: { classId: true, date: true, startTime: true },
    }),
  ]);

  const covered = new Set(booked.map((session) => `${session.classId} ${slotKey(session)}`));

  const slots: {
    classId: string;
    className: string;
    classCode: string;
    roomId: string | null;
    teacherId: string | null;
    roomName: string | null;
    teacherName: string | null;
    reason: string;
    date: Date;
    startTime: string;
    endTime: string;
  }[] = [];

  for (const cls of classes) {
    for (let day = new Date(range.from); day <= range.to; day = addDaysUtc(day, 1)) {
      for (const slot of cls.schedules) {
        if (slot.weekday !== day.getUTCDay()) continue;
        if (covered.has(`${cls.id} ${dateKey(day)} ${slot.startTime}`)) continue;
        slots.push({
          classId: cls.id,
          className: cls.name,
          classCode: cls.code,
          roomId: cls.room?.id ?? null,
          teacherId: cls.teacher?.id ?? null,
          roomName: cls.room?.name ?? null,
          teacherName: cls.teacher?.user.fullName ?? null,
          reason: "Lịch dự kiến theo thời khoá biểu",
          date: day,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
      }
    }
  }
  return slots;
}
