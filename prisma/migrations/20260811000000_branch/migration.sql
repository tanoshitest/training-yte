-- Chi nhánh (tab mới trong màn hình Cấu hình) và liên kết Phòng học → Chi nhánh.
--
-- Migration này chỉ CỘNG THÊM: một bảng mới, một cột nullable, một index.
-- Không DROP cột nào, nên image cũ vẫn chạy được với schema mới (docs/DEPLOY.md §9).
--
-- Dùng IF NOT EXISTS vì database production có thể đã được dựng bằng `prisma db push`;
-- migration lỗi sẽ làm container không khởi động được (docker-entrypoint.sh chạy `set -e`).

CREATE TABLE IF NOT EXISTS "branches" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "branches_name_key" ON "branches"("name");

ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

CREATE INDEX IF NOT EXISTS "rooms_branchId_idx" ON "rooms"("branchId");

-- Postgres không hỗ trợ `ADD CONSTRAINT IF NOT EXISTS` cho khoá ngoại.
-- ON DELETE SET NULL: xoá chi nhánh thì phòng vẫn còn, chỉ mất liên kết.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_branchId_fkey') THEN
        ALTER TABLE "rooms"
            ADD CONSTRAINT "rooms_branchId_fkey"
            FOREIGN KEY ("branchId") REFERENCES "branches"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
