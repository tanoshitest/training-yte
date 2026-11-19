-- Level bên trong cấp học: cấp 1 có 6 level, cấp 2 có 5 level…
-- Hai cột mới đều NOT NULL nhưng có DEFAULT 1 nên dữ liệu cũ tự nhận "Level 1",
-- không cần backfill và không có DROP COLUMN (docs/DEPLOY.md §9).
ALTER TABLE "levels" ADD COLUMN IF NOT EXISTS "levelCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "normal_packages" ADD COLUMN IF NOT EXISTS "levelNo" INTEGER NOT NULL DEFAULT 1;

-- Mỗi cấp học × level × số buổi chỉ có một dòng giá. Ràng buộc mới rộng hơn ràng
-- buộc cũ nên mọi dữ liệu đang có đều thoả, không thể fail lúc deploy.
DROP INDEX IF EXISTS "normal_packages_levelId_totalSessions_key";

CREATE UNIQUE INDEX IF NOT EXISTS "normal_packages_levelId_levelNo_totalSessions_key" ON "normal_packages"("levelId", "levelNo", "totalSessions");
