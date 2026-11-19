"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";

export type Tier = { id: string; totalSessions: number; price: string };

type Row = { key: number; id: string; totalSessions: string; price: string };

/**
 * Bảng giá của **một level**, nhiều mức số buổi cùng lúc: `24 buổi → giá A`,
 * `48 buổi → giá B`… Khai một lần cho cả level thay vì mở popup thêm từng dòng.
 *
 * Mỗi mức gửi lên ba input song song (`tierId`, `tierSessions`, `tierPrice`), luôn
 * đủ cả ba kể cả khi `tierId` rỗng (mức mới) để Server Action ghép lại theo chỉ số
 * dòng. `key` chỉ dùng cho React, không gửi lên.
 */
export function TierFields({ tiers = [] }: { tiers?: Tier[] }) {
  const nextKey = useRef(tiers.length);
  const [rows, setRows] = useState<Row[]>(() =>
    tiers.length > 0
      ? tiers.map((tier, index) => ({
          key: index,
          id: tier.id,
          totalSessions: String(tier.totalSessions),
          price: tier.price,
        }))
      : [{ key: -1, id: "", totalSessions: "", price: "" }],
  );

  function set(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <Field
      label="Các mức học phí"
      hint="Mỗi level có thể có nhiều mức số buổi. Số tiền gõ kiểu 9.600.000 hoặc 9600000."
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1.6fr_auto] gap-2">
          <Label className="mb-0 text-xs text-slate-500">Số buổi</Label>
          <Label className="mb-0 text-xs text-slate-500">Số tiền (₫)</Label>
          {/* Chỗ trống thẳng cột với nút bỏ mức. */}
          <span className="w-9" />
        </div>

        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_1.6fr_auto] items-center gap-2">
            <input type="hidden" name="tierId" value={row.id} />
            <Input
              name="tierSessions"
              type="number"
              min={1}
              max={1000}
              required
              placeholder="48"
              aria-label="Số buổi"
              value={row.totalSessions}
              onChange={(event) => set(row.key, { totalSessions: event.target.value })}
            />
            <Input
              name="tierPrice"
              inputMode="numeric"
              required
              placeholder="9.600.000"
              aria-label="Số tiền"
              value={row.price}
              onChange={(event) => set(row.key, { price: event.target.value })}
            />
            <button
              type="button"
              // Bảng giá rỗng thì không lưu được, nên luôn giữ lại ít nhất một mức.
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              title="Bỏ mức này"
              aria-label="Bỏ mức này"
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
              { key: (nextKey.current += 1), id: "", totalSessions: "", price: "" },
            ])
          }
          className={buttonClass("secondary", "md")}
        >
          <Plus className="h-4 w-4" />
          Thêm mức
        </button>
      </div>
    </Field>
  );
}
