-- Miễn giảm 12 tuần được cấu hình độc lập với miễn giảm 24 tuần.
-- Backfill bằng một nửa mức 24 tuần để giá gói 24 buổi hiện tại không đổi sau deploy:
-- công thức cũ (gốc - giảm 24 / 2) / 2 = công thức mới (gốc - giảm 12) / 2.
ALTER TABLE "sub_levels"
  ADD COLUMN "discount12Weeks" DECIMAL(12,2);

UPDATE "sub_levels"
SET "discount12Weeks" = ROUND(COALESCE("discount24Weeks", 600000) / 2)
WHERE "discount12Weeks" IS NULL;
