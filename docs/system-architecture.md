# Kiến trúc hệ thống

Bảng công nghệ (framework, DB, ORM, auth) nằm ở [`README.md`](../README.md) —
không lặp lại ở đây. Tài liệu này chỉ ghi các ranh giới và quyết định kiến
trúc mà đọc code không suy ra ngay được.

## Next.js App Router + Server Actions

Toàn bộ nghiệp vụ chạy qua Server Actions và Server Components trong
`src/app/(app)/` (route đã đăng nhập) và `src/app/portal/` (cổng công khai
cho phụ huynh/học viên). Không có tầng REST/GraphQL riêng cho nghiệp vụ nội
bộ — `src/app/api/` chỉ phục vụ webhook/healthcheck, xem thư mục đó để biết
danh sách thực tế.

## Auth: tách cấu hình Edge và Node

NextAuth v5 được chia làm hai file có lý do kỹ thuật cụ thể:

- `src/auth.config.ts` — cấu hình dùng chung (callbacks JWT/session), **không
  được import Prisma hay bcrypt** vì `src/middleware.ts` chạy trên Cloudflare/
  Next Edge runtime, không có Node API.
- `src/auth.ts` — thêm `CredentialsProvider` (cần Prisma + bcrypt), chỉ chạy
  ở Node runtime (Server Actions, Route Handlers).

Vi phạm ranh giới này (import Prisma vào `auth.config.ts`) sẽ làm middleware
build lỗi hoặc crash ở Edge — đây là ràng buộc bắt buộc, không phải tuỳ chọn
style.

## Phân quyền hai lớp

1. **Điều hướng theo route** — `src/middleware.ts` chặn theo tiền tố path
   (`ADMIN_ONLY`, `TEACHER_ONLY`, `STUDENT_ONLY`, ngoại lệ
   `TEACHER_ALLOWED`). Đây là lớp UX (redirect sớm), không phải lớp bảo mật
   chính.
