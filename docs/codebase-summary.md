# Bản đồ điều hướng codebase

Chỉ liệt kê **nơi bắt đầu đọc**, không mô tả logic bên trong. Danh sách lệnh
npm đầy đủ nằm ở `package.json`; cấu trúc thư mục tổng quát cũng có ở mục
"Cấu trúc thư mục" trong [`README.md`](../README.md).

## Vào ứng dụng đang được dùng thật (`cloudflare/`)

Đây là ứng dụng mà trung tâm dùng hằng ngày và là thứ `Dockerfile.vps` chạy —
**không phải** app Next.js trong `src/`. Xem
[`system-architecture.md`](system-architecture.md) để biết vì sao có hai app.

| Muốn tìm | Bắt đầu từ |
| --- | --- |
| Toàn bộ API và nghiệp vụ | `cloudflare/worker.ts` |
| Điểm khởi động, lắp tầng lưu trữ | `cloudflare/vps-server.ts` |
| Giao diện (SPA thuần, không framework) | `cloudflare/public/app.js` |
| Đọc/ghi dữ liệu trên bảng quan hệ | `cloudflare/storage/` |
| Kiểu dữ liệu nghiệp vụ | `cloudflare/people-types.ts`, `operations-types.ts`, `finance-types.ts` |
| Sổ SePay (phải thu, thanh toán, biên lai) | `cloudflare/sepay-engine.ts` |
| Hóa đơn điện tử MISA (gọi API, hàng chờ phát hành, xuất thủ công, công cụ thử) | `cloudflare/misa-invoice-client.ts`, `invoice-outbox.ts`, `misa-invoice-routes.ts` |
| Chọn mẫu người mua trên hóa đơn (có/không thông tin, CCCD) và thông số hóa đơn chỉnh ở UI | `cloudflare/misa-invoice-fields.ts` |
| Tin Zalo (yêu cầu thanh toán, thông báo đã thanh toán) và nhãn `loai_hoc_phi` | `cloudflare/zalo-outbox.ts`, `cloudflare/zalo-tuition-label.ts` |
| Chấm điểm Phiếu bằng OpenAI (API, chấm bài, gọi OpenAI, đọc đề .docx, PDF phiếu kết quả, zip cả lớp) — hướng dẫn dùng: `docs/huong-dan-cham-phieu-ai.md` | `cloudflare/grading-routes.ts`, `grading-engine.ts`, `openai-client.ts`, `docx-text.ts`, `grading-report-pdf.ts`, `zip-store.ts`; giao diện `cloudflare/public/grading-worksheet.js` |
| Tính học phí | `cloudflare/tuition-billing.ts` |
| Kho syllabus | `cloudflare/syllabus-storage.ts` |
| Màn hình React trong app thật (vd. soạn giáo trình) — build riêng bằng esbuild, xem `system-architecture.md` | `cloudflare/client/*.tsx` |

## Vào app Next.js (`src/`, hiện không được deploy)

| Muốn tìm | Bắt đầu từ |
| --- | --- |
| Route đã đăng nhập (LMS nội bộ) | `src/app/(app)/` |
| Đăng nhập | `src/app/dang-nhap/` |
| Cổng công khai cho phụ huynh/học viên | `src/app/portal/` |
| Trang chặn khi thiếu quyền | `src/app/khong-co-quyen/` |
| Route handler nội bộ (webhook, health) | `src/app/api/` |
| Cấu hình NextAuth (Edge-safe) | `src/auth.config.ts` |
| Cấu hình NextAuth (Node, có Credentials) | `src/auth.ts` |
| Chặn route theo vai trò | `src/middleware.ts` |

## Nghiệp vụ dùng chung (`src/lib/`)

| Muốn tìm | File |
| --- | --- |
| Ma trận phân quyền | `src/lib/permissions.ts` |
| Quy đổi vai trò (Học vụ ≈ Admin) | `src/lib/roles.ts` |
| Tính học phí | `src/lib/tuition.ts`, `src/lib/normal-tuition.ts` |
| Nhắc học phí | `src/lib/tuition-reminders.ts` |
| Ghi/hoàn tác audit log | `src/lib/audit.ts`, `src/lib/audit-undo.ts` |
| Ghi danh học viên | `src/lib/enrollment.ts` |
| Lịch nghỉ lớp | `src/lib/class-off-days.ts` |
| Tuyển sinh / chăm sóc | `src/lib/recruitment.ts`, `src/lib/recruitment-care.ts` |
| Prisma client | `src/lib/prisma.ts` |

Danh sách đầy đủ (`ls src/lib`) dài hơn bảng trên; dùng Glob/Grep khi cần file
cụ thể không có ở đây thay vì kỳ vọng bảng này liệt kê hết.

## Giao diện

| Muốn tìm | File |
| --- | --- |
| Design system dùng chung (Button, Card, Table, Modal...) | `src/components/ui/` |
| Khung trang + sidebar sau đăng nhập | `src/components/layout/app-shell.tsx` |
| Cấu hình menu sidebar theo vai trò | `src/components/layout/nav-config.ts` |
| Token màu / biến CSS | `src/app/globals.css` |

## Dữ liệu và kiểm thử

| Muốn tìm | File |
| --- | --- |
| Mô hình dữ liệu | `prisma/schema.prisma` |
| Dữ liệu mẫu | `prisma/seed.ts` |
| Test (Node test runner qua `tsx`) | `tests/*.test.ts` |
| Kịch bản import/kiểm tra syllabus, script vận hành | `scripts/` |
