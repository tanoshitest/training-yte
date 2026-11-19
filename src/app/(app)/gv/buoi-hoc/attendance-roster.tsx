"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Input, Select } from "@/components/ui/input";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import type { ClassType, HomeworkRating, LessonRating, SessionStatus } from "@/generated/prisma/enums";
import type { RosterRow, SessionTestColumn } from "@/lib/session";
import { cn } from "@/lib/utils";
import { saveAttendance, saveAttendanceNotes } from "./actions";

const ATTENDANCE_CHOICES = [
  { value: "PRESENT", label: "Có mặt" },
  { value: "ABSENT", label: "Vắng không phép" },
  { value: "EXCUSED", label: "Vắng phép" },
] as const;

const LESSON_RATINGS = [
  { value: "A_PLUS", label: "A+" },
  { value: "A", label: "A" },
  { value: "A_MINUS", label: "A-" },
  { value: "B", label: "B" },
] as const;

const HOMEWORK_RATINGS = [
  { value: "FULL_100", label: "100%" },
  { value: "EIGHTY_80", label: "80%" },
  { value: "BELOW_50", label: "<50%" },
  { value: "ZERO_0", label: "0%" },
] as const;

const VIDEO_CHOICES = [
  { value: "0", label: "Chưa hoàn thành" },
  { value: "1", label: "Hoàn thành" },
] as const;

export type AttendanceMode = "all" | "mark" | "academic" | "comment" | "view";

export type AttendanceHeading = {
  title: string;
  description: string;
  status: SessionStatus;
};

const DEFAULT_LESSON_RATING: LessonRating = "A";
const DEFAULT_HOMEWORK_RATING: HomeworkRating = "FULL_100";
const DEFAULT_NOTE = "Học sinh chú ý nghe giảng, có tiến bộ";

type DraftTestColumn = {
  id: string;
  name: string;
  scores: Record<string, string>;
};

function toDraft(columns: SessionTestColumn[]): DraftTestColumn[] {
  return columns.map((column) => ({
    id: column.id,
    name: column.name,
    scores: Object.fromEntries(Object.entries(column.scores).map(([id, score]) => [id, String(score)])),
  }));
}

