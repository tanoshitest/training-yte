-- Phòng học dùng chung toàn trung tâm, không gắn chi nhánh.
-- Form đã bỏ ô Chi nhánh; dọn dữ liệu cũ để không còn nhãn chi nhánh mồ côi.
-- Chỉ UPDATE, không DROP COLUMN (docs/DEPLOY.md §9).
UPDATE "rooms" SET "branchId" = NULL WHERE "branchId" IS NOT NULL;
