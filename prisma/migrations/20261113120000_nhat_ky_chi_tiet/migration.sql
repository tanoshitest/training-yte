-- Nhật ký chi tiết: nghiệp vụ + danh sách thay đổi "từ … thành …".
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "details" TEXT NOT NULL DEFAULT '';
