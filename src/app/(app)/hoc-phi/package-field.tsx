import { Field, Select } from "@/components/ui/input";
import type { PackageOption } from "@/lib/enrollment";
import { formatCurrency } from "@/lib/utils";

/**
 * Ô chọn gói buổi của lớp thường.
 *
 * Gói là của học viên chứ không phải của lớp: phụ huynh đóng gói bao nhiêu buổi thì
 * học viên có bấy nhiêu buổi, học buổi nào trừ buổi đó. Nên ô này xuất hiện ở hai chỗ
 * thu tiền — lúc ghi danh vào lớp và ở màn hình Học phí — chứ không nằm trong thông tin lớp.
 */
export function PackageField({
  packages,
  required = false,
  hint,
  emptyLabel,
}: {
  packages: PackageOption[];
  /** Bắt buộc chọn (màn hình Học phí); lúc ghi danh thì để trống được, thu sau. */
  required?: boolean;
  hint?: string;
  emptyLabel?: string;
}) {
  if (packages.length === 0) {
    return (
      <Field label="Gói học phí" hint="Khai báo bảng giá ở Cấu hình hệ thống → Cấu hình học phí.">
        <Select name="packageId" disabled>
          <option value="">— Chưa có gói nào —</option>
        </Select>
      </Field>
    );
  }

  return (
    <Field label="Gói học phí" hint={hint}>
      <Select name="packageId" defaultValue="" required={required}>
        <option value="">
          {emptyLabel ?? (required ? "— Chọn gói —" : "— Chưa thu, chọn sau —")}
        </option>
        {packages.map((pkg) => (
          <option key={pkg.id} value={pkg.id}>
            {pkg.levelName} · {pkg.name} — {pkg.totalSessions} buổi · {formatCurrency(pkg.price)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
