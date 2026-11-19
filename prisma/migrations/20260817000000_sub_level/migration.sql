-- Level trở thành danh mục có tên riêng: mỗi level là một dòng thuộc một cấp học
-- (VD: Kids 1 → "Starters", "Movers"). Bảng giá và lớp học chọn level từ danh mục này.
--
-- Migration chỉ cộng thêm (docs/DEPLOY.md §9): tạo bảng mới, thêm cột nullable, và
-- chép dữ liệu cũ sang. Hai cột `levels.levelCount` / `normal_packages.levelNo` không
-- còn dùng nhưng vẫn giữ lại để không phải DROP COLUMN.

CREATE TABLE IF NOT EXISTS "sub_levels" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sub_levels_levelId_name_key" ON "sub_levels"("levelId", "name");

CREATE INDEX IF NOT EXISTS "sub_levels_levelId_idx" ON "sub_levels"("levelId");

ALTER TABLE "sub_levels" DROP CONSTRAINT IF EXISTS "sub_levels_levelId_fkey";
ALTER TABLE "sub_levels" ADD CONSTRAINT "sub_levels_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chuyển dữ liệu: cấp học đang khai báo N level thì sinh sẵn N dòng tên "Level 1"…"Level N".
-- Người dùng đổi lại tên thật ở tab Cấu hình level sau.
INSERT INTO "sub_levels" ("id", "levelId", "name", "order", "createdAt", "updatedAt")
SELECT
    md5(l."id" || '-' || g::text),
    l."id",
    'Level ' || g::text,
    g,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "levels" l
CROSS JOIN generate_series(1, GREATEST(l."levelCount", 1)) AS g
ON CONFLICT DO NOTHING;

ALTER TABLE "normal_packages" ADD COLUMN IF NOT EXISTS "subLevelId" TEXT;

-- Dòng bảng giá cũ đang trỏ tới level thứ mấy thì gắn đúng dòng danh mục vừa sinh.
UPDATE "normal_packages" p
SET "subLevelId" = s."id"
FROM "sub_levels" s
WHERE s."levelId" = p."levelId" AND s."order" = p."levelNo" AND p."subLevelId" IS NULL;

ALTER TABLE "normal_packages" DROP CONSTRAINT IF EXISTS "normal_packages_subLevelId_fkey";
ALTER TABLE "normal_packages" ADD CONSTRAINT "normal_packages_subLevelId_fkey" FOREIGN KEY ("subLevelId") REFERENCES "sub_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Khoá duy nhất chuyển từ (cấp học, level thứ mấy, số buổi) sang (level, số buổi).
-- Dữ liệu vừa chép sang giữ nguyên quan hệ 1-1 nên không thể đụng nhau.
DROP INDEX IF EXISTS "normal_packages_levelId_levelNo_totalSessions_key";

CREATE UNIQUE INDEX IF NOT EXISTS "normal_packages_subLevelId_totalSessions_key" ON "normal_packages"("subLevelId", "totalSessions");

ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "subLevelId" TEXT;

ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_subLevelId_fkey";
ALTER TABLE "classes" ADD CONSTRAINT "classes_subLevelId_fkey" FOREIGN KEY ("subLevelId") REFERENCES "sub_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
