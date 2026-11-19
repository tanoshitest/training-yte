"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Plus, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/modal";
import { WEEKDAY_LABELS, timeToMinutes } from "@/lib/utils";

export type PeriodOption = { id: string; name: string; startTime: string; endTime: string };

export type ScheduleSlot = {
  weekday: number;
  /** Ca học đã chọn. Buổi cũ nhập tay có thể còn `null`. */
  periodId: string | null;
  startTime: string;
  endTime: string;
};

type Draft = {
  weekday: string;
  periodId: string;
};

const EMPTY_DRAFT: Draft = { weekday: "1", periodId: "" };

function slotKey(slot: Pick<ScheduleSlot, "weekday" | "startTime">) {
  return `${slot.weekday}-${slot.startTime}`;
}

function PeriodSelect({
  periods,
  value,
  onChange,
}: {
  periods: PeriodOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={periods.length === 0}
    >
      <option value="">{periods.length === 0 ? "— Chưa có ca học —" : "— Chọn ca học —"}</option>
      {periods.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name} ({item.startTime}–{item.endTime})
        </option>
      ))}
    </Select>
  );
}

function SlotFields({
  draft,
  periods,
  onChange,
}: {
  draft: Draft;
  periods: PeriodOption[];
  onChange: (next: Draft) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Thứ">
        <Select
          value={draft.weekday}
          onChange={(event) => onChange({ ...draft, weekday: event.target.value })}
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ca học">
        <PeriodSelect
          periods={periods}
          value={draft.periodId}
          onChange={(periodId) => onChange({ ...draft, periodId })}
        />
      </Field>
    </div>
  );
}

/**
 * Thời khoá biểu lặp theo tuần. Giờ lấy từ ca đã khai báo ở Cấu hình — không nhập tay.
 *
 * Mỗi buổi gửi lên 4 input song song (`slotWeekday`, `slotPeriodId`,
 * `slotStartTime`, `slotEndTime`) để Server Action ghép lại theo chỉ số dòng.
 *
 * Trang chi tiết (`compact`): chỉ hiện lịch đã set, thêm / sửa trong popup.
 * Popup tạo lớp giữ form nhập ngay trên chỗ để khỏi lồng hộp thoại.
 */
