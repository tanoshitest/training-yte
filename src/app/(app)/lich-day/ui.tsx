import Link from "next/link";
import {
  Ban,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  User,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { ModalForm } from "@/components/ui/modal";
import { cn, WEEKDAY_LABELS, WEEKDAY_SHORT, timeToMinutes } from "@/lib/utils";
import {
  addDaysUtc,
  dateKey,
  eachDayUtc,
  endOfMonthUtc,
  formatDateUtc,
  formatDayMonth,
  formatMonthLabel,
  startOfMonthUtc,
  startOfWeekUtc,
  todayUtc,
} from "@/lib/date";
import type { SessionStatus } from "@/generated/prisma/enums";
import { createExtraSession, createPlannedSession, updateSession } from "./actions";

/**
 * Giao diện lịch dạy dùng chung cho Admin (`/lich-day`) và Giáo viên (`/gv/lich-day`).
 * Tất cả đều là Server Component: điều hướng bằng link `?view=&date=`, lọc bằng form GET.
 *
 * Chỉ Admin truyền `edit` nên chỉ Admin bấm vào buổi mới ra popup xếp phòng / giáo viên
 * và dời buổi. Giáo viên truyền `sessionHref` để mở thẳng tab điểm danh của lớp.
 */

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const VIEW_LABEL: Record<CalendarView, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
};

export function parseView(raw?: string | null): CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(raw ?? "")
    ? (raw as CalendarView)
    : "week";
}

/** Khoảng ngày cần truy vấn cho từng chế độ xem. Tháng luôn lấy tròn tuần để lưới đủ ô. */
export function calendarRange(view: CalendarView, date: Date) {
  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    const from = startOfWeekUtc(date);
    return { from, to: addDaysUtc(from, 6) };
  }
  const from = startOfWeekUtc(startOfMonthUtc(date));
  const lastWeek = startOfWeekUtc(endOfMonthUtc(date));
  return { from, to: addDaysUtc(lastWeek, 6) };
}

/** Ngày mà nút ‹ › nhảy tới. */
function step(view: CalendarView, date: Date, direction: 1 | -1) {
  if (view === "day") return addDaysUtc(date, direction);
  if (view === "week") return addDaysUtc(date, 7 * direction);
  const month = startOfMonthUtc(date);
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + direction, 1));
}

export function rangeLabel(view: CalendarView, date: Date) {
  if (view === "day") {
    return `${WEEKDAY_SHORT[date.getUTCDay()]}, ${formatDateUtc(date)}`;
  }
  if (view === "week") {
    const from = startOfWeekUtc(date);
    return `${formatDateUtc(from)} – ${formatDateUtc(addDaysUtc(from, 6))}`;
  }
  return formatMonthLabel(date);
}

export type CalendarSession = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: SessionStatus;
  sequence: number;
  classId: string;
  className: string;
  classCode: string;
  roomName: string | null;
  teacherName: string | null;
  academicStaffName?: string | null;
  lessonName: string | null;
  syllabusName: string | null;
  /** Buổi thêm của riêng lớp — không có bài trong Syllabus. */
  isExtra: boolean;
  /** Học vụ đánh dấu cả lớp nghỉ — thẻ mờ và ghi chú Nghỉ học. */
  isOff?: boolean;
  /** Bài này là bài thứ mấy trong Syllabus của lớp; chưa gán bài thì `null`. */
  lessonNo: number | null;
  /** Tổng số bài của các syllabus đã gán cho lớp. */
  lessonTotal: number;
  /** Chỉ cần cho popup sửa buổi của Admin. */
  roomId?: string | null;
  teacherId?: string | null;
  academicStaffId?: string | null;
  /** Có ít nhất một cột điểm kiểm tra đã lưu. */
  isTest?: boolean;
  /**
   * Ô mờ suy ra từ thời khoá biểu của lớp khi buổi chưa có trong database.
   * Bấm vào mở popup tạo buổi. Nội dung là lý do hiện trên thẻ
   * ("Lịch dự kiến theo thời khoá biểu").
   */
  placeholder?: string | null;
};

