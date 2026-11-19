-- Lớp học: gán được NHIỀU syllabus (bảng nối `class_syllabuses`) và có Chi nhánh riêng.
--
-- Khác với các migration trước, migration này có một lệnh DROP COLUMN
-- (`classes.syllabusId`). Nó chỉ chạy SAU khi dữ liệu cũ đã được chép sang bảng nối
-- ở bước ngay trên, nên không mất dữ liệu. Đây là ngoại lệ có chủ ý so với
-- docs/DEPLOY.md §9: giữ lại cột cũ sẽ thành field chết mà không code nào đọc.
--
-- Dùng IF NOT EXISTS / IF EXISTS vì database production có thể đã được dựng bằng
-- `prisma db push`; migration lỗi sẽ làm container không khởi động được
-- (docker-entrypoint.sh chạy `set -e`).

-- 1. Bảng nối Lớp ↔ Syllabus ------------------------------------------------
CREATE TABLE IF NOT EXISTS "class_syllabuses" (
    "id"         TEXT NOT NULL,
    "classId"    TEXT NOT NULL,
    "syllabusId" TEXT NOT NULL,
    "order"      INTEGER NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_syllabuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "class_syllabuses_classId_syllabusId_key"
    ON "class_syllabuses"("classId", "syllabusId");

CREATE INDEX IF NOT EXISTS "class_syllabuses_classId_order_idx"
    ON "class_syllabuses"("classId", "order");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_syllabuses_classId_fkey') THEN
        ALTER TABLE "class_syllabuses"
            ADD CONSTRAINT "class_syllabuses_classId_fkey"
            FOREIGN KEY ("classId") REFERENCES "classes"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_syllabuses_syllabusId_fkey') THEN
        ALTER TABLE "class_syllabuses"
            ADD CONSTRAINT "class_syllabuses_syllabusId_fkey"
            FOREIGN KEY ("syllabusId") REFERENCES "syllabuses"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 2. Chép syllabus đang gán của từng lớp sang bảng nối ------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'classes' AND column_name = 'syllabusId'
    ) THEN
        EXECUTE $sql$
            INSERT INTO "class_syllabuses" ("id", "classId", "syllabusId", "order")
            SELECT gen_random_uuid()::text, c."id", c."syllabusId", 1
            FROM "classes" c
            WHERE c."syllabusId" IS NOT NULL
            ON CONFLICT ("classId", "syllabusId") DO NOTHING
        $sql$;
    END IF;
END $$;

-- 3. Bỏ cột cũ (dữ liệu đã nằm ở bảng nối) -----------------------------------
ALTER TABLE "classes" DROP COLUMN IF EXISTS "syllabusId";

-- 4. Chi nhánh của lớp -------------------------------------------------------
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

CREATE INDEX IF NOT EXISTS "classes_branchId_idx" ON "classes"("branchId");

-- ON DELETE SET NULL: xoá chi nhánh thì lớp vẫn còn, chỉ mất liên kết.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_branchId_fkey') THEN
        ALTER TABLE "classes"
            ADD CONSTRAINT "classes_branchId_fkey"
            FOREIGN KEY ("branchId") REFERENCES "branches"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
