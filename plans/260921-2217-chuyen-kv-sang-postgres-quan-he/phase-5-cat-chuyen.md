# Phase 5 — Cắt chuyển production

**Trạng thái:** Chưa được duyệt. Phase này **không tự động nối tiếp** Phase 4 — cần chủ dự án
đồng ý riêng, và nên báo trước cho khách hàng.

**Mục tiêu:** đưa tầng lưu trữ quan hệ lên production với thời gian ngừng dịch vụ ngắn nhất và
luôn có đường lùi trong vài phút.

## Điều kiện tiên quyết

1. Phase 4 đạt toàn bộ tiêu chí nghiệm thu.
2. Có backup production mới, tải về máy local và **đã thử khôi phục thành công** ít nhất một lần.
   Backup chưa thử khôi phục thì không tính là backup.
3. Chọn được khung giờ trung tâm không dạy và kế toán không thu tiền.
4. Khách hàng biết trước có khoảng thời gian ngắn không dùng được hệ thống.

## Trình tự đề xuất

1. Backup DB production, tải về, thử khôi phục ở local.
2. Tạm dừng nhận thao tác ghi (dừng container app) để dữ liệu đứng yên.
3. Chạy script Phase 3 trên production, ghi vào **các bảng mới**. Dữ liệu KV cũ trong
   `vps_app_state` **giữ nguyên tại chỗ, không xóa** — đây chính là đường lùi.
4. Đối chiếu số đếm và số liệu tài chính ngay trên production, theo đúng danh sách ở Phase 3.
   Không khớp thì dừng lại và lùi, không "chạy tạm rồi sửa sau".
5. Bật app với `STORAGE_MODE=relational`.
6. Theo dõi trực tiếp: đăng nhập, mở các màn hình chính, thực hiện một thao tác ghi thử
   (ví dụ sửa ghi chú một học viên rồi hoàn tác).
7. Giữ nguyên dữ liệu KV cũ **ít nhất một tuần** sau khi cắt chuyển thành công, rồi mới bàn tới
   việc dọn.

## Đường lùi (mục tiêu dưới 5 phút)

Đặt lại `STORAGE_MODE=kv` và khởi động lại container. Vì dữ liệu KV cũ vẫn nguyên vẹn, hệ thống
quay về đúng trạng thái trước khi cắt chuyển.

**Lưu ý quan trọng:** những thay đổi phát sinh **sau** thời điểm cắt chuyển chỉ nằm trong bảng
quan hệ mới, lùi về KV sẽ mất phần đó. Vì vậy phải phát hiện sự cố sớm — đó là lý do bước 6 rà
ngay tại chỗ chứ không đợi hôm sau.

## Việc nên làm cùng dịp (đã nêu ở khảo sát hạ tầng trước đó)

Những việc này độc lập với plan này nhưng cùng chạm vào hạ tầng production, gom lại một lần sẽ
đỡ phải dừng dịch vụ nhiều lần:

- Bật HTTPS cho tên miền chính — hiện cả hai tên miền đều không có chứng chỉ, dữ liệu học viên và
  mật khẩu đang truyền qua HTTP thường.
- Đưa app đang chạy vào Coolify quản lý chính thức bằng `Dockerfile.vps`, thay cho file định tuyến
  Traefik viết tay `steps-lms-rollback.yaml` (dễ mất khi Coolify sinh lại cấu hình proxy).
- Bật backup định kỳ tự động cho database.
- Xử lý tình trạng thiếu RAM của VPS (1.9GB, đang dùng swap) — đây nhiều khả năng là nguyên nhân
  các lần build Next.js bị thất bại trong lịch sử deploy.

## Rủi ro

| Rủi ro | Cách chặn |
|---|---|
| Phát hiện lỗi sau khi nhân viên đã nhập liệu trên tầng mới | Rà ngay tại bước 6, không đợi; chọn khung giờ vắng để nếu phải lùi thì phần mất là nhỏ nhất |
| Script chạy trên production chậm hơn local | Đo thời gian chạy ở local trước, nhân hệ số an toàn khi chọn khung giờ |
| VPS thiếu RAM khi chạy script | Chạy script sau khi đã dừng app, hoặc nâng RAM trước |
