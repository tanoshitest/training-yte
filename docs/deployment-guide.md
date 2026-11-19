# Triển khai

- [`docs/DEPLOY.md`](DEPLOY.md) — quy trình đang dùng: đẩy mã lên `main` thì
  GitHub Actions build và deploy ngay trên VPS, bằng `Dockerfile.vps` (chạy
  `cloudflare/worker.ts`). Kèm biến môi trường, sao lưu, rollback và cách dựng
  lại máy mới. Xem thêm [`docs/system-architecture.md`](system-architecture.md)
  mục "Ứng dụng đang chạy production nằm ở `cloudflare/`, không phải `src/`"
  để biết chính xác code nào là code thật trước khi sửa gì.
- Deploy lên Cloudflare Workers qua OpenNext/Wrangler (`wrangler.jsonc`, script
  `deploy`/`deploy:full`/`upload`/`preview` trong `package.json`) vẫn còn trong
  repo nhưng **chưa xác minh còn dùng hay không** — đừng coi đó là một đích
  triển khai đang hoạt động cho tới khi kiểm chứng lại. File `docs/CLOUDFLARE.md`
  từng mô tả đích này đã bị xoá.
