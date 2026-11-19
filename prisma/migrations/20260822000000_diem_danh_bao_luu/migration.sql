-- Thêm trạng thái điểm danh "Bảo lưu" (PRD §11.1).
-- Chỉ cộng thêm một giá trị enum, dữ liệu điểm danh cũ giữ nguyên.

ALTER TYPE "AttendanceStatus" ADD VALUE 'RESERVED';
