# Quy ước code

Phần lớn quy ước đã có ở [`README.md`](../README.md) mục "Nguyên tắc bắt
buộc" — không lặp lại ở đây, chỉ bổ sung những gì README chưa nêu và có bằng
chứng xác nhận trong repo.

## Kiểm tra tự động

- TypeScript `strict: true` — xem `tsconfig.json`. `npm run typecheck` chạy
  `tsc --noEmit`.
- ESLint kế thừa `next/core-web-vitals` + `next/typescript` — xem
  `eslint.config.mjs`. `npm run lint` chạy `eslint`.
- `tsconfig.json` loại `cloudflare/`, `scripts/`, `tests/` khỏi phạm vi
  typecheck của app — các thư mục đó không đi qua cùng cấu hình strict với
  `src/`.

## Xác thực dữ liệu

Zod là công cụ kiểm tra input bắt buộc ở biên (form, Server Action,
Credentials provider) — xem cách dùng ở `src/auth.ts` làm ví dụ, không có quy
ước Zod nào tách biệt cần ghi thêm ngoài phần đã nêu ở README.

## Kiểm thử

`tests/*.test.ts` chạy bằng Node test runner qua `tsx` (không dùng Jest/
Vitest) — xem các script `test:e2e`, `test:portal`, `test:activities` trong
`package.json` để biết đúng lệnh và phạm vi của từng bộ test. `test:e2e`
(`scripts/e2e.ts`) ghi/xoá dữ liệu thật vào `DATABASE_URL` đang trỏ tới — chỉ
chạy trên máy dev/staging, xem `docs/DEPLOY.md` mục 10.

## Phân quyền và audit log

"Backend luôn kiểm tra quyền" và "ghi audit log cho thao tác quan trọng"
(nguyên tắc #6, #8 trong README) thực thi cụ thể qua `requirePermission()` /
`can()` trong `src/lib/permissions.ts` và `src/lib/audit.ts`. Thêm Server
Action mới mà không gọi lại hai hàm này là vi phạm quy ước, dù middleware đã
chặn route ở tầng điều hướng — xem lý do tách hai lớp tại
`docs/system-architecture.md`.