/** Vị trí bài học của buổi trong Syllabus của lớp, ví dụ "Bài 10/100". */
function lessonPosition(session: CalendarSession) {
  if (session.placeholder) return session.placeholder;
  if (session.isExtra) return "Buổi thêm của lớp";
  if (!session.lessonNo) return "Chưa gán syllabus";
  return `Bài ${session.lessonNo}/${session.lessonTotal}`;
}

/** Danh sách phòng và giáo viên cho popup sửa buổi. Có prop này nghĩa là bật chế độ sửa. */
export type CalendarEditOptions = {
  rooms: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  academics: { id: string; name: string }[];
};

function assigneeValue(session: Pick<CalendarSession, "teacherId" | "academicStaffId">) {
  if (session.academicStaffId) return `academic:${session.academicStaffId}`;
  if (session.teacherId) return `teacher:${session.teacherId}`;
  return "";
}

function assigneeLabel(session: Pick<CalendarSession, "teacherName" | "academicStaffName">) {
  if (session.academicStaffName) return `Học vụ · ${session.academicStaffName}`;
  return session.teacherName ?? "Chưa phân công";
}

function AssigneeSelect({ session, edit }: { session: CalendarSession; edit: CalendarEditOptions }) {
  return (
    <Select name="assignee" defaultValue={assigneeValue(session)}>
      <option value="">— Chưa phân công —</option>
      <optgroup label="Giáo viên">
        {edit.teachers.map((teacher) => (
          <option key={teacher.id} value={`teacher:${teacher.id}`}>
            {teacher.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Học vụ">
        {edit.academics.map((academic) => (
          <option key={academic.id} value={`academic:${academic.id}`}>
            {academic.name}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}

type NavProps = {
  basePath: string;
  view: CalendarView;
  date: Date;
  /** Các tham số lọc hiện tại, được giữ lại khi đổi ngày / chế độ xem. */
  params: Record<string, string>;
  /** Bộ lọc nằm chung một dòng với thanh điều hướng cho gọn. */
  children?: React.ReactNode;
};

function href(basePath: string, params: Record<string, string>, patch: Record<string, string>) {
  const search = new URLSearchParams({ ...params, ...patch });
  return `${basePath}?${search.toString()}`;
}

/**
 * Trang lịch: tiêu đề + bộ lọc đứng yên, chỉ lưới bên dưới cuộn.
 * Phải là con trực tiếp của `main` (`flex flex-col`) để `flex-1` lấp đúng phần còn lại.
 */
export function CalendarPage({
  chrome,
  children,
}: {
  chrome?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {chrome ? <div className="shrink-0">{chrome}</div> : null}
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", chrome && "mt-3")}>{children}</div>
    </div>
  );
}

export function CalendarNav({ basePath, view, date, params, children }: NavProps) {
  const navClass = buttonClass("ghost", "sm", "px-2");

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-2">
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={href(basePath, params, { view, date: dateKey(step(view, date, -1)) })}
          className={navClass}
          aria-label="Kỳ trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link
          href={href(basePath, params, { view, date: dateKey(todayUtc()) })}
          className={buttonClass("ghost", "sm")}
        >
          Hôm nay
        </Link>
        <Link
          href={href(basePath, params, { view, date: dateKey(step(view, date, 1)) })}
          className={navClass}
          aria-label="Kỳ sau"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        <span className="ml-2 text-sm font-medium whitespace-nowrap text-slate-700">
          {rangeLabel(view, date)}
        </span>
      </div>

      {children ? <div className="min-w-0 flex-1">{children}</div> : null}

      <div className="ml-auto flex shrink-0 rounded-lg border border-slate-200 p-0.5">
        {CALENDAR_VIEWS.map((item) => (
          <Link
            key={item}
            href={href(basePath, params, { view: item, date: dateKey(date) })}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition",
              item === view
                ? "bg-brand-600 font-medium text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {VIEW_LABEL[item]}
          </Link>
        ))}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<SessionStatus, string> = {
  SCHEDULED: "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  CANCELLED: "border-red-200 bg-red-50 text-red-700 line-through hover:bg-red-100",
};

/** Các trường trong popup: dời buổi (ngày / giờ), xếp phòng và phân công giáo viên. */
function SessionEditFields({
  session,
  hrefBase,
  edit,
}: {
  session: CalendarSession;
  hrefBase: string;
  edit: CalendarEditOptions;
}) {
  return (
    <>
      <input type="hidden" name="id" value={session.id} />

      <p className="text-xs text-slate-500">
        {session.classCode} · Buổi {session.sequence} ·{" "}
        {WEEKDAY_SHORT[session.date.getUTCDay()]}, {formatDateUtc(session.date)} ·{" "}
        {session.startTime}–{session.endTime}
      </p>

      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="font-medium text-slate-700">{lessonPosition(session)}</span>
        {session.lessonName ? <span className="truncate">· {session.lessonName}</span> : null}
        {session.syllabusName ? (
          <span className="truncate text-slate-500">· {session.syllabusName}</span>
        ) : null}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Ngày học">
          <Input type="date" name="date" defaultValue={dateKey(session.date)} required />
        </Field>
        <Field label="Giờ bắt đầu">
          <Input type="time" name="startTime" defaultValue={session.startTime} required />
        </Field>
        <Field label="Giờ kết thúc">
          <Input type="time" name="endTime" defaultValue={session.endTime} required />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phòng">
          <Select name="roomId" defaultValue={session.roomId ?? ""}>
            <option value="">— Chưa xếp phòng —</option>
            {edit.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Người phụ trách" hint="Chọn Học vụ cho buổi kiểm tra; buổi này sẽ không yêu cầu nhận xét giáo viên.">
          <AssigneeSelect session={session} edit={edit} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" name="ignoreConflict" value="1" className="h-4 w-4" />
        Bỏ qua cảnh báo trùng lịch
      </label>

      <p className="text-xs text-slate-500">
        Bài học trong Syllabus giữ nguyên (R12).{" "}
        <Link href={sessionDetailHref(hrefBase, session)} className="text-brand-700 hover:underline">
          Mở trang chi tiết buổi
        </Link>{" "}
        để điểm danh, đổi bài học hoặc huỷ buổi.
      </p>

    </>
  );
}

/**
 * Các trường của popup «Thêm buổi»: một buổi rời cho riêng lớp, ngày giờ tự chọn nên
 * đặt được cả **ngoài** thời khoá biểu tuần. Mặc định lấy đúng khung giờ, phòng và
 * giáo viên của buổi đang mở cho đỡ phải nhập lại.
 */
function ExtraSessionFields({
  session,
  edit,
  planned = false,
}: {
  session: CalendarSession;
  edit: CalendarEditOptions;
  /** Thẻ mờ thời khoá biểu — dựng buổi thật, không phải buổi thêm. */
  planned?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="classId" value={session.classId} />

      <p className="text-xs text-slate-500">
        {planned
          ? `${session.placeholder ?? "Lịch dự kiến theo thời khoá biểu"}. Buổi chưa có trên hệ thống — lưu để dựng buổi theo thời khoá biểu, nhận bài Syllabus như buổi bình thường.`
          : `Buổi thêm chỉ thuộc lớp ${session.className} (${session.classCode}), không nhận bài của Syllabus nên kế hoạch bài học của lớp giữ nguyên. Syllabus gốc và các lớp khác không đổi.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Ngày học" hint="Đặt được cả ngày ngoài thời khoá biểu tuần.">
          <Input type="date" name="date" defaultValue={dateKey(session.date)} required />
        </Field>
        <Field label="Giờ bắt đầu">
          <Input type="time" name="startTime" defaultValue={session.startTime} required />
        </Field>
        <Field label="Giờ kết thúc">
          <Input type="time" name="endTime" defaultValue={session.endTime} required />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phòng">
          <Select name="roomId" defaultValue={session.roomId ?? ""}>
            <option value="">— Chưa xếp phòng —</option>
            {edit.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Người phụ trách">
          <AssigneeSelect session={session} edit={edit} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" name="ignoreConflict" value="1" className="h-4 w-4" />
        Bỏ qua cảnh báo trùng lịch
      </label>
    </>
  );
}

/**
 * Vỏ bấm được của thẻ buổi học. Admin bấm ra popup cấu hình; giáo viên — và cả buổi đã huỷ,
 * vì buổi huỷ không sửa được — thì mở trang chi tiết.
 */
function sessionDetailHref(
  hrefBase: string,
  session: CalendarSession,
  sessionHref?: (session: CalendarSession) => string,
) {
  if (sessionHref) return sessionHref(session);
  return `${hrefBase}/${session.id}`;
}

function SessionTrigger({
  session,
  hrefBase,
  sessionHref,
  edit,
  className,
  title,
  children,
}: {
  session: CalendarSession;
  hrefBase: string;
  sessionHref?: (session: CalendarSession) => string;
  edit?: CalendarEditOptions;
  className: string;
  title: string;
  children: React.ReactNode;
}) {
  // Ô mờ chưa có buổi thật: cùng popup với buổi thường, lưu thì dựng buổi.
  if (session.placeholder) {
    if (!edit) {
      return (
        <Link href={`/lop-hoc/${session.classId}?tab=diem-danh`} title={title} className={className}>
          {children}
        </Link>
      );
    }
    return (
      <ModalForm
        action={createPlannedSession}
        title={`${session.className}`}
        submitLabel="Tạo buổi"
        wide
        triggerClassName={className}
        triggerTitle={title}
        trigger={children}
      >
        <ExtraSessionFields session={session} edit={edit} planned />
      </ModalForm>
    );
  }

  if (!edit || session.status === "CANCELLED") {
    return (
      <Link href={sessionDetailHref(hrefBase, session, sessionHref)} title={title} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <ModalForm
      action={updateSession}
      title={`Buổi ${session.sequence} · ${session.className}`}
      submitLabel="Lưu thay đổi"
      secondary={
        session.status === "SCHEDULED" ? (
          <ModalForm
            action={createExtraSession}
            title={`Thêm buổi · ${session.className}`}
            submitLabel="Lưu buổi thêm"
            triggerClassName={buttonClass("outline", "md")}
            trigger={
              <>
                <Plus className="h-4 w-4" />
                Thêm buổi
              </>
            }
            wide
          >
            <ExtraSessionFields session={session} edit={edit} />
          </ModalForm>
        ) : undefined
      }
      wide
      triggerClassName={className}
      triggerTitle={title}
      trigger={children}
    >
      <SessionEditFields session={session} hrefBase={hrefBase} edit={edit} />
    </ModalForm>
  );
}

/** Chú thích hiện khi rê chuột lên thẻ buổi học. */
function sessionTitle(session: CalendarSession) {
  if (session.placeholder) {
    return [
      `${session.className} · ${session.placeholder}`,
      `${session.startTime}–${session.endTime}`,
      session.roomName ? `Phòng ${session.roomName}` : "Chưa xếp phòng",
      assigneeLabel(session),
      "Buổi chưa được dựng. Bấm để tạo buổi trên lịch.",
    ].join("\n");
  }

  return [
    `Buổi ${session.sequence} · ${session.className}`,
    `${session.startTime}–${session.endTime}`,
    session.roomName ? `Phòng ${session.roomName}` : "Chưa xếp phòng",
    assigneeLabel(session),
    session.isTest ? "Buổi kiểm tra" : null,
    [lessonPosition(session), session.lessonName].filter(Boolean).join(" · "),
    session.isOff ? "Nghỉ học — cả lớp nghỉ không tính phí" : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function SessionChip({
  session,
  hrefBase,
  sessionHref,
  edit,
  compact = false,
}: {
  session: CalendarSession;
  hrefBase: string;
  sessionHref?: (session: CalendarSession) => string;
  edit?: CalendarEditOptions;
  compact?: boolean;
}) {
  return (
    <SessionTrigger
      session={session}
      hrefBase={hrefBase}
      sessionHref={sessionHref}
      edit={edit}
      title={sessionTitle(session)}
      className={cn(
        "block w-full truncate rounded-md border px-2 py-1 text-left text-xs transition",
        session.isOff
          ? "border-slate-200 bg-slate-100 text-slate-500 opacity-60 hover:bg-slate-100"
          : STATUS_STYLE[session.status],
        session.placeholder && "border-dashed opacity-70",
      )}
    >
      <span className="font-mono">{session.startTime}</span>{" "}
      <span className={cn("font-medium", session.isOff && "line-through")}>{session.className}</span>
      {session.isOff ? <span className="opacity-80"> · Nghỉ học</span> : null}
      {!compact && session.roomName ? (
        <span className="opacity-70"> · {session.roomName}</span>
      ) : null}
    </SessionTrigger>
  );
}

/**
 * Màu thẻ đi theo lớp chứ không theo trạng thái: nhìn lưới là nhận ra ngay lớp nào
 * học ngày nào, giống Google Calendar. Trạng thái vẫn đọc được qua icon trên thẻ.
 */
const CLASS_TONES = [
  "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100",
  "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
  "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
  "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
] as const;

/** Cùng một lớp luôn ra cùng một màu, kể cả khi đổi tuần hay đổi bộ lọc. */
function classTone(classId: string) {
  let sum = 0;
  for (let i = 0; i < classId.length; i++) sum = (sum + classId.charCodeAt(i)) % 997;
  return CLASS_TONES[sum % CLASS_TONES.length];
}

function sortSessions(sessions: CalendarSession[]) {
  return [...sessions].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className),
  );
}

/**
 * Thứ tự hàng trong một khung giờ: mỗi lớp một làn, giữ nguyên vị trí xuyên suốt các ngày
 * trong tuần để NT2A 054 luôn nằm cùng một hàng ngang.
 */
function classLanesForSlot(
  sessions: CalendarSession[],
  slot: { startTime: string; endTime: string },
  days: Date[],
) {
  const maxByClass = new Map<string, { className: string; classCode: string; count: number }>();
  for (const day of days) {
    const dayKey = dateKey(day);
    const counts = new Map<string, number>();
    for (const session of sessions) {
      if (session.startTime !== slot.startTime || session.endTime !== slot.endTime) continue;
      if (dateKey(session.date) !== dayKey) continue;
      counts.set(session.classId, (counts.get(session.classId) ?? 0) + 1);
      if (!maxByClass.has(session.classId)) {
        maxByClass.set(session.classId, {
          className: session.className,
          classCode: session.classCode,
          count: 1,
        });
      }
    }
    for (const [classId, count] of counts) {
      const row = maxByClass.get(classId);
      if (row && count > row.count) row.count = count;
    }
  }

  return [...maxByClass.entries()]
    .sort(
      (a, b) =>
        a[1].className.localeCompare(b[1].className, "vi") || a[1].classCode.localeCompare(b[1].classCode),
    )
    .flatMap(([classId, info]) => Array.from({ length: info.count }, (_, index) => ({ classId, index })));
}

function groupByDay(sessions: CalendarSession[]) {
  const map = new Map<string, CalendarSession[]>();
  for (const session of sessions) {
    const key = dateKey(session.date);
    const bucket = map.get(key);
    if (bucket) bucket.push(session);
    else map.set(key, [session]);
  }
  for (const [key, bucket] of map) map.set(key, sortSessions(bucket));
  return map;
}

/** Thẻ buổi trên lưới: tên lớp + giáo viên. Chi tiết còn trong tooltip / popup. */
function SessionCard({
  session,
  hrefBase,
  sessionHref,
  edit,
}: {
  session: CalendarSession;
  hrefBase: string;
  sessionHref?: (session: CalendarSession) => string;
  edit?: CalendarEditOptions;
}) {
  const cancelled = session.status === "CANCELLED";
  const off = !!session.isOff;

  return (
    <SessionTrigger
      session={session}
      hrefBase={hrefBase}
      sessionHref={sessionHref}
      edit={edit}
      title={sessionTitle(session)}
      className={cn(
        "block h-full w-full rounded-md border px-2 py-1 text-left transition",
        classTone(session.classId),
        (cancelled || off) && "opacity-50",
        off && "grayscale",
        session.placeholder && "border-dashed opacity-70",
      )}
    >
      <p className="flex items-center gap-1">
        <span className={cn("min-w-0 flex-1 truncate text-xs font-semibold", (cancelled || off) && "line-through")}>
          {session.className}
        </span>
        {off ? (
          <Ban className="h-3 w-3 shrink-0 text-slate-500" aria-label="Nghỉ học" />
        ) : session.status === "COMPLETED" ? (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Hoàn thành" />
        ) : cancelled ? (
          <Ban className="h-3 w-3 shrink-0 text-red-500" aria-label="Đã huỷ" />
        ) : null}
      </p>
      {off ? (
        <p className="truncate text-[11px] leading-tight text-slate-500">Nghỉ học</p>
      ) : (
        <p className="flex items-center gap-1 text-[11px] leading-tight text-slate-600">
          <User className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="truncate">
            {session.isTest ? "Kiểm tra · " : ""}{assigneeLabel(session)}
          </span>
        </p>
      )}
    </SessionTrigger>
  );
}

/**
 * Gom các buổi thành từng khung giờ. Mỗi khung giờ là một dòng của lưới — trung tâm
 * dạy theo ca cố định nên chỉ cần đúng những khung giờ có lớp, không cần trục 24 giờ.
 */
function timeSlots(sessions: CalendarSession[]) {
  const map = new Map<string, { startTime: string; endTime: string }>();
  for (const session of sessions) {
    const key = `${session.startTime}-${session.endTime}`;
    if (!map.has(key)) map.set(key, { startTime: session.startTime, endTime: session.endTime });
  }
  return [...map.values()].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      || timeToMinutes(a.endTime) - timeToMinutes(b.endTime),
  );
}

/** Lưới Giờ × Thứ kiểu Google Calendar. Dùng chung cho chế độ xem Ngày (1 cột) và Tuần (7 cột). */
function TimeGridView({
  days,
  sessions,
  hrefBase,
  sessionHref,
  edit,
}: {
  days: Date[];
  sessions: CalendarSession[];
  hrefBase: string;
  sessionHref?: (session: CalendarSession) => string;
  edit?: CalendarEditOptions;
}) {
  const slots = timeSlots(sessions);
  const week = days.length > 1;

  if (slots.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">Không có buổi học nào.</p>;
  }

  // Tra buổi theo "ngày + khung giờ" cho từng ô.
  const byCell = new Map<string, CalendarSession[]>();
  for (const session of sortSessions(sessions)) {
    const key = `${dateKey(session.date)}|${session.startTime}-${session.endTime}`;
    const bucket = byCell.get(key);
    if (bucket) bucket.push(session);
    else byCell.set(key, [session]);
  }

  return (
    <div
      className={cn(
        "grid gap-px bg-slate-200",
        week
          ? "min-w-[68rem] grid-cols-[6rem_repeat(7,minmax(0,1fr))]"
          : "grid-cols-[6rem_minmax(0,1fr)]",
      )}
    >
      {/* Hàng thứ/ngày dính khi cuộn các khung giờ. */}
      <div className="sticky top-0 z-[1] bg-slate-50 px-3 py-2.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Giờ
      </div>
      {days.map((day) => (
        <div key={dateKey(day)} className="sticky top-0 z-[1] bg-slate-50 px-3 py-2">
          <p className="text-sm font-semibold text-slate-800">
            {day.getUTCDay() === 0 ? "CN" : WEEKDAY_LABELS[day.getUTCDay()]}
          </p>
          <p className="text-xs font-medium text-slate-600">{formatDayMonth(day)}</p>
        </div>
      ))}

      {/* Mỗi khung giờ: các lớp cùng tên/cùng mã nằm cùng một hàng ngang xuyên tuần. */}
      {slots.map((slot) => {
        const lanes = classLanesForSlot(sessions, slot, days);
        return (
          <div key={`${slot.startTime}-${slot.endTime}`} className="contents">
            <div
              className="bg-white px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-600"
              style={{ gridRow: `span ${Math.max(lanes.length, 1)}` }}
            >
              {slot.startTime} – {slot.endTime}
            </div>
            {lanes.map((lane) =>
              days.map((day) => {
                const key = dateKey(day);
                const items = byCell.get(`${key}|${slot.startTime}-${slot.endTime}`) ?? [];
                const matches = items.filter((session) => session.classId === lane.classId);
                const session = matches[lane.index];
                return (
                  <div key={`${lane.classId}-${lane.index}-${key}`} className="bg-white p-1.5">
                    {session ? (
                      <SessionCard session={session} hrefBase={hrefBase} sessionHref={sessionHref} edit={edit} />
                    ) : (
                      <div className="min-h-[2.75rem]" />
                    )}
                  </div>
                );
              }),
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  from,
  to,
  month,
  sessions,
  hrefBase,
  sessionHref,
  edit,
}: {
  from: Date;
  to: Date;
  month: Date;
  sessions: CalendarSession[];
  hrefBase: string;
  sessionHref?: (session: CalendarSession) => string;
  edit?: CalendarEditOptions;
}) {
  const byDay = groupByDay(sessions);
  const days = eachDayUtc(from, to);
  const today = dateKey(todayUtc());
  const currentMonth = month.getUTCMonth();

  return (
    <div>
      <div className="sticky top-0 z-[1] hidden grid-cols-7 border-b border-slate-200 bg-white md:grid">
        {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
          <p key={weekday} className="px-2 py-2 text-center text-xs font-medium text-slate-500">
            {WEEKDAY_SHORT[weekday]}
          </p>
        ))}
      </div>
      <div className="grid gap-px bg-slate-200 md:grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const items = byDay.get(key) ?? [];
          const outside = day.getUTCMonth() !== currentMonth;
          return (
            <div
              key={key}
              className={cn("min-h-24 space-y-1 p-1.5", outside ? "bg-slate-50" : "bg-white")}
            >
              <p
                className={cn(
                  "text-xs",
                  key === today
                    ? "font-semibold text-brand-700"
                    : outside
                      ? "text-slate-300"
                      : "text-slate-500",
                )}
              >
                <span className="md:hidden">
                  {WEEKDAY_SHORT[day.getUTCDay()]} {day.getUTCDate()}/{day.getUTCMonth() + 1}
                </span>
                <span className="hidden md:inline">{day.getUTCDate()}</span>
              </p>
              {items.slice(0, 4).map((session) => (
                <SessionChip
                  key={session.id}
                  session={session}
                  hrefBase={hrefBase}
                  sessionHref={sessionHref}
                  edit={edit}
                  compact
                />
              ))}
              {items.length > 4 ? (
                <p className="text-[11px] text-slate-400">+{items.length - 4} buổi khác</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Khung lịch: lưới chiếm hết chiều cao. `toolbar` là một hàng bộ lọc dính trên cùng. */
export function CalendarBoard({
  view,
  date,
  sessions,
  hrefBase,
  sessionHref,
  edit,
  toolbar,
}: {
  view: CalendarView;
  date: Date;
  sessions: CalendarSession[];
  hrefBase: string;
  sessionHref?: (session: CalendarSession) => string;
  /** Truyền vào để bấm buổi ra popup cấu hình thay vì mở trang chi tiết. */
  edit?: CalendarEditOptions;
  toolbar?: React.ReactNode;
}) {
  const { from, to } = calendarRange(view, date);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {toolbar ? (
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">{toolbar}</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "month" ? (
          <MonthView
            from={from}
            to={to}
            month={date}
            sessions={sessions}
            hrefBase={hrefBase}
            sessionHref={sessionHref}
            edit={edit}
          />
        ) : (
          <TimeGridView
            days={view === "day" ? [date] : eachDayUtc(from, to)}
            sessions={sessions}
            hrefBase={hrefBase}
            sessionHref={sessionHref}
            edit={edit}
          />
        )}
      </div>
    </Card>
  );
}
