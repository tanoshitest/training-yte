-- Gỡ cột đã dùng để kiểm chứng đường CI/CD. Cột này chưa từng được nghiệp vụ
-- ghi vào nên không có dữ liệu thật nào bị mất.
ALTER TABLE "students" DROP COLUMN IF EXISTS "ghiChuNoiBo";