function formatScore(value: number | string | undefined) {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function lessonRatingLabel(value: LessonRating | null) {
  return LESSON_RATINGS.find((item) => item.value === value)?.label ?? "—";
}

function homeworkRatingLabel(value: HomeworkRating | null) {
  return HOMEWORK_RATINGS.find((item) => item.value === value)?.label ?? "—";
}

export function AttendanceRoster({
  sessionId,
  roster,
  mode,
  classType,
  isCompleted,
  heading,
  tests = [],
  embedded = false,
  submitLabel,
  isOff = false,
  hasHomework = false,
  academicSession = false,
}: {
  sessionId: string;
  roster: RosterRow[];
  mode: AttendanceMode;
  classType: ClassType;
  isCompleted: boolean;
  heading?: AttendanceHeading;
  tests?: SessionTestColumn[];
  /** Nằm trong form cha — không tự bọc ActionForm, nút gửi dùng form bên ngoài. */
  embedded?: boolean;
  submitLabel?: string;
  /** Học vụ đánh dấu cả lớp nghỉ — chỉ hiện nút Nghỉ học khi mode = mark. */
  isOff?: boolean;
  /** Buổi này có giao BTVN — giáo viên tick ở cột BTVN mới đánh giá được. */
  hasHomework?: boolean;
  /** Buổi do Học vụ phụ trách: luôn ẩn toàn bộ cột và báo cáo dành cho Giáo viên, kể cả chế độ chỉ xem. */
  academicSession?: boolean;
}) {
  const [videoUnlocked, setVideoUnlocked] = useState(false);
  const [homeworkOn, setHomeworkOn] = useState(hasHomework);
  const [classOff, setClassOff] = useState(isOff);
  const [testColumns, setTestColumns] = useState(() => toDraft(tests));
  const [addingTest, setAddingTest] = useState(false);
  const [draftTestName, setDraftTestName] = useState("");
  const testsKey = JSON.stringify(tests);
  useEffect(() => {
    setTestColumns(toDraft(tests));
    setClassOff(isOff);
    setHomeworkOn(hasHomework);
  }, [sessionId, testsKey, tests, isOff, hasHomework]);
  const markedCount = roster.filter((row) => row.status !== null).length;
  const canEditAttendance = (mode === "mark" || mode === "academic" || mode === "all") && roster.length > 0;
  const canEditComments = mode === "comment";
  const canEditTests = mode === "comment" || mode === "academic";
  const academicMode = academicSession || mode === "academic";
  const canEditVideo = canEditAttendance && videoUnlocked;
  /** Học vụ bỏ tick thì mở lại form ngay; giáo viên / admin vẫn xem theo dữ liệu đã lưu. */
  const lockOff = canEditAttendance ? classOff : isOff;

  function addTestColumn() {
    const name = draftTestName.trim().slice(0, 40);
    if (!name) return;
    setTestColumns((current) => [
      ...current,
      { id: crypto.randomUUID(), name, scores: {} },
    ]);
    setDraftTestName("");
    setAddingTest(false);
  }

  function removeTestColumn(id: string) {
    setTestColumns((current) => current.filter((column) => column.id !== id));
  }

  function setTestScore(columnId: string, studentId: string, raw: string) {
    setTestColumns((current) =>
      current.map((column) => {
        if (column.id !== columnId) return column;
        const scores = { ...column.scores };
        if (raw.trim() === "") delete scores[studentId];
        else scores[studentId] = raw;
        return { ...column, scores };
      }),
    );
  }

  const columns = useMemo(() => {
    const list = [
      <THIndex key="index" />,
      <TH key="code">Mã</TH>,
      <TH key="student">Học viên</TH>,
      <TH key="attendance">Điểm danh</TH>,
      <TH key="video">
        <span className="inline-flex items-center gap-2">
          {canEditAttendance ? (
            <input
              type="checkbox"
              name="videoEnabled"
              value="1"
              checked={videoUnlocked}
              onChange={(event) => setVideoUnlocked(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              aria-label="Mở sửa cột video luyện phát âm"
            />
          ) : null}
          Video luyện phát âm tuần
        </span>
      </TH>,
    ];
    if (!academicMode) {
      list.push(
        <TH key="lessonRating">Đánh giá tiết học</TH>,
        <TH key="homeworkRating">
          <label className={cn("inline-flex items-center gap-2", canEditComments && "cursor-pointer")}>
            {canEditComments ? (
              <input
                type="checkbox"
                checked={homeworkOn}
                onChange={(event) => setHomeworkOn(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                title="Tick nếu buổi này có bài tập về nhà"
                aria-label="Buổi này có bài tập về nhà"
              />
            ) : null}
            BTVN
          </label>
        </TH>,
      );
    }
    for (const column of testColumns) {
      list.push(
        <TH key={column.id}>
          <span className="inline-flex items-center gap-1">
            {column.name}
            {canEditTests ? (
              <button
                type="button"
                onClick={() => removeTestColumn(column.id)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label={`Xoá cột ${column.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        </TH>,
      );
    }
    if (!academicMode) list.push(<TH key="note">Nhận xét</TH>);
    return list;
  }, [academicMode, canEditAttendance, canEditComments, canEditTests, homeworkOn, testColumns, videoUnlocked]);

  const table = (
    <Table>
      <THead>
        <TR>{columns}</TR>
      </THead>
      <TBody>
        {roster.length === 0 ? (
          <EmptyRow colSpan={columns.length}>Lớp chưa có học viên đang học.</EmptyRow>
        ) : (
          roster.map((row, index) => (
            <TR key={row.studentId}>
              <TDIndex value={index + 1} />
              <TD className="whitespace-nowrap font-mono text-xs text-slate-500">{row.code}</TD>
              <TD className="whitespace-nowrap font-medium text-slate-800">
                {row.fullName}
                {row.inClass ? null : <span className="ml-2 text-xs font-normal text-slate-400">đã rời lớp</span>}
              </TD>
              <TD>
                {row.reserved ? (
                  <StatusBadge value="RESERVED" />
                ) : lockOff ? (
                  <>
                    {canEditAttendance ? <input type="hidden" name={`status_${row.studentId}`} value="EXCUSED" /> : null}
                    <Badge tone="amber">Nghỉ học</Badge>
                  </>
                ) : canEditAttendance && row.inClass ? (
                  <Select
                    name={`status_${row.studentId}`}
                    defaultValue={isOff && !classOff ? "PRESENT" : (row.status ?? "PRESENT")}
                    className="w-44"
                  >
                    {ATTENDANCE_CHOICES.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                ) : row.status ? (
                  <StatusBadge value={row.status} />
                ) : (
                  <span className="text-sm text-slate-400">Chưa điểm danh</span>
                )}
              </TD>

              <TD className="min-w-44">
                {row.reserved || lockOff ? (
                  <span className="text-sm text-slate-400">Không áp dụng</span>
                ) : !row.inClass ? (
                  <span className="text-sm text-slate-400">Đã rời lớp</span>
                ) : canEditAttendance ? (
                  <Select
                    name={`video_${row.studentId}`}
                    defaultValue={row.pronunciationVideoDone ? "1" : "0"}
                    disabled={!canEditVideo}
                    className="w-44"
                  >
                    {VIDEO_CHOICES.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-sm text-slate-600">
                    {row.pronunciationVideoDone ? "Hoàn thành" : "Chưa hoàn thành"}
                  </span>
                )}
              </TD>

              {academicMode ? (
                <>
                  {testColumns.map((column) => (
                    <TD key={column.id} className="min-w-24">
                      {canEditTests ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step={0.1}
                          className="w-20 tabular-nums"
                          value={column.scores[row.studentId] ?? ""}
                          disabled={row.reserved || lockOff || !row.inClass}
                          onChange={(event) => setTestScore(column.id, row.studentId, event.target.value)}
                          aria-label={`Điểm ${column.name} — ${row.fullName}`}
                        />
                      ) : (
                        <span className="tabular-nums">{formatScore(column.scores[row.studentId])}</span>
                      )}
                    </TD>
                  ))}
                </>
              ) : canEditComments ? (
                <>
                  <TD className="min-w-40">
                    <Select
                      name={`lessonRating_${row.studentId}`}
                      defaultValue={row.lessonRating ?? DEFAULT_LESSON_RATING}
                      disabled={!row.status}
                      className="w-36"
                    >
                      {LESSON_RATINGS.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD className={cn("min-w-40", !homeworkOn && "bg-slate-50")}>
                    {row.reserved || lockOff ? (
                      <span className="text-sm text-slate-400">Không áp dụng</span>
                    ) : homeworkOn ? (
                      <Select
                        name={`homeworkRating_${row.studentId}`}
                        defaultValue={row.homeworkRating ?? DEFAULT_HOMEWORK_RATING}
                        disabled={!row.status}
                        className="w-36"
                      >
                        {HOMEWORK_RATINGS.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-sm text-slate-400">Không giao BTVN</span>
                    )}
                  </TD>
                  {testColumns.map((column) => (
                    <TD key={column.id} className="min-w-24">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={0.1}
                        className="w-20 tabular-nums"
                        value={column.scores[row.studentId] ?? ""}
                        disabled={!row.status}
                        onChange={(event) => setTestScore(column.id, row.studentId, event.target.value)}
                        aria-label={`Điểm ${column.name} — ${row.fullName}`}
                      />
                    </TD>
                  ))}
                  <TD className="min-w-56">
                    <Input
                      name={`note_${row.studentId}`}
                      defaultValue={row.note?.trim() || DEFAULT_NOTE}
                      maxLength={300}
                      placeholder="Nhận xét học viên"
                      disabled={!row.status}
                    />
                  </TD>
                </>
              ) : (
                <>
                  <TD className="whitespace-nowrap">{lessonRatingLabel(row.lessonRating)}</TD>
                  <TD className={cn("whitespace-nowrap", !hasHomework && !row.homeworkRating && "bg-slate-50")}>
                    {hasHomework || row.homeworkRating
                      ? homeworkRatingLabel(row.homeworkRating)
                      : <span className="text-slate-400">Không giao BTVN</span>}
                  </TD>
                  {testColumns.map((column) => (
                    <TD key={column.id} className="tabular-nums">
                      {formatScore(column.scores[row.studentId])}
                    </TD>
                  ))}
                  <TD className="min-w-56">
                    <span className="text-slate-600">{row.note?.trim() || "—"}</span>
                  </TD>
                </>
              )}
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );

  const testToolbar = canEditTests ? (
    <div className="flex flex-wrap items-center gap-2">
      {addingTest ? (
        <>
          <Input
            value={draftTestName}
            onChange={(event) => setDraftTestName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTestColumn();
              }
            }}
            maxLength={40}
            placeholder="Tên cột, vd. Kiểm tra 15 phút"
            className="w-56"
          />
          <Button type="button" size="sm" onClick={addTestColumn} disabled={!draftTestName.trim()}>
            Thêm
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAddingTest(false);
              setDraftTestName("");
            }}
          >
            Huỷ
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAddingTest(true)}>
          <Plus className="h-3.5 w-3.5" />
          Thêm cột kiểm tra
        </Button>
      )}
    </div>
  ) : null;

  const header = heading ? (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-900">{heading.title}</h3>
          <StatusBadge value={heading.status} />
        </div>
        <p className="text-sm text-slate-500">{heading.description}</p>
      </div>
      {canEditAttendance ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={classOff}
              onChange={(event) => setClassOff(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Nghỉ học
          </label>
          <SubmitButton
            confirm={
              classOff || isCompleted || classType === "IELTS"
                ? undefined
                : "Lưu điểm danh sẽ tính buổi này là đã dạy và trừ 1 buổi của mỗi học viên (có mặt, vắng phép hoặc vắng không phép). Tick Nghỉ học thì không trừ. Tiếp tục?"
            }
          >
            {academicMode ? "Lưu điểm danh & kiểm tra" : "Lưu điểm danh"}
          </SubmitButton>
        </div>
      ) : canEditComments ? (
        <SubmitButton disabled={!embedded && markedCount === 0}>{submitLabel ?? "Lưu nhận xét"}</SubmitButton>
      ) : null}
    </div>
  ) : null;

  if (mode === "view" || roster.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-auto">{table}</div>
      </div>
    );
  }

  if (mode === "comment") {
    const body = (
      <>
        {embedded ? null : <input type="hidden" name="sessionId" value={sessionId} />}
        <input type="hidden" name="testColumns" value={JSON.stringify(testColumns)} />
        <input type="hidden" name="homeworkEnabled" value={homeworkOn ? "1" : "0"} />
        {header}
        <div className="min-h-0 flex-1 overflow-auto">{table}</div>
        {heading ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            {testToolbar}
            <p className="text-sm text-slate-500">
              {markedCount === 0
                ? "Học vụ chưa điểm danh buổi này nên chưa ghi nhận xét được."
                : "Tick BTVN nếu buổi này có bài tập, rồi đánh giá tiết học, nhận xét và điểm kiểm tra. Điểm danh do học vụ ghi."}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            {embedded ? null : <SubmitButton disabled={markedCount === 0}>{submitLabel ?? "Lưu nhận xét"}</SubmitButton>}
            {testToolbar}
            <span className="text-sm text-slate-500">
              {markedCount === 0
                ? "Học vụ chưa điểm danh buổi này nên chưa ghi nhận xét được."
                : "Tick BTVN nếu buổi này có bài tập, rồi đánh giá tiết học, nhận xét và điểm kiểm tra. Điểm danh do học vụ ghi."}
            </span>
          </div>
        )}
      </>
    );

    if (embedded) {
      return <div className="flex min-h-0 flex-1 flex-col">{body}</div>;
    }

    return (
      <ActionForm action={saveAttendanceNotes} className="flex min-h-0 flex-1 flex-col [&>p]:px-5 [&>p]:pb-3">
        {body}
      </ActionForm>
    );
  }

  return (
    <ActionForm action={saveAttendance} className="flex min-h-0 flex-1 flex-col [&>p]:px-5 [&>p]:pb-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="isOff" value={classOff ? "1" : "0"} />
      {academicMode ? (
        <>
          <input type="hidden" name="academicMode" value="1" />
          <input type="hidden" name="testColumns" value={JSON.stringify(testColumns)} />
        </>
      ) : null}
      {header}
      <div className="min-h-0 flex-1 overflow-auto">{table}</div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        {heading ? null : (
          <>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={classOff}
                onChange={(event) => setClassOff(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Nghỉ học
            </label>
            <SubmitButton
              confirm={
                classOff || isCompleted || classType === "IELTS"
                  ? undefined
                  : "Lưu điểm danh sẽ tính buổi này là đã dạy và trừ 1 buổi của mỗi học viên (có mặt, vắng phép hoặc vắng không phép). Tick Nghỉ học thì không trừ. Tiếp tục?"
              }
            >
              {academicMode ? "Lưu điểm danh & kiểm tra" : "Lưu điểm danh"}
            </SubmitButton>
          </>
        )}
        {academicMode ? testToolbar : null}
        <span className="text-sm text-slate-500">
          {academicMode
            ? "Buổi Học vụ phụ trách chỉ lưu điểm danh và điểm kiểm tra thang 100; không có đánh giá, nhận xét hoặc báo cáo Giáo viên. Có thể quay lại nhập điểm sau."
            : "Bạn thao tác điểm danh và video. Cột đánh giá / nhận xét do giáo viên ghi."}
        </span>
      </div>
    </ActionForm>
  );
}
