# Giao diện

Tailwind CSS v4 với màu chủ đạo xanh dương đã ghi ở [`README.md`](../README.md).
Bổ sung duy nhất mà README không nêu: nơi các quyết định đó thực sự nằm.

- Token màu (`--color-brand-50` … `--color-brand-950`, gốc `brand-600` =
  `#2563eb`) khai báo tại `src/app/globals.css`. Sửa màu thương hiệu thì sửa ở
  đây, không hard-code mã màu rải rác trong component.
- Component dùng chung (Button, Card, Badge, Table, Input, Modal, Tabs,
  Pagination…) nằm ở `src/components/ui/`. Ưu tiên tái dùng từ đây trước khi
  viết class Tailwind trực tiếp cho một control mới.
- Khung trang, sidebar và menu theo vai trò nằm ở `src/components/layout/`
  (`app-shell.tsx`, `nav-config.ts`).
