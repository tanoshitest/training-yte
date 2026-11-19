"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";

type Row = { key: number; id: string; name: string };

/**
 * Form cấu hình level của một cấp: mỗi dòng một tên. Level mới thì `id` rỗng;
 * bỏ dòng rồi lưu sẽ xóa level đó (nếu chưa gắn bảng giá).
 */
export function LevelFields({
  levelId,
  initialRows,
}: {
  levelId: string;
  initialRows?: { id: string; name: string }[];
}) {
  const nextKey = useRef(initialRows?.length ?? 1);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows && initialRows.length > 0
      ? initialRows.map((row, index) => ({ key: index, id: row.id, name: row.name }))
      : [{ key: 0, id: "", name: "Level 1" }],
  );

  return (
    <div className="space-y-4">
      <input type="hidden" name="levelId" value={levelId} />
      <Field label="Danh sách level" hint="Tên tự đặt — ví dụ Level 1, Starters, Movers.">
        <div className="space-y-2">
          <Label className="mb-0 text-xs text-slate-500">Tên level</Label>
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <input type="hidden" name="subLevelId" value={row.id} />
              <Input
                name="levelName"
                required
                placeholder="Level 1"
                aria-label="Tên level"
                value={row.name}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.key === row.key ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                title="Bỏ level này"
                aria-label="Bỏ level này"
                className={buttonClass("ghost", "icon", "shrink-0")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: (nextKey.current += 1),
                  id: "",
                  name: `Level ${current.length + 1}`,
                },
              ])
            }
            className={buttonClass("secondary", "md")}
          >
            <Plus className="h-4 w-4" />
            Thêm level
          </button>
        </div>
      </Field>
    </div>
  );
}
