-- Học phí gốc tách 12 tuần / 24 tuần. Cột basePrice sẵn có giữ giá 24 tuần.
ALTER TABLE "sub_levels"
  ADD COLUMN "basePrice12Weeks" DECIMAL(12,2);
