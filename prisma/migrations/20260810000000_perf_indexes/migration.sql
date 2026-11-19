-- Chỉ mục cho hai bảng tăng nhanh nhất (PRD §25 — truy vấn < 500ms).
-- tuition_payments.paidAt: trang Thống kê lọc doanh thu theo khoảng tháng.
-- audit_logs(userId, createdAt): trang Nhật ký lọc theo người dùng, sắp xếp mới nhất trước.

-- Dùng IF NOT EXISTS: nếu database production từng được dựng bằng `prisma db push`
-- thì chỉ mục có thể đã tồn tại, và migration lỗi sẽ làm container không khởi động được
-- (docker-entrypoint.sh chạy `set -e`).

CREATE INDEX IF NOT EXISTS "tuition_payments_paidAt_idx" ON "tuition_payments"("paidAt");
CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");
