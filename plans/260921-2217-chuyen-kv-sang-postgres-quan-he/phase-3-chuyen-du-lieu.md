# Phase 3 — Script chuyển đổi dữ liệu

**Mục tiêu:** đưa toàn bộ dữ liệu thật từ các khối JSON trong `vps_app_state` vào bảng quan hệ
mới, không mất bản ghi, không mất trường, không tính toán lại bất cứ giá trị nào.

## Nguyên tắc bất di bất dịch

**Script chỉ chép, không tính.** Mọi con số đang lưu (số dư buổi, công nợ, tiền đã thu, tín dụng
buổi nghỉ) được chép nguyên giá trị. Tuyệt đối không tái tính từ công thức — nếu dữ liệu thật có
sai lệch lịch sử so với công thức hiện tại, việc "sửa cho đúng" sẽ làm số liệu kế toán lệch so
với thứ nhân viên đang nhìn thấy hàng ngày, và đó là lỗi nghiêm trọng hơn.

## Việc cần làm

1. Viết `scripts/migrate-kv-to-relational.ts` (chạy bằng `tsx`, theo đúng cách các script khác
   trong `scripts/` đang chạy).
2. Thứ tự chuyển theo phụ thuộc khóa ngoại:
   `settings` (trung tâm, chi nhánh, phòng, ca học, loại lớp, gói) → `people` (giáo viên, kế toán,
   trợ giảng) → `students` → `classes` (kèm lịch học, ghi danh, phí học liệu) → `sessions`
   (kèm điểm danh) → `finance` (thu chi, đối soát, lương, dự thu chi, sổ SePay) → `audit`.
3. Chạy trong **một transaction cho mỗi nhóm**, có thể chạy lại nhiều lần (idempotent): chạy lần
   hai trên cùng dữ liệu phải cho kết quả y hệt lần một, không nhân đôi bản ghi.
4. In ra bảng tổng kết sau mỗi nhóm: số bản ghi đọc được, số dòng đã ghi, số dòng bỏ qua kèm lý do.
   Không được im lặng bỏ qua bản ghi nào.

## Số liệu đối chiếu (chốt tại thời điểm lập plan)

| Nhóm | Số bản ghi phải ra đúng |
|---|---|
| Học viên | 936 |
| Lớp học | 63 |
| Buổi học | 289 |
| Giáo viên | 13 |
| Phiếu thu chi | 392 |
| Dòng đối soát | 392 (+ 9 dòng tổng hợp theo ngày) |
| Khoản phải thu (SePay) | 479 |
| Lệnh thu (SePay) | 480 |
| Thanh toán (SePay) | 394 |
| Biên lai (SePay) | 392 |
| Nhật ký | 1000 |
| Giao dịch ngân hàng, hóa đơn điện tử, tín dụng, webhook log | 0 (chưa phát sinh) |

Số điểm danh chưa đếm được vì đang lồng trong từng buổi học — script phải tự đếm và báo cáo.

## Ngoài phạm vi

- 8 khối `backup:*` và 6 cờ `kv:migration:*`: giữ nguyên tại chỗ trong `vps_app_state`, không
  chuyển. Chúng vẫn nằm trong file zip backup nếu sau này cần tra.
- 3 khối `do:document:syllabus-*` và `do:catalog:*`: đây là tài liệu syllabus do Durable Object
  quản lý, có cấu trúc riêng. Nếu khảo sát ở Phase 1 cho thấy đây là tài liệu dạng văn bản chứ
  không phải tập thực thể, giữ nguyên dạng hiện tại là hợp lý — quyết định và ghi rõ lý do ở
  Phase 1, không tự ý bỏ qua.

## File sẽ chạm

- `scripts/migrate-kv-to-relational.ts` (tạo mới)
- Không sửa `worker.ts`, không sửa repository của Phase 2

## Kiểm chứng

- Mọi số đếm khớp tuyệt đối với bảng trên.
- Với mỗi nhóm, đọc lại qua repository của Phase 2 và so sánh JSON dựng lại với JSON gốc trong
  `vps_app_state`: phải **giống hệt** (so sánh sâu, không so bằng mắt).
- Tổng thu, tổng chi, công nợ từng học viên khớp tuyệt đối giữa hai bên.

## Rủi ro

Bản ghi tham chiếu tới thứ không tồn tại (lớp trỏ tới `roomId` rỗng, `syllabusId` rỗng, học viên
trong `studentIds` nhưng không có trong danh sách học viên). Dữ liệu thật **đã có** các trường
rỗng như vậy. Script phải chấp nhận và giữ nguyên trạng thái đó, không được tự ý bỏ dòng cũng
không được tự ý tạo bản ghi giả để "cho đủ khóa ngoại". Schema ở Phase 1 phải cho phép các quan hệ
này rỗng.

## Đường lùi

Xóa dữ liệu trong các bảng mới rồi chạy lại script. Dữ liệu nguồn trong `vps_app_state` không bị
script chạm tới ở phase này, nên nguồn luôn nguyên vẹn.
