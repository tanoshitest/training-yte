-- AlterTable
-- `noFee` và `makeupOf` trước đây chỉ nằm trong bộ nhớ, không có cột nên mất sau mỗi lần
-- đọc lại từ DB: tick "Học không tính phí" và liên kết buổi dạy bù biến mất sau reload.
ALTER TABLE "lesson_sessions"
  ADD COLUMN IF NOT EXISTS "noFee" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "makeupOf" TEXT;
