-- Hoàn tác thao tác nghiệp vụ từ Nhật ký hệ thống (PRD §26).
--
-- `oldValue`/`newValue` chỉ đủ để hiển thị nên không phát lại được; cột `undo` giữ
-- bản khai báo cách đảo ngược do chính action ghi ra. Dòng nhật ký cũ có `undo` NULL
-- nên không hoàn tác được — đúng như thiết kế, không backfill.

ALTER TYPE "AuditAction" ADD VALUE 'ROLLBACK';

ALTER TABLE "audit_logs"
  ADD COLUMN "undo" JSONB,
  ADD COLUMN "rolledBackAt" TIMESTAMP(3),
  ADD COLUMN "rolledBackById" TEXT;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_rolledBackById_fkey"
  FOREIGN KEY ("rolledBackById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
