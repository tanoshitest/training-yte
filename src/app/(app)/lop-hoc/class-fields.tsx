"use client";

import { useState, type ReactNode } from "react";

import { STATUS_TONE } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { ClassStatus, ClassType } from "@/generated/prisma/enums";
import { SchedulePicker, type ScheduleSlot } from "./schedule-picker";
import { SyllabusPicker } from "./syllabus-picker";
import type { ClassDefaults, ClassOptions } from "./ui";

const CLASS_STATUSES: ClassStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "FINISHED"];

/** Tiêu đề nhóm trường, để hộp thoại nhiều ô vẫn đọc được theo mạch. */
function SectionTitle({ children }: { children: string }) {
  return (
    <p className="col-span-full border-t border-slate-200 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 first:border-0 first:pt-0">
      {children}
    </p>
  );
}

/**
 * Ô nhập dùng chung cho form tạo và form sửa lớp.
 *
 * - `lockType` bật khi lớp đã có học viên — R2: loại lớp quyết định mô hình học phí
 *   nên không được đổi giữa chừng.
 * - Thời khoá biểu nằm ngay trong form (cả tạo lẫn sửa) vì lịch tuần là thứ duy nhất
 *   quyết định lớp có buổi hay không; lưu lịch cùng lúc với thông tin lớp.
 * - Lớp không có ngày bắt đầu / ngày kết thúc: lưu lịch tuần xong là lớp chạy, và
 *   chạy tới khi chuyển trạng thái sang Kết thúc.
 * - `layout="split"` dùng ở trang chi tiết: trái là thông tin lớp, phải là syllabus
 *   và lịch tuần — vừa một màn hình. Popup tạo lớp giữ `stack`.
 */
