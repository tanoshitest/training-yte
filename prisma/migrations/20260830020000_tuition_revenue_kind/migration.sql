-- Doanh số mới/gia hạn phải là snapshot trên từng phiếu thu, không suy lại từ
-- trạng thái hiện tại của học viên. Phiếu cũ để NULL nên không xuất hiện trên chart.
CREATE TYPE "TuitionRevenueKind" AS ENUM ('NEW', 'RENEWAL');

-- Mọi học viên đang tồn tại tại thời điểm cut-over đều là học viên cũ. Default
-- được đổi sang true sau khi backfill để hồ sơ tạo mới về sau đủ điều kiện đóng mới.
ALTER TABLE "students"
ADD COLUMN "isNewRevenueStudent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "students"
ALTER COLUMN "isNewRevenueStudent" SET DEFAULT true;

-- Hồ sơ học phí hiện hữu nếu thu thêm sẽ là gia hạn. Hồ sơ mới được code nghiệp vụ
-- gán NEW khi đây là hồ sơ học phí đầu tiên của một học viên mới.
ALTER TABLE "student_tuitions"
ADD COLUMN "currentRevenueKind" "TuitionRevenueKind" NOT NULL DEFAULT 'RENEWAL';

ALTER TABLE "tuition_payments"
ADD COLUMN "revenueKind" "TuitionRevenueKind";

-- Theo dữ liệu được duyệt: chỉ phiếu 3,9 triệu của HV0517 là học phí đóng mới.
-- Ràng buộc đồng thời id, mã học viên và số tiền để migration không thể gắn nhầm.
UPDATE "tuition_payments" AS payment
SET "revenueKind" = 'NEW'
FROM "student_tuitions" AS tuition, "students" AS student
WHERE payment."tuitionId" = tuition."id"
  AND tuition."studentId" = student."id"
  AND payment."id" = 'cmtdufe9000ld01no4bu934xk'
  AND student."code" = 'HV0517'
  AND payment."amount" = 3900000;

CREATE INDEX "tuition_payments_paidAt_revenueKind_idx"
ON "tuition_payments"("paidAt", "revenueKind");