2. **Ma trận quyền theo hành động** — `src/lib/permissions.ts`
   (`PERMISSIONS`, `can()`, `requirePermission()`) là nguồn sự thật; mọi
   Server Action/Route Handler phải tự gọi lại, vì middleware không đủ để
   chặn (nguyên tắc bắt buộc #6 trong `README.md`).

Cả hai lớp đều quy vai trò qua `effectiveRole()` (`src/lib/roles.ts`) trước
khi so khớp, nên Học vụ luôn đi theo đúng nhánh Admin ở cả middleware lẫn
`permissions.ts` — xem rationale quyết định ngày 2026-08-20 tại đó thay vì
lặp lại ở đây.

## Dữ liệu học phí không lưu trực tiếp

`StudentTuition.totalAmount`/`paidAmount` là số liệu suy ra: nguồn sự thật là
bút toán (`TuitionEntry`) và phiếu thu (`TuitionPayment`), tính lại qua
`recalcTuition` (xem `src/lib/tuition.ts`). Quyết định này quan trọng khi khôi
phục dữ liệu — `docs/DEPLOY.md` mục 8 dựa vào đúng tính chất này để giảm phạm
vi backup cần khôi phục.

## Audit log có thể hoàn tác

`AuditLog.undo` khai báo kế hoạch đảo ngược thao tác (`UndoPlan`, xem
`src/lib/audit-undo.ts`); `oldValue`/`newValue` chỉ để hiển thị, không đủ để
phát lại tự động. Rollback là thao tác ghi dữ liệu thật nên giới hạn quyền
`audit.rollback` chỉ `ADMIN` trong `src/lib/permissions.ts`.

## Ứng dụng đang chạy production nằm ở `cloudflare/`, không phải `src/`

**Đã xác minh trực tiếp trên máy chủ (2026-09-22) bằng `docker inspect vsteps-app`:**
container production tại `ngoaingusteps.edu.vn` chạy lệnh `tsx cloudflare/vps-server.ts`,
build từ **`Dockerfile.vps`** (không phải `Dockerfile` ở gốc repo — file đó build app
Next.js chạy `node server.js`, nhưng **không có deploy pipeline nào dùng nó**), deploy qua
[`deploy/docker-compose.yml`](../deploy/docker-compose.yml). Xem quy trình đầy đủ ở
[`docs/DEPLOY.md`](DEPLOY.md).

`cloudflare/vps-server.ts` route **100% request, mọi path** qua `worker.fetch()`
(`cloudflare/worker.ts`) — Next.js trong `src/app/**` (route handler, Server Actions,
middleware, trang `ke-toan/*`...) không hề được Node boot lên trong container này, dù
build được và trông đầy đủ tính năng. Các bảng Prisma của nhánh Next.js
(`FinanceBankTransaction`, `FinancePaymentOrder`, `FinanceReceivable`, ...) đã đổi
`@@map` sang tiền tố `legacy_*` để nhường tên bảng thật cho tầng lưu trữ của ứng dụng
đang chạy (`Ops*`, xem `cloudflare/storage/`). **Trước khi sửa bất cứ gì liên quan
webhook/finance/kế toán, luôn kiểm tra file đó có nằm trong `cloudflare/` không — nếu
sửa trong `src/app/**` thì thay đổi sẽ không bao giờ tới người dùng thật.**

Đường lùi Cloudflare Workers thật sự (`wrangler deploy`, `opennextjs-cloudflare`,
`wrangler.jsonc`, script `deploy`/`deploy:full`/`upload`/`preview`/`demo:check` trong
`package.json`) vẫn còn trong repo nhưng **chưa xác minh còn ai dùng hay không** — không
coi đó là đích triển khai đang hoạt động cho tới khi kiểm chứng lại.

`worker.ts` truy cập dữ liệu qua đúng ba hàm (`get`, `put`, `compareAndPut`)
của `env.STEPS_LMS_DATA`, lắp tại `cloudflare/vps-server.ts`.

### `src/` không hoàn toàn chết — vài file là thư viện dùng chung thật sự

Đừng suy diễn "mọi thứ trong `src/` đều là code chết" — một phần nhỏ được app thật
(`cloudflare/`) import trực tiếp:

- `src/lib/money-words.ts` — dùng bởi `cloudflare/receipt-pdf.ts` (in số tiền bằng chữ).
- `src/components/ui/button.tsx`, `input.tsx` — dùng bởi `cloudflare/client/*.tsx`.
- `src/app/(app)/syllabus/*` (editor, mẫu bài, types) — dùng bởi
  `cloudflare/client/syllabus-app.tsx`.
- `src/generated/prisma/client` — Prisma client dùng chung cho toàn bộ `cloudflare/storage/`.

Màn hình soạn giáo trình (syllabus editor) trong app thật thực chất là **React**, không
phải JS thuần như phần còn lại của `cloudflare/public/app.js`: nó viết ở
`cloudflare/client/syllabus-app.tsx`, tái dùng component từ `src/`, rồi build riêng bằng
esbuild (`node scripts/build-cloudflare-syllabus.mjs`) ra file tĩnh
`cloudflare/public/syllabus.js` — file này **commit thẳng vào git**, không tự build lại
khi CI deploy (`Dockerfile.vps`/`deploy/deploy.sh` không gọi bước esbuild này). Sửa
`cloudflare/client/*.tsx` mà quên build + commit lại bundle `.js` tương ứng thì production
vẫn phục vụ bản cũ.

**Tầng lưu trữ của dự án là các bảng quan hệ, ở mọi môi trường.** Không đặt biến
môi trường nào thì ứng dụng chạy trên bảng quan hệ; đó là mặc định trong mã
nguồn. Mỗi thực thể một bảng, mỗi bản ghi một dòng — `students`, `classes`,
`lesson_sessions`, `attendances`, `sepay_*` — đọc/ghi qua `cloudflare/storage/`.

Ở tầng này ứng dụng **không đọc hay ghi `vps_app_state`**: syllabus nằm ở
`syllabus_catalog` và `syllabus_documents`, các bước xử lý dữ liệu một lần ở
`data_migrations`, dữ liệu cổng học viên ở `student_progress`,
`student_activity_attempts` và `student_app_state`. Đã kiểm chứng bằng cách đổi
tên bảng `vps_app_state` rồi chạy hết các màn hình và thao tác ghi mà không lỗi.

### `STORAGE_MODE=kv` là đường lùi, không phải một lựa chọn vận hành

`kv` quay về cách lưu cũ: mỗi nhóm dữ liệu là **một dòng JSON** trong
`vps_app_state`. Giá trị này tồn tại cho đúng một tình huống — cắt chuyển một hệ
thống còn đang chạy tầng cũ mà gặp sự cố, cần quay lại trong vài phút. Phải cố
tình đặt mới chạy, và không môi trường nào nên đặt nó khi vận hành bình thường.

Điều kiện để đường lùi đó còn hiệu lực: **dữ liệu trong `vps_app_state` phải được
giữ nguyên**, không xoá. Đổi lại, mọi thay đổi phát sinh sau khi cắt chuyển chỉ
nằm ở bảng quan hệ, nên lùi về `kv` là mất phần đó — đường lùi này chỉ dùng được
ngay sau khi cắt chuyển, không phải bất cứ lúc nào.

`cloudflare/vps-server.ts` nạp `.env` bằng dotenv để chạy được ở local; trong
container không có file này nên lệnh nạp không làm gì, và biến môi trường thật
luôn thắng giá trị trong `.env`.

Ràng buộc của tầng `relational`: `read()` phải dựng lại **đúng** cấu trúc JSON
mà `worker.ts` mong đợi, kể cả thứ tự phần tử trong mảng (cột `position`) và
sự khác nhau giữa trường vắng mặt (NULL) với chuỗi rỗng. Vi phạm điều này
không gây lỗi build mà gây sai lệch giao diện, nên mọi thay đổi trong
`cloudflare/storage/` phải chạy lại
`npx tsx scripts/migrate-kv-to-relational.ts --verify`.
