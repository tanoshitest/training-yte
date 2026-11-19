# Phase 4 — Đối chiếu và chạy thử song song ở local

**Mục tiêu:** chứng minh bằng bằng chứng, không bằng cảm tính, rằng app chạy trên tầng lưu trữ
mới cho ra kết quả giống hệt tầng cũ.

## Bối cảnh

Đây là phase quyết định có được phép cắt chuyển production hay không. Mọi thứ vẫn chạy trên máy
local, trên bản sao dữ liệu.

## Việc cần làm

1. **Đối chiếu dữ liệu tĩnh.** Với từng nhóm, đọc qua repository mới và so sánh sâu với khối JSON
   gốc trong `vps_app_state`. Kết quả phải là khác biệt bằng không. Khác biệt nào cũng phải được
   giải thích và sửa, không được bỏ qua với lý do "không quan trọng".

2. **Chạy app trên cả hai tầng.** Khởi động hai tiến trình local cùng trỏ vào DB local:
   - một chạy `STORAGE_MODE=kv` (tầng cũ), cổng riêng
   - một chạy `STORAGE_MODE=relational` (tầng mới), cổng riêng

   Rà từng màn hình chính và so sánh trực tiếp: Dashboard, Học viên, Lớp học, Lịch dạy, Điểm danh,
   Quản lý học phí, Hóa đơn, Giao dịch SePay, Thu chi, Đối soát, Báo cáo chuyên cần, Báo cáo học
   vụ, Nhật ký. Ghi lại màn hình nào lệch và lệch ở đâu.

3. **Thử các thao tác ghi.** Trên bản chạy tầng mới, thực hiện và kiểm tra kết quả lưu đúng:
   điểm danh một buổi, thu một khoản học phí, tạo phiếu chi, duyệt đối soát, sửa hồ sơ học viên,
   thêm lớp, đổi lịch. Sau mỗi thao tác, đọc lại bằng repository và kiểm tra dữ liệu đúng như
   mong đợi.

4. **Thử ghi đồng thời.** Hai yêu cầu ghi cùng lúc lên hai học viên khác nhau: cả hai thay đổi
   đều phải còn. Hai yêu cầu cùng lúc lên **cùng một** bản ghi: hành vi phải giống tầng cũ
   (bên đến sau bị từ chối, không âm thầm ghi đè).

5. **Đo hiệu năng cơ bản.** So thời gian tải các màn hình nặng nhất (Điểm danh, Quản lý học phí)
   giữa hai tầng. Tầng mới không được chậm hơn rõ rệt; nếu chậm hơn thì thường là thiếu index,
   xử lý trước khi đi tiếp.

## Kiểm chứng

- Bảng đối chiếu từng nhóm dữ liệu: khác biệt bằng không.
- Bảng đối chiếu từng màn hình: giống nhau, hoặc khác biệt đã được giải thích và chấp nhận có lý do.
- Tất cả thao tác ghi ở bước 3 cho kết quả đúng.
- Test ghi đồng thời xanh.
- `npm run typecheck`, `npm run lint`, toàn bộ test trong `tests/` xanh.

## Rủi ro

Rà bằng mắt dễ bỏ sót màn hình phụ hoặc trường hợp biên (lớp không có phòng, học viên miễn học
phí, buổi học cả lớp nghỉ, học viên có số dư buổi âm). Chọn sẵn vài bản ghi thuộc các trường hợp
biên này từ dữ liệu thật và rà đích danh, thay vì chỉ mở trang đầu tiên.

## Đường lùi

Không có gì để lùi: chưa đụng production. Nếu kết quả không đạt, quay lại Phase 1–3 sửa rồi đối
chiếu lại.
