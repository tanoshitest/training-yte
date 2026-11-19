-- CreateTable
-- Máy chủ thật đã có sẵn bảng này (tạo tay trước khi có migration), nên tạo có điều kiện
-- để `prisma migrate deploy` không dừng giữa chừng ở bảng đã tồn tại.
CREATE TABLE IF NOT EXISTS "student_class_joined_at" (
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "joinedAt" TEXT NOT NULL,

    CONSTRAINT "student_class_joined_at_pkey" PRIMARY KEY ("studentId","classId")
);

-- AddForeignKey
-- Chỉ thêm khi bảng chưa có khoá ngoại nào (bảng tạo tay đã có khoá ngoại đặt tên khác).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"student_class_joined_at"'::regclass AND contype = 'f'
  ) THEN
    ALTER TABLE "student_class_joined_at" ADD CONSTRAINT "student_class_joined_at_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
