import type * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { dateKey, formatDateUtc } from "@/lib/date";
import { loadClassLessons } from "@/lib/class-plan";
import { attendanceRoster, findSessionConflicts, parseTestColumns } from "@/lib/session";
import { WEEKDAY_SHORT } from "@/lib/utils";
import { AttendanceRoster } from "../../gv/buoi-hoc/attendance-roster";
import { parseMaterials } from "../../syllabus/materials";
import { VocabCards } from "../../syllabus/vocab-cards";
import {
  cancelSession,
  createMakeupSession,
  deleteSession,
  reopenSession,
  setSessionLesson,
  updateSession,
} from "../actions";

export const metadata: Metadata = { title: "Chi tiết buổi học" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("session.edit");
  const { id } = await params;

  const session = await prisma.lessonSession.findUnique({
    where: { id },
    include: {
      class: {
        select: { id: true, code: true, name: true, type: true },
      },
      room: { select: { id: true, name: true } },
      teacher: { select: { id: true, user: { select: { fullName: true } } } },
      academicStaff: { select: { id: true, fullName: true } },
      syllabusLesson: {
        select: {
          id: true,
          name: true,
          lessonPlan: true,
          vocabulary: true,
          grammar: true,
          homework: true,
          materials: true,
          unit: { select: { name: true } },
          courseDay: { select: { title: true } },
        },
      },
      makeupFor: { select: { id: true, sequence: true, date: true } },
      makeup: { select: { id: true, sequence: true, date: true } },
      report: { select: { id: true, taughtContent: true, classSituation: true } },
      attendances: {
        orderBy: { student: { fullName: "asc" } },
        select: {
          status: true,
          note: true,
          lessonRating: true,
          homeworkRating: true,
          pronunciationVideoDone: true,
          student: { select: { id: true, code: true, fullName: true } },
        },
      },
    },
  });

  if (!session) notFound();
  const lessonMaterials = parseMaterials(session.syllabusLesson?.materials);

  const [teachers, academics, rooms, lessons, conflicts, enrollments] = await Promise.all([
    prisma.teacher.findMany({
      where: { user: { isActive: true } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, user: { select: { fullName: true } } },
    }),
    prisma.user.findMany({
      where: { role: "ACADEMIC", isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    prisma.room.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadClassLessons(prisma, session.class.id),
    session.status === "CANCELLED"
      ? []
      : findSessionConflicts(prisma, {
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          roomId: session.roomId,
          teacherId: session.teacherId,
          academicStaffId: session.academicStaffId,
          excludeId: session.id,
        }),
    // Lấy cả học viên đang bảo lưu để bảng điểm danh khoá sẵn dòng của họ.
    prisma.enrollment.findMany({
      where: { classId: session.class.id, status: { in: ["ACTIVE", "RESERVED"] } },
      orderBy: { student: { fullName: "asc" } },
      select: { status: true, student: { select: { id: true, code: true, fullName: true } } },
    }),
  ]);

  const locked = session.status === "CANCELLED";
  const roster = attendanceRoster(
    enrollments.map((item) => ({ ...item.student, reserved: item.status === "RESERVED" })),
    session.attendances,
  );
  const presentCount = session.attendances.filter((a) => a.status === "PRESENT").length;
  const canEditAcademicScores =
    user.role === "ADMIN" || session.academicStaffId === user.id;

  return (
    <>
      <PageHeader
        title={`Buổi ${session.sequence} · ${session.class.name}`}
        description={`${WEEKDAY_SHORT[session.date.getUTCDay()]}, ${formatDateUtc(session.date)} · ${session.startTime}–${session.endTime}`}
        action={
          <Link
            href={`/lich-day?view=day&date=${dateKey(session.date)}`}
            className={buttonClass("outline", "sm")}
          >
            <ArrowLeft className="h-4 w-4" />
            Về lịch dạy
          </Link>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Thông tin buổi học</CardTitle>
              <StatusBadge value={session.status} />
              <StatusBadge value={session.class.type} />
            </div>
            <Link
              href={`/lop-hoc/${session.class.id}`}
              className="text-sm text-brand-600 hover:underline"
            >
              Xem lớp {session.class.code}
            </Link>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Lớp" value={`${session.class.name} (${session.class.code})`} />
            <Info
              label="Người phụ trách"
              value={
                session.academicStaff
                  ? `Học vụ · ${session.academicStaff.fullName}`
                  : session.teacher?.user.fullName ?? "Chưa phân công"
              }
            />
            <Info label="Phòng" value={session.room?.name ?? "Chưa xếp phòng"} />
            <Info label="Ngày" value={formatDateUtc(session.date)} />
            <Info label="Giờ" value={`${session.startTime}–${session.endTime}`} />
            <Info
              label="Bài học"
              value={
                session.syllabusLesson
                  ? `${session.syllabusLesson.unit?.name ?? session.syllabusLesson.courseDay?.title ?? "Nội dung độc lập"} · ${session.syllabusLesson.name}`
                  : "Chưa gán bài học"
              }
            />
            {session.completedAt ? (
              <Info label="Hoàn thành lúc" value={formatDateUtc(session.completedAt)} />
            ) : null}
            {session.cancelReason ? <Info label="Lý do huỷ" value={session.cancelReason} /> : null}
            {session.makeupFor ? (
              <Info
                label="Bù cho buổi"
                value={
                  <Link href={`/lich-day/${session.makeupFor.id}`} className="text-brand-600 hover:underline">
                    Buổi {session.makeupFor.sequence} ({formatDateUtc(session.makeupFor.date)})
                  </Link>
                }
              />
            ) : null}
            {session.makeup ? (
              <Info
                label="Buổi bù"
                value={
                  <Link href={`/lich-day/${session.makeup.id}`} className="text-brand-600 hover:underline">
                    Buổi {session.makeup.sequence} ({formatDateUtc(session.makeup.date)})
                  </Link>
                }
              />
            ) : null}
          </CardContent>
        </Card>

        {conflicts.length > 0 ? (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Buổi này đang trùng lịch:</p>
              <ul className="mt-1 list-inside list-disc">
                {conflicts.map((conflict) => (
                  <li key={conflict.label}>{conflict.label}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {!locked ? (
          <Card>
            <CardHeader className="flex-col items-start gap-1">
              <CardTitle>Sửa lịch buổi học</CardTitle>
              <CardDescription>
                Đổi Ngày / Giờ / Phòng / Giáo viên. Bài học trong Syllabus giữ nguyên (R12). Đổi
                giáo viên thì buổi tự chuyển sang lịch của giáo viên mới.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateSession} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <input type="hidden" name="id" value={session.id} />

                <Field label="Ngày học">
                  <Input type="date" name="date" defaultValue={dateKey(session.date)} required />
                </Field>
                <Field label="Giờ bắt đầu">
                  <Input type="time" name="startTime" defaultValue={session.startTime} required />
                </Field>
                <Field label="Giờ kết thúc">
                  <Input type="time" name="endTime" defaultValue={session.endTime} required />
                </Field>
                <Field label="Phòng">
                  <Select name="roomId" defaultValue={session.roomId ?? ""}>
                    <option value="">— Chưa xếp phòng —</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Người phụ trách">
                  <Select
                    name="assignee"
                    defaultValue={
                      session.academicStaffId
                        ? `academic:${session.academicStaffId}`
                        : session.teacherId
                          ? `teacher:${session.teacherId}`
                          : ""
                    }
                  >
                    <option value="">— Chưa phân công —</option>
                    <optgroup label="Giáo viên">
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={`teacher:${teacher.id}`}>
                          {teacher.user.fullName} ({teacher.code})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Học vụ">
                      {academics.map((academic) => (
                        <option key={academic.id} value={`academic:${academic.id}`}>
                          {academic.fullName}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </Field>

                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" name="ignoreConflict" value="1" className="h-4 w-4" />
                    Bỏ qua cảnh báo trùng lịch
                  </label>
                  <SubmitButton>Lưu thay đổi</SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Bài học trong Syllabus</CardTitle>
            <CardDescription>
              Gán bài học là thao tác riêng — dời lịch không bao giờ làm đổi bài học (R12).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lessons.length === 0 ? (
              <p className="text-sm text-slate-500">
                Lớp chưa gán Syllabus nên không có bài học để chọn.
              </p>
            ) : (
              <ActionForm action={setSessionLesson} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={session.id} />
                <Field label="Bài học" className="sm:w-96">
                  <Select name="syllabusLessonId" defaultValue={session.syllabusLessonId ?? ""}>
                    <option value="">— Chưa gán —</option>
                    {lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.unitName} · {lesson.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton variant="outline">Gán bài học</SubmitButton>
              </ActionForm>
            )}

            {session.syllabusLesson ? (
              <div className="grid gap-3 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-2">
                <Block label="Giáo án" value={session.syllabusLesson.lessonPlan} />
                <div>
                  <p className="text-xs font-medium text-slate-500">Từ vựng</p>
                  <div className="mt-1">
                    <VocabCards value={session.syllabusLesson.vocabulary} empty="—" />
                  </div>
                </div>
                <Block label="Ngữ pháp" value={session.syllabusLesson.grammar} />
                <Block label="Bài tập về nhà" value={session.syllabusLesson.homework} />
                {lessonMaterials.length > 0 ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-slate-500">Teaching material</p>
                    <ul className="mt-1 space-y-1">
                      {lessonMaterials.map((item) => (
                        <li key={item.url}>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {item.title || item.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Điểm danh là việc của quản trị viên; nhận xét học viên do giáo viên ghi (PRD §23). */}
        <Card>
          <CardHeader>
            <CardTitle>Điểm danh</CardTitle>
            <span className="text-sm text-slate-500">
              {session.attendances.length > 0
                ? `${presentCount}/${roster.length} có mặt`
                : `Chưa điểm danh · ${roster.length} học viên`}
            </span>
          </CardHeader>
          <AttendanceRoster
            sessionId={session.id}
            roster={roster}
            mode={
              locked
                ? "view"
                : session.academicStaffId
                  ? canEditAcademicScores
                    ? "academic"
                    : "view"
                  : "mark"
            }
            classType={session.class.type}
            isCompleted={session.status === "COMPLETED"}
            isOff={session.isOff}
            hasHomework={session.hasHomework}
            tests={parseTestColumns(session.testColumns)}
            academicSession={Boolean(session.academicStaffId)}
          />
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-col items-start gap-1">
              <CardTitle>Trạng thái buổi học</CardTitle>
              <CardDescription>
                Buổi đã huỷ vẫn giữ nguyên trong lịch sử. Mở lại buổi đã hoàn thành sẽ hoàn tác
                phần học phí đã trừ (R7).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {session.status !== "CANCELLED" ? (
                <ActionForm action={cancelSession} className="space-y-3">
                  <input type="hidden" name="id" value={session.id} />
                  <Field label="Lý do huỷ">
                    <Input name="cancelReason" placeholder="Giáo viên nghỉ ốm, trung tâm nghỉ lễ…" required />
                  </Field>
                  <SubmitButton
                    variant="danger"
                    confirm="Huỷ buổi học này? Buổi vẫn được giữ trong lịch sử."
                  >
                    Huỷ buổi
                  </SubmitButton>
                </ActionForm>
              ) : null}

              {session.status !== "SCHEDULED" ? (
                <ActionForm action={reopenSession}>
                  <input type="hidden" name="id" value={session.id} />
                  <SubmitButton
                    variant="outline"
                    confirm="Mở lại buổi này về trạng thái Đã lên lịch?"
                  >
                    Mở lại buổi
                  </SubmitButton>
                </ActionForm>
              ) : null}

              <ActionForm action={deleteSession}>
                <input type="hidden" name="id" value={session.id} />
                <SubmitButton
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  confirm="Xoá hẳn buổi này? Chỉ dùng khi sinh lịch nhầm."
                >
                  Xoá buổi
                </SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>

          {session.status === "CANCELLED" && !session.makeup ? (
            <Card>
              <CardHeader className="flex-col items-start gap-1">
                <CardTitle>Tạo buổi bù</CardTitle>
                <CardDescription>
                  Buổi bù là một buổi mới, giữ nguyên bài học của buổi đã huỷ.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm action={createMakeupSession} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="sourceId" value={session.id} />

                  <Field label="Ngày học bù">
                    <Input type="date" name="date" defaultValue={dateKey(session.date)} required />
                  </Field>
                  <Field label="Giờ bắt đầu">
                    <Input type="time" name="startTime" defaultValue={session.startTime} required />
                  </Field>
                  <Field label="Giờ kết thúc">
                    <Input type="time" name="endTime" defaultValue={session.endTime} required />
                  </Field>
                  <Field label="Phòng">
                    <Select name="roomId" defaultValue={session.roomId ?? ""}>
                      <option value="">— Chưa xếp phòng —</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Người phụ trách" className="sm:col-span-2">
                    <Select
                      name="assignee"
                      defaultValue={
                        session.academicStaffId
                          ? `academic:${session.academicStaffId}`
                          : session.teacherId
                            ? `teacher:${session.teacherId}`
                            : ""
                      }
                    >
                      <option value="">— Chưa phân công —</option>
                      <optgroup label="Giáo viên">
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={`teacher:${teacher.id}`}>
                            {teacher.user.fullName} ({teacher.code})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Học vụ">
                        {academics.map((academic) => (
                          <option key={academic.id} value={`academic:${academic.id}`}>
                            {academic.fullName}
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                  </Field>

                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" name="ignoreConflict" value="1" className="h-4 w-4" />
                    Bỏ qua cảnh báo trùng lịch
                  </label>
                  <div className="flex items-end justify-end">
                    <SubmitButton>Tạo buổi bù</SubmitButton>
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          {session.report && !session.academicStaffId ? (
            <Card>
              <CardHeader>
                <CardTitle>Báo cáo buổi học</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Block label="Nội dung đã dạy" value={session.report.taughtContent} />
                <Block label="Tình hình lớp" value={session.report.classSituation} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p>
      <span className="text-slate-500">{label}: </span>
      <span className="text-slate-800">{value}</span>
    </p>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="whitespace-pre-wrap text-slate-700">{value?.trim() || "—"}</p>
    </div>
  );
}
