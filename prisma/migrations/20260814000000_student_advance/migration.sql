-- Thu học phí tạm ứng: thu tiền được cho cả học viên chưa xếp lớp.
--
-- Mỗi lần thu là một dòng student_advances; số dư của học viên =
-- SUM("amount" - "usedAmount"). Khi học viên được xếp vào lớp, hệ thống lấy số dư đó
-- sinh phiếu thu (tuition_payments) cho hồ sơ học phí của lớp rồi cộng vào "usedAmount",
-- nên tiền chỉ được dùng đúng một lần và phiếu thu vẫn là nguồn sự thật duy nhất.
--
-- Migration chỉ CỘNG THÊM một bảng mới (docs/DEPLOY.md §9), không đụng bảng cũ.
-- Dùng IF NOT EXISTS vì database production có thể đã dựng bằng `prisma db push`.

CREATE TABLE IF NOT EXISTS "student_advances" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "usedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_advances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_advances_studentId_idx" ON "student_advances"("studentId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_advances_studentId_fkey') THEN
        ALTER TABLE "student_advances"
            ADD CONSTRAINT "student_advances_studentId_fkey"
            FOREIGN KEY ("studentId") REFERENCES "students"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
