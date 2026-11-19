"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { derivedNormalPackagePrice } from "@/lib/normal-tuition";

export type PriceRow = {
  name: string;
  basePrice: string;
  discount24: string;
  discount12: string;
};

type Row = PriceRow & { key: number };

function parseVnd(raw: string) {
  const n = Number(raw.trim().replace(/[.\s,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function vnd(value: number) {
  return value.toLocaleString("vi-VN");
}

function packagesFromRow(basePrice: string, discount24: string, discount12: string) {
  const base = parseVnd(basePrice);
  const fullDiscount = parseVnd(discount24);
  const halfDiscount = parseVnd(discount12);
  if (!Number.isFinite(base) || base <= 0) {
    return { price24: "—", price48: "—" };
  }
  const cut24 = Number.isFinite(fullDiscount) ? fullDiscount : undefined;
  const cut12 = Number.isFinite(halfDiscount) ? halfDiscount : undefined;
  const price24 = derivedNormalPackagePrice(base, 24, cut24, cut12);
  const price48 = derivedNormalPackagePrice(base, 48, cut24, cut12);
  return {
    price24: price24 != null ? vnd(price24) : "—",
    price48: price48 != null ? vnd(price48) : "—",
  };
}

/**
 * Bảng giá của một cấp: nhập học phí gốc 24 tuần cùng hai mức miễn giảm độc lập.
 * Giá 24 buổi / 48 buổi được tính sẵn theo đúng kỳ đóng.
 */
export function AddPackageFields({
  levels,
  levelId,
  initialRows,
}: {
  levels?: { id: string; name: string }[];
  levelId?: string;
  initialRows?: PriceRow[];
}) {
  const nextKey = useRef(initialRows?.length ?? 1);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows && initialRows.length > 0
      ? initialRows.map((row, index) => ({ key: index, ...row }))
      : [{ key: 0, name: "Level 1", basePrice: "", discount24: "600.000", discount12: "300.000" }],
  );

  function set(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-4">
      {levelId ? (
        <input type="hidden" name="levelId" value={levelId} />
      ) : (
        <Field label="Cấp học" hint="Chọn Cấp 1 hoặc Cấp 2 — các level bên dưới thuộc cấp này.">
          <Select name="levelId" required defaultValue="">
            <option value="" disabled>
              — Chọn cấp học —
            </option>
            {(levels ?? []).map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Bảng giá theo level"
        hint="48 buổi = gốc 24 tuần − miễn giảm 24 tuần. 24 buổi = (gốc 24 tuần − miễn giảm 12 tuần) ÷ 2."
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(6.5rem,1fr)_1fr_1fr_1fr_1fr_1fr_auto] gap-2">
            <Label className="mb-0 text-xs text-slate-500">Level</Label>
            <Label className="mb-0 text-xs leading-tight text-slate-500">HP gốc 24 tuần (đ)</Label>
            <Label className="mb-0 text-xs leading-tight text-slate-500">Miễn giảm 24 tuần (đ)</Label>
            <Label className="mb-0 text-xs leading-tight text-slate-500">Miễn giảm 12 tuần (đ)</Label>
            <Label className="mb-0 text-xs text-slate-500">24 buổi (đ)</Label>
            <Label className="mb-0 text-xs text-slate-500">48 buổi (đ)</Label>
            <span className="w-9" />
          </div>

          {rows.map((row) => {
            const derived = packagesFromRow(row.basePrice, row.discount24, row.discount12);
            return (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(6.5rem,1fr)_1fr_1fr_1fr_1fr_1fr_auto] items-center gap-2"
              >
                <Input
                  name="levelName"
                  required
                  placeholder="Level 1"
                  aria-label="Tên level"
                  value={row.name}
                  onChange={(event) => set(row.key, { name: event.target.value })}
                />
                <Input
                  name="basePrice"
                  inputMode="numeric"
                  required
                  placeholder="4.500.000"
                  aria-label="Học phí gốc 24 tuần"
                  value={row.basePrice}
                  onChange={(event) => set(row.key, { basePrice: event.target.value })}
                />
                <Input
                  name="discount24Weeks"
                  inputMode="numeric"
                  required
                  placeholder="600.000"
                  aria-label="Miễn giảm 24 tuần"
                  value={row.discount24}
                  onChange={(event) => set(row.key, { discount24: event.target.value })}
                />
                <Input
                  name="discount12Weeks"
                  inputMode="numeric"
                  required
                  placeholder="300.000"
                  aria-label="Miễn giảm 12 tuần"
                  value={row.discount12}
                  onChange={(event) => set(row.key, { discount12: event.target.value })}
                />
                <Input
                  readOnly
                  tabIndex={-1}
                  aria-label="Số tiền 24 buổi"
                  value={derived.price24}
                  className="bg-slate-50 text-slate-600"
                />
                <Input
                  readOnly
                  tabIndex={-1}
                  aria-label="Số tiền 48 buổi"
                  value={derived.price48}
                  className="bg-slate-50 text-slate-600"
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
            );
          })}

          <button
            type="button"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: (nextKey.current += 1),
                  name: `Level ${current.length + 1}`,
                  basePrice: "",
                  discount24: "600.000",
                  discount12: "300.000",
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
