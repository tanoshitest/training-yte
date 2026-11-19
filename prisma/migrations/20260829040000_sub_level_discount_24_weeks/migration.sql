-- Chiết khấu gói 24 tuần do admin khai. Dòng cũ giữ 600.000 như công thức trước.
ALTER TABLE "sub_levels"
  ADD COLUMN "discount24Weeks" DECIMAL(12,2);

UPDATE "sub_levels"
SET "discount24Weeks" = 600000
WHERE "discount24Weeks" IS NULL;