export function SchedulePicker({
  periods,
  value,
  onChange,
  className,
  compact = false,
  headerAction,
}: {
  periods: PeriodOption[];
  value: ScheduleSlot[];
  onChange: (slots: ScheduleSlot[]) => void;
  className?: string;
  compact?: boolean;
  headerAction?: ReactNode;
}) {
  const [weekday, setWeekday] = useState("1");
  const [periodId, setPeriodId] = useState("");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"add" | "edit" | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [dialogError, setDialogError] = useState("");

  const sorted = [...value].sort(
    (a, b) => a.weekday - b.weekday || timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );

  function toSlot(source: { weekday: string; periodId: string }): ScheduleSlot | string {
    const period = periods.find((item) => item.id === source.periodId) ?? null;
    if (!period) return "Chọn ca học đã cấu hình.";

    return {
      weekday: Number(source.weekday),
      periodId: period.id,
      startTime: period.startTime,
      endTime: period.endTime,
    };
  }

  function add() {
    const next = toSlot({ weekday, periodId });
    if (typeof next === "string") {
      setError(next);
      return;
    }
    if (value.some((slot) => slotKey(slot) === slotKey(next))) {
      setError("Buổi này đã có trong lịch tuần.");
      return;
    }

    onChange([...value, next]);
    setPeriodId("");
    setError("");
  }

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setEditingKey(null);
    setDialogError("");
    setDialog("add");
  }

  function openEdit(slot: ScheduleSlot) {
    setDraft({
      weekday: String(slot.weekday),
      periodId: slot.periodId ?? "",
    });
    setEditingKey(slotKey(slot));
    setDialogError("");
    setDialog("edit");
  }

  function saveDialog() {
    const next = toSlot(draft);
    if (typeof next === "string") {
      setDialogError(next);
      return;
    }
    const duplicate = value.some(
      (slot) => slotKey(slot) === slotKey(next) && slotKey(slot) !== editingKey,
    );
    if (duplicate) {
      setDialogError("Buổi này đã có trong lịch tuần.");
      return;
    }

    if (dialog === "edit" && editingKey) {
      onChange(value.map((slot) => (slotKey(slot) === editingKey ? next : slot)));
    } else {
      onChange([...value, next]);
    }
    setDialog(null);
  }

  const emptyHint =
    periods.length === 0
      ? "Chưa có ca học. Thêm ca ở Cấu hình hệ thống trước khi xếp lịch."
      : compact
        ? "Chưa có lịch tuần — lớp chưa hiện trên Lịch dạy."
        : "Chưa có buổi nào trong tuần. Chưa có lịch tuần thì lớp không hiện trên Lịch dạy.";

  const list = (
    <>
      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500">
          {emptyHint}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {sorted.map((slot) => {
            const name = periods.find((item) => item.id === slot.periodId)?.name;
            return (
              <li
                key={slotKey(slot)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm"
              >
                <span className="w-20 shrink-0 text-slate-800">{WEEKDAY_LABELS[slot.weekday]}</span>
                <span className="flex-1 font-mono text-xs text-slate-600">
                  {slot.startTime}–{slot.endTime}
                </span>
                {name ? <span className="shrink-0 text-xs text-slate-400">{name}</span> : null}
                {compact ? (
                  <button
                    type="button"
                    onClick={() => openEdit(slot)}
                    title="Sửa buổi này"
                    aria-label="Sửa buổi này"
                    className={buttonClass("ghost", "icon", "shrink-0")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((item) => slotKey(item) !== slotKey(slot)))}
                  title="Bỏ buổi này"
                  aria-label="Bỏ buổi này"
                  className={buttonClass("ghost", "icon", "shrink-0")}
                >
                  <X className="h-4 w-4" />
                </button>
                <input type="hidden" name="slotWeekday" value={slot.weekday} />
                <input type="hidden" name="slotPeriodId" value={slot.periodId ?? ""} />
                <input type="hidden" name="slotStartTime" value={slot.startTime} />
                <input type="hidden" name="slotEndTime" value={slot.endTime} />
              </li>
            );
          })}
          <li className="px-3 py-1.5 text-xs font-medium text-slate-600">
            {sorted.length} buổi mỗi tuần
          </li>
        </ul>
      )}
    </>
  );

  if (compact) {
    return (
      <div className={className}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">Thời khoá biểu</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {headerAction}
            <button
              type="button"
              onClick={openAdd}
              disabled={periods.length === 0}
              className={buttonClass("secondary", "sm")}
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm
            </button>
          </div>
        </div>
        {list}
        <Dialog
          title={dialog === "edit" ? "Sửa buổi học" : "Thêm buổi học"}
          open={dialog != null}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDialog(null)}
                className={buttonClass("outline", "md")}
              >
                Hủy
              </button>
              <button type="button" onClick={saveDialog} className={buttonClass("primary", "md")}>
                {dialog === "edit" ? "Lưu" : "Thêm"}
              </button>
            </>
          }
        >
          <SlotFields draft={draft} periods={periods} onChange={setDraft} />
          {dialogError ? <p className="text-xs text-red-600">{dialogError}</p> : null}
        </Dialog>
      </div>
    );
  }

  return (
    <Field
      label="Thời khoá biểu"
      hint="Lịch lặp hằng tuần. Giờ lấy theo ca đã khai báo ở Cấu hình."
      error={error || undefined}
      className={className}
    >
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
          <Select value={weekday} onChange={(event) => setWeekday(event.target.value)}>
            {WEEKDAY_LABELS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </Select>
          <PeriodSelect periods={periods} value={periodId} onChange={setPeriodId} />
          <button
            type="button"
            onClick={add}
            disabled={periods.length === 0}
            className={buttonClass("secondary", "md", "shrink-0")}
          >
            <Plus className="h-4 w-4" />
            Thêm
          </button>
        </div>
        {list}
      </div>
    </Field>
  );
}
