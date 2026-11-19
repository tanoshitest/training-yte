import * as React from "react";

import { DeleteButton } from "@/components/ui/modal";
import { TD } from "@/components/ui/table";

type ServerAction = React.ComponentProps<typeof DeleteButton>["action"];

/**
 * Ô thao tác cuối mỗi dòng của 6 bảng trong màn hình Cấu hình: nút Sửa (truyền
 * qua `children`) đứng cạnh nút Xóa.
 *
 * Cấu hình không có trạng thái "Ngưng dùng" — xóa là mất hẳn dòng đó, còn dữ liệu
 * đang dùng mục vừa xóa vẫn nguyên vẹn. Xem giải thích đầu `actions.ts`.
 */
export function ActionsCell({
  id,
  deleteAction,
  children,
}: {
  id: string;
  deleteAction: ServerAction;
  children: React.ReactNode;
}) {
  return (
    <TD className="w-px whitespace-nowrap">
      <div className="flex items-center justify-end gap-2">
        {children}
        <DeleteButton action={deleteAction} id={id} />
      </div>
    </TD>
  );
}
