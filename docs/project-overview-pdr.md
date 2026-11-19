# Tổng quan sản phẩm

STEPS LMS quản lý vận hành một trung tâm Anh ngữ: **Syllabus, Lớp học, Học
viên, Lịch dạy, Điểm danh và Học phí** (xem bảng công nghệ và mô tả ngắn tại
[`README.md`](../README.md)).

Repo này là **bản độc lập dành cho STEPS**, không chứa database, dữ liệu
import, backup hay lịch sử Git của dự án nguồn — xem `README.md` dòng đầu.
Đừng giả định có dữ liệu hay tenant thứ hai ngoài STEPS.

## Người dùng và vai trò

Vai trò xác định qua `Role` trong `prisma/schema.prisma` và ma trận quyền tại
`src/lib/permissions.ts`. Ghi chú miền quan trọng không thấy được nếu chỉ đọc
tên vai trò:

- **Học vụ (`ACADEMIC`) dùng chung quyền với Quản trị viên (`ADMIN`)** — quyết
  định chốt ngày 2026-08-20, xem rationale tại `effectiveRole()` trong
  `src/lib/roles.ts`. Đây là quyết định nghiệp vụ có thể đảo ngược sau, không
  phải giới hạn kỹ thuật.
- **Kế toán (`ACCOUNTANT`)** chỉ vào học phí/thu chi/lương, không vào vận hành
  đào tạo — xem comment enum `Role` trong `prisma/schema.prisma`.
- **Giáo viên** chỉ thấy lớp và buổi được phân công (nguyên tắc bắt buộc #7
  trong `README.md`); ranh giới này thực thi ở `assignedClassWhere` /
  `assignedSessionWhere` trong `src/lib/permissions.ts`.

## Thuật ngữ miền cần phân biệt

- **Syllabus ≠ Lịch dạy** — Syllabus là nội dung chương trình (Unit, bài,
  ngày học); Lịch dạy (`LessonSession`) là buổi học thực tế (ngày/giờ/phòng/
  giáo viên). Sửa lịch không bao giờ đổi nội dung Syllabus (nguyên tắc bắt
  buộc #1 trong `README.md`).
- **`NormalPackage` vs `IeltsCourse`** — hai mô hình tính học phí khác nhau
  cho `ClassType.NORMAL` (theo gói số buổi) và `ClassType.IELTS` (trọn khóa,
  tăng buổi không tăng học phí). Xem enum `ClassType` và hai model tương ứng
  trong `prisma/schema.prisma`.
- **`TuitionEntry` là nguồn sự thật của học phí** — `totalAmount` trên
  `StudentTuition` được tính lại từ các bút toán (`TuitionEntry`) và phiếu thu
  (`TuitionPayment`), không lưu trực tiếp; xem `src/lib/tuition.ts`.

## Ràng buộc nghiệp vụ bắt buộc

Danh sách đầy đủ và có hiệu lực nằm ở mục **"Nguyên tắc bắt buộc"** của
[`README.md`](../README.md) (8 điều: Syllabus/Lịch dạy, trừ buổi khi
`COMPLETED`, học phí IELTS theo khóa, phát sinh vượt gói, giá không hard-code,
backend luôn kiểm tra quyền, giáo viên chỉ thấy lớp được phân công, audit
log). Không lặp lại danh sách này ở nơi khác trong `docs/` — sửa tại nguồn khi
quy tắc đổi.

## Ngoài phạm vi tài liệu này

Tài liệu này mô tả app Next.js trong `src/`. **App đó hiện không được deploy** —
thứ trung tâm dùng hằng ngày nằm ở `cloudflare/`, chạy qua `Dockerfile.vps`, với
mô hình học phí khác hẳn (thu theo tháng hoặc theo khóa, đơn giá từng buổi, phí
học liệu theo tháng) so với mô hình gói-buổi-theo-Level mô tả ở trên. Hai phân hệ
không dùng chung bảng: bảng của app Next.js mang tiền tố `legacy_`.

Xem [`system-architecture.md`](system-architecture.md) trước khi làm việc với
`cloudflare/`, và [`codebase-summary.md`](codebase-summary.md) để biết bắt đầu đọc
từ đâu. Hệ game học tập (12 Activity Engines) có ghi chú riêng ở
`IMPLEMENTATION_STATUS.md` và `PLAN_STEPS_LMS_12_ACTIVITY_ENGINES.md` tại gốc repo.
