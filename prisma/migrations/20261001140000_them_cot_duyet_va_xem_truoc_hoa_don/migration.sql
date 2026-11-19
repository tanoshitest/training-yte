-- AlterTable
-- `approvedAt` và `previewHash` trước đây chỉ nằm trong bộ nhớ, không có cột nên mất sau mỗi lần ghi
-- DB: bản xem trước không bao giờ khớp lúc xuất và hóa đơn đã duyệt không bao giờ được phát hành.
ALTER TABLE "sepay_invoices"
  ADD COLUMN IF NOT EXISTS "approvedAt" TEXT,
  ADD COLUMN IF NOT EXISTS "previewHash" TEXT;
