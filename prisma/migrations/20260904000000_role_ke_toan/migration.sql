-- Thêm vai trò Kế toán (ACCOUNTANT).
-- Chỉ cộng thêm giá trị enum, không đổi dữ liệu cũ (docs/DEPLOY.md §9).

ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';
