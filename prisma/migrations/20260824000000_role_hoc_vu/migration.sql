-- Thêm vai trò Học vụ (ACADEMIC).
--
-- Hiện tại Học vụ đăng nhập với quyền y hệt Quản trị viên; chỗ duy nhất quyết định
-- điều đó là `effectiveRole()` trong src/lib/roles.ts, nên sau này muốn thu hẹp quyền
-- thì sửa ở đó chứ không cần đụng tới dữ liệu.
--
-- Chỉ cộng thêm giá trị enum, không đổi dữ liệu cũ (docs/DEPLOY.md §9).

ALTER TYPE "Role" ADD VALUE 'ACADEMIC';
