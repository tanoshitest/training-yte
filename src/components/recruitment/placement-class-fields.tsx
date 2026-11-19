"use client";

import { useState } from "react";

type PlacementClassOption = {
  id: string;
  name: string;
  code: string;
  type: "NORMAL" | "IELTS";
  scheduleLabel: string;
};

export function PlacementClassFields({
  classes,
  defaultClassId,
  defaultSchedule,
  fieldClassName,
}: {
  classes: PlacementClassOption[];
  defaultClassId: string;
  defaultSchedule: string;
  fieldClassName: string;
}) {
  const [classId, setClassId] = useState(defaultClassId);
  const [schedule, setSchedule] = useState(defaultSchedule);

  return (
    <>
      <label className="block min-w-0 text-sm font-medium text-slate-700">
        <span className="mb-1.5 block">Xếp lớp</span>
        <select
          name="placementClassId"
          value={classId}
          className={fieldClassName}
          onChange={(event) => {
            const nextClassId = event.target.value;
            setClassId(nextClassId);
            setSchedule(classes.find((item) => item.id === nextClassId)?.scheduleLabel ?? "");
          }}
        >
          <option value="">Chưa xếp lớp</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.code}) · {item.type === "IELTS" ? "IELTS" : "Lớp thường"}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0 text-sm font-medium text-slate-700">
        <span className="mb-1.5 block">Lịch học</span>
        <input
          name="proposedSchedule"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          className={fieldClassName}
          placeholder="Lớp chưa có lịch học"
        />
      </label>
    </>
  );
}
