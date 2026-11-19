"use client";

import { useMemo, useState } from "react";

import { Field, Input, Select } from "@/components/ui/input";
import type { PackageOption } from "@/lib/enrollment";
import {
  normalPackageDiscount,
  normalPackageDiscountLabel,
} from "@/lib/normal-tuition";
import { cn, formatCurrency } from "@/lib/utils";
import type { ClassType } from "@/generated/prisma/enums";

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseVnd(raw: string) {
  const n = Number(raw.trim().replace(/[.\s,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function packagesForClass(packages: PackageOption[], subLevelId: string | null, levelId: string | null) {
  const bySub = subLevelId ? packages.filter((pkg) => pkg.subLevelId === subLevelId) : [];
  if (bySub.length > 0) return bySub;
  const byLevel = levelId ? packages.filter((pkg) => pkg.levelId === levelId) : [];
  if (byLevel.length > 0) return byLevel;
  return [];
}

export type IeltsCourseOption = {
  id: string;
  name: string;
  price: string;
  basePrice: string | null;
};

export function CollectTuitionFields({
  enrollmentId,
  classType,
  studentName,
  studentCode,
  parentPhone,
  className,
  remaining,
  owed,
  advance,
  packages,
  subLevelId,
  levelId,
  ieltsCourse,
  basePrice24,
}: {
  enrollmentId: string;
  classType: ClassType;
  studentName: string;
  studentCode: string;
  parentPhone?: string | null;
  className: string;
  remaining: number;
  owed: number;
  advance: number;
  packages: PackageOption[];
  subLevelId: string | null;
  levelId: string | null;
  ieltsCourse?: IeltsCourseOption | null;
  basePrice24?: string | null;
}) {
  const ielts = classType === "IELTS";
  const choices = useMemo(() => {
    if (ielts) {
      return ieltsCourse
        ? [
            {
              id: ieltsCourse.id,
              name: ieltsCourse.name,
              price: ieltsCourse.price,
              extra: "Trọn khóa",
              sessions: 0,
              discount24Weeks: null,
              discount12Weeks: null,
            },
          ]
        : [];
    }
    return packagesForClass(packages, subLevelId, levelId).map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      price: pkg.price,
      extra: `${pkg.totalSessions} buổi`,
      sessions: pkg.totalSessions,
      discount24Weeks: pkg.discount24Weeks,
      discount12Weeks: pkg.discount12Weeks,
    }));
  }, [ielts, ieltsCourse, packages, subLevelId, levelId]);

  const originalFees = useMemo(() => {
    if (ielts) {
      return ieltsCourse?.basePrice
        ? [{ label: "Học phí gốc", price: ieltsCourse.basePrice }]
        : [];
    }
    return basePrice24 ? [{ label: "Học phí gốc 24 tuần", price: basePrice24 }] : [];
  }, [ielts, ieltsCourse, basePrice24]);

  const [planId, setPlanId] = useState(choices[0]?.id ?? "");
  const [discountRaw, setDiscountRaw] = useState("");
  const [textbookRaw, setTextbookRaw] = useState("");
  const selected = choices.find((pkg) => pkg.id === planId);
  const price = selected ? Number(selected.price) : 0;
  const originalForSelected = ielts ? ieltsCourse?.basePrice : basePrice24;
  const packageDiscount =
    !ielts && selected
      ? normalPackageDiscount(selected.sessions, selected.discount24Weeks, selected.discount12Weeks)
      : 0;
  const extraDiscount = parseVnd(discountRaw);
  const discount = extraDiscount;
  const textbook = parseVnd(textbookRaw);
  const charge = ielts && owed > 0 ? Math.min(price, owed) : price;
  const afterDiscount = Math.max(0, charge - extraDiscount);
  const discountOverflow = discount > charge && charge > 0;
  const applied = Math.min(advance, afterDiscount);
  const cash = Math.max(0, afterDiscount - applied) + textbook;
  const depleted = !ielts && remaining <= 0;

  return (
    <div className="space-y-3">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <p className="font-semibold text-slate-900">
          {studentName}{" "}
          <span className="font-mono text-xs font-medium text-slate-500">{studentCode}</span>
        </p>
        <p className="text-slate-600">{className}</p>
        {parentPhone ? <p className="text-xs text-slate-500">SĐT {parentPhone}</p> : null}
        <p className="ml-auto text-slate-800">
          {ielts ? (
            <>
              Công nợ:{" "}
              <span className={cn("font-semibold", owed > 0 ? "text-red-600" : "text-emerald-600")}>
                {owed > 0 ? formatCurrency(owed) : "Đã đóng đủ"}
              </span>
            </>
          ) : (
            <>
              Số buổi còn lại:{" "}
              <span className={cn("font-semibold", remaining <= 0 ? "text-red-600" : "text-slate-900")}>
                {remaining} buổi
              </span>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
          <p className="text-xs font-medium text-slate-500">Học phí gốc (cấu hình lớp)</p>
          {originalFees.length === 0 ? (
            <p className="mt-1 text-slate-400">Chưa khai báo học phí gốc cho lớp này.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {originalFees.map((item) => (
                <li key={item.label} className="flex justify-between gap-3 text-slate-700">
                  <span>{item.label}</span>
                  <span className="tabular-nums font-medium text-slate-900">
                    {formatCurrency(item.price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {choices.length === 0 ? (
            <p className="text-sm text-red-600">
              {ielts
                ? "Lớp chưa chọn gói học phí IELTS. Khai báo trong thông tin lớp."
                : "Chưa có gói 24 / 48 / 96 buổi cho lớp này. Khai báo ở Cấu hình hệ thống → Cấu hình học phí."}
            </p>
          ) : (
            <Field label="Số tiền cần thu">
              <Select
                name="planId"
                value={planId}
                required
                onChange={(event) => setPlanId(event.target.value)}
              >
                {choices.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.extra} — {pkg.name} — {formatCurrency(pkg.price)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Ngày thu học phí">
            <Input name="paidAt" type="date" required defaultValue={todayInput()} />
          </Field>
          <Field label="Hình thức thu">
            <div className="flex h-9 items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="method" value="CASH" defaultChecked className="h-4 w-4 accent-brand-600" />
                Tiền mặt
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="method" value="BANK_TRANSFER" className="h-4 w-4 accent-brand-600" />
                Chuyển khoản
              </label>
            </div>
          </Field>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Ưu đãi thêm"
          hint={
            packageDiscount > 0
              ? `${normalPackageDiscountLabel(selected?.sessions ?? 24)} ${formatCurrency(packageDiscount)} đã trừ trong giá gói`
              : "Để trống nếu không có ưu đãi thêm"
          }
          error={discountOverflow ? "Ưu đãi thêm không được lớn hơn số tiền phải thu." : undefined}
        >
          <Input
            name="discountAmount"
            inputMode="numeric"
            placeholder="500.000"
            value={discountRaw}
            onChange={(event) => setDiscountRaw(event.target.value)}
          />
        </Field>
        <Field label="Lý do ưu đãi thêm" hint={extraDiscount > 0 ? "Bắt buộc khi có ưu đãi thêm" : "Không bắt buộc"}>
          <Input name="discountReason" maxLength={300} placeholder="VD: Ưu đãi anh chị em" />
        </Field>
        <Field label="Giáo trình" hint="Để trống nếu không thu giáo trình">
          <Input
            name="textbookAmount"
            inputMode="numeric"
            placeholder="350.000"
            value={textbookRaw}
            onChange={(event) => setTextbookRaw(event.target.value)}
          />
        </Field>
        <Field label="Số hoá đơn" hint="Không bắt buộc">
          <Input name="invoiceNo" maxLength={120} placeholder="VD: HD-2026-001" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div className="flex justify-between gap-2 text-slate-600 sm:block">
          <p className="text-xs text-slate-500">Học phí gốc</p>
          <p className="tabular-nums">
            {originalForSelected ? formatCurrency(originalForSelected) : "—"}
          </p>
        </div>
        <div className="flex justify-between gap-2 text-slate-600 sm:block">
          <p className="text-xs text-slate-500">Học phí áp dụng</p>
          <p className="tabular-nums">{formatCurrency(price)}</p>
        </div>
        <div className="flex justify-between gap-2 text-slate-600 sm:block">
          <p className="text-xs text-slate-500">Miễn giảm</p>
          <p className="tabular-nums text-emerald-700">
            {packageDiscount + extraDiscount > 0
              ? `− ${formatCurrency(packageDiscount + extraDiscount)}`
              : formatCurrency(0)}
          </p>
        </div>
        <div className="flex justify-between gap-2 text-slate-600 sm:block">
          <p className="text-xs text-slate-500">Giáo trình</p>
          <p className="tabular-nums">{formatCurrency(textbook)}</p>
        </div>
        <div className="flex justify-between gap-2 text-slate-600 sm:block">
          <p className="text-xs text-slate-500">Tiền tạm ứng</p>
          <p className="tabular-nums text-brand-700">
            {advance > 0 ? `− ${formatCurrency(applied)}` : formatCurrency(0)}
          </p>
        </div>
        <div className="flex justify-between gap-2 font-semibold text-slate-900 sm:block">
          <p className="text-xs font-medium text-slate-500">Số tiền thực thu</p>
          <p className="tabular-nums">{formatCurrency(cash)}</p>
        </div>
        {advance > applied ? (
          <p className="col-span-full text-xs text-slate-500">
            Số dư tạm ứng còn {formatCurrency(advance - applied)} sau lần thu này.
          </p>
        ) : null}
      </div>

      {ielts ? (
        <p className="text-xs text-slate-500">Học phí trọn khóa theo cấu hình lớp.</p>
      ) : depleted ? (
        <p className="text-xs text-slate-500">
          Số buổi còn 0 hoặc đang nợ. Trên biên lai, học phí gói mới bắt đầu từ ngày còn 0 buổi.
        </p>
      ) : (
        <p className="text-xs text-slate-500">Còn buổi nên gói mới cộng dồn vào số buổi còn lại.</p>
      )}
    </div>
  );
}