export function ClassFields({
  options,
  defaults,
  lockType = false,
  layout = "stack",
  scheduleAction,
  classId,
}: {
  options: ClassOptions;
  defaults?: ClassDefaults;
  lockType?: boolean;
  layout?: "stack" | "split";
  scheduleAction?: ReactNode;
  /** Trang chi tiết: gán syllabus ghi DB ngay khi bấm Thêm. */
  classId?: string;
}) {
  const [type, setType] = useState<ClassType>(defaults?.type ?? "NORMAL");
  const [levelId, setLevelId] = useState(defaults?.levelId ?? "");
  const [subLevelId, setSubLevelId] = useState(defaults?.subLevelId ?? "");
  const [ieltsCourseId, setIeltsCourseId] = useState(defaults?.ieltsCourseId ?? "");
  const [syllabusIds, setSyllabusIds] = useState<string[]>(defaults?.syllabusIds ?? []);
  const [slots, setSlots] = useState<ScheduleSlot[]>(defaults?.schedules ?? []);

  const compact = layout === "split";
  // Level thuộc về cấp học nào thì chỉ hiện khi đang chọn đúng cấp học đó.
  const subLevels = options.levels.find((level) => level.id === levelId)?.subLevels ?? [];
  const subLevelValue = subLevels.some((item) => item.id === subLevelId) ? subLevelId : "";
  const selectedSubLevel = subLevels.find((item) => item.id === subLevelValue);
  const selectedIelts = options.ieltsCourses.find((course) => course.id === ieltsCourseId);

  function listedPrice(raw: string | undefined, empty: string) {
    return raw ? formatCurrency(raw) : empty;
  }

  const nameField = (
    <Field label="Tên lớp">
      <Input
        name="name"
        defaultValue={defaults?.name}
        placeholder="Kids 1 — Sáng T2/T4"
        required
      />
    </Field>
  );
  const codeField = (
    <Field label="Mã lớp" hint={compact || defaults ? undefined : "Bỏ trống → tự sinh LOP0001"}>
      <Input
        name="code"
        defaultValue={defaults?.code}
        placeholder="LOP0001"
        required={!!defaults}
      />
    </Field>
  );
  const typeField = (
    <Field
      label="Loại lớp"
      hint={
        compact
          ? undefined
          : lockType
            ? "Lớp đã có học viên nên không đổi được loại."
            : "Lớp thường tính theo gói buổi, IELTS tính trọn khóa."
      }
    >
      <Select
        name="type"
        value={type}
        onChange={(event) => setType(event.target.value as ClassType)}
        disabled={lockType}
        required
      >
        <option value="NORMAL">Lớp thường</option>
        <option value="IELTS">IELTS</option>
      </Select>
      {/* Select bị disabled không gửi dữ liệu — gửi kèm giá trị hiện tại để action vẫn đọc được. */}
      {lockType && defaults ? <input type="hidden" name="type" value={defaults.type} /> : null}
    </Field>
  );
  const levelField = (
    <Field label="Cấp học">
      <Select name="levelId" value={levelId} onChange={(event) => setLevelId(event.target.value)}>
        <option value="">— Chưa chọn —</option>
        {options.levels.map((level) => (
          <option key={level.id} value={level.id}>
            {level.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const subLevelField = (
    <Field
      label="Level"
      hint={
        levelId && subLevels.length === 0
          ? "Cấp học này chưa có level nào."
          : compact
            ? undefined
            : "Level đang học của lớp."
      }
    >
      <Select
        name="subLevelId"
        value={subLevelValue}
        onChange={(event) => setSubLevelId(event.target.value)}
        disabled={subLevels.length === 0}
      >
        <option value="">{levelId ? "— Chưa chọn —" : "— Chọn cấp học trước —"}</option>
        {subLevels.map((subLevel) => (
          <option key={subLevel.id} value={subLevel.id}>
            {subLevel.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const ieltsField = (
    <Field
      label="Gói học phí"
      hint={compact ? undefined : "Học viên thêm vào lớp sẽ được áp khóa này."}
      className={compact ? "sm:col-span-2" : undefined}
    >
      <Select
        name="ieltsCourseId"
        value={ieltsCourseId}
        onChange={(event) => setIeltsCourseId(event.target.value)}
      >
        <option value="">— Chưa chọn —</option>
        {options.ieltsCourses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name} — {formatCurrency(course.price)}
          </option>
        ))}
      </Select>
    </Field>
  );
  const normalTuitionFields = (
    <>
      <Field
        label="Học phí gốc 24 tuần"
        hint={compact ? undefined : "Niêm yết 24 tuần. Miễn giảm lấy từ bảng giá của level."}
      >
        <Input
          readOnly
          disabled
          value={
            subLevelValue
              ? listedPrice(selectedSubLevel?.basePrice24, "Chưa khai học phí gốc")
              : "— Chọn level —"
          }
        />
      </Field>
      <Field label="Miễn giảm 24 tuần">
        <Input
          readOnly
          disabled
          value={
            subLevelValue
              ? listedPrice(selectedSubLevel?.discount24, "Chưa khai miễn giảm")
              : "— Chọn level —"
          }
        />
      </Field>
      <Field label="Miễn giảm 12 tuần">
        <Input
          readOnly
          disabled
          value={
            subLevelValue
              ? listedPrice(selectedSubLevel?.discount12, "Chưa khai miễn giảm")
              : "— Chọn level —"
          }
        />
      </Field>
      <Field label="Giá gói 24 buổi">
        <Input
          readOnly
          disabled
          value={
            subLevelValue
              ? listedPrice(selectedSubLevel?.price24, "Chưa khai bảng giá")
              : "— Chọn level —"
          }
        />
      </Field>
      <Field label="Giá gói 48 buổi">
        <Input
          readOnly
          disabled
          value={
            subLevelValue
              ? listedPrice(selectedSubLevel?.price48, "Chưa khai bảng giá")
              : "— Chọn level —"
          }
        />
      </Field>
    </>
  );
  const ieltsTuitionField = (
    <Field
      label="Học phí gốc"
      hint={compact ? undefined : "Theo cấu hình khóa IELTS."}
      className={compact ? "sm:col-span-2" : undefined}
    >
      <Input
        readOnly
        disabled
        value={
          ieltsCourseId
            ? listedPrice(selectedIelts?.basePrice, "Chưa khai học phí gốc")
            : "— Chọn khóa —"
        }
      />
    </Field>
  );
  const statusField = (
    <Field label="Trạng thái">
      <Select name="status" defaultValue={defaults?.status ?? "DRAFT"}>
        {CLASS_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_TONE[status].label}
          </option>
        ))}
      </Select>
    </Field>
  );
  const branchField = (
    <Field label="Chi nhánh">
      <Select name="branchId" defaultValue={defaults?.branchId ?? ""}>
        <option value="">— Chưa chọn —</option>
        {options.branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const roomField = (
    <Field label="Phòng học">
      <Select name="roomId" defaultValue={defaults?.roomId ?? ""}>
        <option value="">— Chưa xếp phòng —</option>
        {options.rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const teacherField = (
    <Field label="Giáo viên chủ nhiệm">
      <Select name="teacherId" defaultValue={defaults?.teacherId ?? ""}>
        <option value="">— Chưa phân công —</option>
        {options.teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.user.fullName} ({teacher.code})
          </option>
        ))}
      </Select>
    </Field>
  );
  const noteField = (
    <Field label="Ghi chú" className={compact ? "sm:col-span-3" : "col-span-full"}>
      <Textarea
        name="note"
        rows={compact ? 2 : undefined}
        className={compact ? "min-h-16" : undefined}
        defaultValue={defaults?.note ?? ""}
      />
    </Field>
  );

  if (layout === "split") {
    return (
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2 lg:gap-6 lg:overflow-hidden">
        <section className="grid content-start gap-x-3 gap-y-2 sm:grid-cols-3 lg:overflow-y-auto lg:pr-1 [&_label]:mb-1">
          <p className="col-span-full text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Thông tin lớp
          </p>
          {nameField}
          {codeField}
          {typeField}
          {type === "NORMAL" ? (
            <>
              {levelField}
              {subLevelField}
              {statusField}
              {normalTuitionFields}
            </>
          ) : (
            <>
              {ieltsField}
              {statusField}
              {ieltsTuitionField}
            </>
          )}
          {branchField}
          {roomField}
          {teacherField}
          {noteField}
        </section>
        <section className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Nội dung & lịch học
          </p>
          <SyllabusPicker
            options={options.syllabuses}
            value={syllabusIds}
            onChange={setSyllabusIds}
            compact
            classId={classId}
          />
          <SchedulePicker
            periods={options.periods}
            value={slots}
            onChange={setSlots}
            compact
            headerAction={scheduleAction}
          />
        </section>
      </div>
    );
  }

  return (
    <>
      <SectionTitle>Thông tin lớp</SectionTitle>
      {nameField}
      {codeField}
      {typeField}
      {/* Cấp học và level là của lớp thường: học viên đi theo lộ trình Cấp 1 → Cấp 2.
          Lớp IELTS không đi theo lộ trình đó nên có ô Gói học phí thay thế. */}
      {type === "NORMAL" ? (
        <>
          {levelField}
          {subLevelField}
          {normalTuitionFields}
        </>
      ) : (
        <>
          {ieltsField}
          {ieltsTuitionField}
        </>
      )}
      {statusField}
      {branchField}
      {roomField}
      {teacherField}

      <SectionTitle>Nội dung học</SectionTitle>
      <SyllabusPicker
        options={options.syllabuses}
        value={syllabusIds}
        onChange={setSyllabusIds}
        className="col-span-full"
        classId={classId}
      />

      <SectionTitle>Thời gian học</SectionTitle>
      <SchedulePicker
        periods={options.periods}
        value={slots}
        onChange={setSlots}
        className="col-span-full"
      />
      {noteField}
    </>
  );
}
