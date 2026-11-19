-- Phiếu tháng đã chốt lúc học viên rời lớp: lưu số đã xuất, số buổi chưa học
-- bị khấu trừ để phiếu in đủ ba dòng "đã xuất → khấu trừ → còn lại" và lần
-- đồng bộ sau không tính lại.
ALTER TABLE "sepay_receivables" ADD COLUMN IF NOT EXISTS "leftClass" TEXT;
