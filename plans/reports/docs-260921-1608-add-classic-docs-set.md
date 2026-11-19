# Báo cáo: thêm bộ docs layout classic cho STEPS LMS

## File đã tạo

- `docs/project-overview-pdr.md` — mục đích sản phẩm, vai trò người dùng
  (gồm quyết định Học vụ dùng chung quyền Admin), thuật ngữ miền (Syllabus vs
  Lịch dạy, NormalPackage vs IeltsCourse, TuitionEntry là nguồn sự thật học
  phí), trỏ ngược "Nguyên tắc bắt buộc" trong README thay vì lặp lại. Bằng
  chứng: `README.md`, `prisma/schema.prisma` (enum `Role`, `ClassType`,
  model `TuitionEntry`/`StudentTuition`), `src/lib/roles.ts`,
  `src/lib/permissions.ts`.
- `docs/system-architecture.md` — ranh giới Server Actions, lý do tách
  `src/auth.config.ts` (Edge-safe) khỏi `src/auth.ts` (Node), phân quyền hai
  lớp (middleware điều hướng + `permissions.ts` là nguồn sự thật), học phí
  tính lại từ bút toán, audit log có `UndoPlan`, và ghi rõ hai đích triển
  khai song song. Bằng chứng: `src/auth.config.ts`, `src/auth.ts`,
  `src/middleware.ts`, `src/lib/permissions.ts`, `src/lib/roles.ts`,
  `src/lib/tuition.ts`, `prisma/schema.prisma` (model `AuditLog`), so sánh
  header `docs/DEPLOY.md` và `docs/CLOUDFLARE.md`.
- `docs/codebase-summary.md` — bảng điều hướng thuần WHERE tới các entry
  point (`src/app/(app)/`, `src/app/dang-nhap/`, `src/app/portal/`,
  `src/app/api/`, `src/lib/*`, `src/components/ui/`,
  `src/components/layout/`, `prisma/`, `tests/`, `scripts/`). Không mô tả
  logic từng file. Bằng chứng: liệt kê thư mục qua Glob/Bash `find`.
- `docs/code-standards.md` — chỉ ghi phần README chưa nêu: TypeScript
  `strict: true` (`tsconfig.json`), ESLint kế thừa `next/core-web-vitals` +
  `next/typescript` (`eslint.config.mjs`), `tsconfig.json` loại trừ
  `cloudflare/`/`scripts/`/`tests/` khỏi typecheck, quy ước test dùng Node
  test runner qua `tsx` (không Jest/Vitest) và cảnh báo `test:e2e` ghi dữ
  liệu thật. Bằng chứng: `tsconfig.json`, `eslint.config.mjs`,
  `package.json` (scripts `test:e2e`/`test:portal`/`test:activities`),
  `docs/DEPLOY.md` mục 10.
- `docs/design-guidelines.md` — file rất ngắn, chỉ trỏ tới nơi thật sự chứa
  token màu (`src/app/globals.css`) và design system
  (`src/components/ui/`, `src/components/layout/`), không lặp lại nội dung
  README. Bằng chứng: đọc `src/app/globals.css` xác nhận đúng token
  `--color-brand-600: #2563eb` như README mô tả.
- `docs/deployment-guide.md` — trang điều hướng 1 đoạn, chỉ trỏ tới
  `docs/DEPLOY.md` (VPS/Coolify, kiến trúc hiện hành theo ghi chú đầu file
  đó) và `docs/CLOUDFLARE.md` (Cloudflare Workers/OpenNext), không sao chép
  nội dung của hai file này. Hai file đó không bị sửa.

## File bị bỏ qua và lý do

- `docs/project-roadmap.md` — không tạo. `IMPLEMENTATION_STATUS.md` và
  `PLAN_STEPS_LMS_12_ACTIVITY_ENGINES.md` ở gốc repo mô tả một tính năng "12
  Activity Engines" chạy trên kiến trúc Cloudflare Worker/KV/Durable Object
  cũ; toàn bộ checklist trong `IMPLEMENTATION_STATUS.md` đã tick xong — đây
  là bản ghi một kế hoạch đã đóng, không phải roadmap còn hiệu lực. Mã liên
  quan (`cloudflare/activity-registry.ts`) nằm ngoài `src/`, bị
  `tsconfig.json` loại khỏi typecheck của app, và không được `README.md`
  liệt kê trong bảng công nghệ hay cấu trúc thư mục — không đủ bằng chứng
  đây là kiến trúc/roadmap hiện hành của ứng dụng chính. Không tìm thấy
  nguồn roadmap nào khác (không có `ROADMAP.md`, không có ghi chú roadmap
  trong git log 30 commit gần nhất — toàn bộ là các commit tính năng/sửa lỗi
  cụ thể, không phải mốc lộ trình).
- `Started.md`, `Flyers.md`, `Movers.md` — không đưa vào `docs/`. Đọc lướt
  xác nhận đây là tài liệu bản đồ nội dung chương trình học (curriculum:
  Unit, từ vựng, ngữ pháp), không phải tài liệu kỹ thuật, nằm ngoài phạm vi
  docs kỹ thuật theo yêu cầu.

## Ràng buộc đã tuân thủ

- Không sửa, không đụng `docs/CLOUDFLARE.md` và `docs/DEPLOY.md` — xác nhận
  qua `git status --porcelain docs/` chỉ liệt kê 6 file mới tạo.
- Không sửa `README.md` hay bất kỳ file root nào khác, không đụng `src/`,
  `prisma/`.
- Không tạo ADR/changelog/roadmap placeholder, không hand-maintain danh sách
  lệnh (trỏ `package.json`) hay file tree đầy đủ (trỏ thư mục/Glob).
- Tổng dung lượng 6 file mới: 249 dòng, trong ngân sách ~800 dòng.

## Câu hỏi chưa giải quyết

- `cloudflare/` (12 Activity Engines) và phân hệ SePay/hóa đơn điện tử
  (`Finance*` trong schema) có còn là tính năng đang phát triển hay đã ngừng
  không rõ ràng từ bằng chứng có sẵn — nếu người dùng xác nhận trạng thái
  thật, có thể cập nhật `docs/project-overview-pdr.md` và
  `docs/system-architecture.md` để đưa vào (hoặc chính thức loại bỏ khỏi
  repo) thay vì để mục "ngoài phạm vi" như hiện tại.

Status: DONE
Summary: Đã tạo 6/7 file trong bộ layout classic (bỏ qua project-roadmap.md vì không có bằng chứng roadmap còn hiệu lực), tất cả trỏ WHY/WHERE về nguồn thật, không đụng docs/DEPLOY.md và docs/CLOUDFLARE.md.
Concerns/Blockers: Không có, chỉ có câu hỏi chưa giải quyết liệt kê ở trên.
