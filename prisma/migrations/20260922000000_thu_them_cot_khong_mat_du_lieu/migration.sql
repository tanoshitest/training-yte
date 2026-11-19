-- Phép thử đường CI/CD: thêm một cột có giá trị mặc định vào bảng đang có dữ liệu.
-- Cột này không được mã nguồn dùng tới; mục đích là chứng minh việc thêm cột khi
-- deploy không làm mất dòng nào. Xoá được bất cứ lúc nào.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "ghiChuNoiBo" TEXT NOT NULL DEFAULT '';
