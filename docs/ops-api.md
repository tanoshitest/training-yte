# Nhập sao kê: hàng đợi Giao dịch lệch + API cho trợ lý (Muse)

## Luồng trên web (Quản lý học phí → Cập nhật học phí)

1. Chọn file sao kê BIDV → popup báo: **Khớp mã: N (tổng tiền)** · **Lệch → Giao dịch lệch: M (tổng tiền)**.
2. Bấm **Xác nhận (ghi N khớp · M lệch)**:
   - dòng khớp mã + đúng số tiền → ghi học phí (biên lai, buổi học, sổ thu chi: ngày vào sổ = ngày nhập, ngày chứng từ = ngày trên sao kê);
   - dòng **tiền vào** không khớp (thiếu mã, sai mã, sai số tiền, trả trùng, mã của học viên khác…) → mục **Giao dịch lệch**;
   - dòng tiền ra, dòng tiêu đề, dòng đã nhập trước → bỏ qua. Tải lại cùng file không ghi trùng.
3. Mục **Giao dịch lệch** (Kế toán → Giao dịch lệch), mỗi dòng có lý do ("Không CK theo mã QR", sai số tiền,
   phiếu đã thu đủ — CK trùng…), một ô **mã HV** và 2 nút:
   - ô mã HV điền sẵn khi nội dung CK nêu đúng 1 học viên; không thì có dòng "Gợi ý theo tên" (không điền sẵn);
   - **Thu thủ công**: mở popup thu học phí của học viên đó, số tiền = số tiền giao dịch (phải đúng số này);
     thu và gỡ khỏi hàng đợi trong cùng một lượt ghi, sổ thu chi ghi ngày chứng từ = ngày chuyển khoản;
   - **Bỏ qua**: không phải học phí (ghi lý do).
   Thu tuân theo khóa đối soát; mọi xử lý ghi Nhật ký.

## API cho trợ lý — chỉ nhập sao kê, 2 bước

- Token riêng: `Authorization: Bearer <LMS_OPS_API_TOKEN>` (biến trong `/opt/vsteps/.env`, khác token chỉ đọc). Trống = tắt.
- `POST /api/v1/ops/bank-statement/preview` — trợ lý đọc sao kê rồi gửi các dòng **tiền vào**:
  `{ "fileName": "sao-ke-26-10", "rows": [ { "date": "26/10/2026 07:20", "amount": 1560000, "content": "<nội dung CK nguyên văn>" } ] }`
  (ngày dd/mm/yyyy hh:mm[:ss] hoặc yyyy-mm-dd hh:mm; số tiền âm = tiền ra, bị bỏ qua; nội dung giữ nguyên văn để khớp mã).
  Hoặc gửi cả file: `{ "fileName": "...", "fileBase64": "<file .xls/.xlsx base64>" }`.
  → KHÔNG ghi. Trả `summary`, `matched[]`, `unmatched[]`, `message` (câu tóm tắt để báo anh Vũ), `previewId` (hạn 15 phút).
- Trợ lý **hỏi anh Vũ**; anh đồng ý mới gọi
  `POST /api/v1/ops/bank-statement/commit` `{ "previewId": "..." }` → ghi giống hệt nút Xác nhận trên web.
- Chống trùng: cùng một dòng sao kê dù gửi qua trợ lý (ngày thiếu giây) hay tải file lên web chỉ ghi 1 lần
  (khớp theo vân tay dòng, và theo phút giao dịch + số tiền + nội dung).
- Chốt an toàn: previewId dùng một lần; dữ liệu học phí đổi sau lúc xem trước → 409 `STALE_PREVIEW` (xem trước lại);
  ngày đã đối soát → 409 (nhập trước khi bấm Đối soát xong). Nhật ký ghi "Muse (trợ lý AI)".

## API cho trợ lý — xử lý Giao dịch lệch theo lệnh anh Vũ, 2 bước

Anh Vũ nói "khoản 1.560.000 ngày 26/10 là của HV0333 lớp S25" (hoặc "khoản 50k là tiền nước, bỏ qua"):

- `GET /api/v1/ops/review-queue` → `items[]`: `transactionId`, `date` (giờ VN), `amount`, `content`, `reason`,
  `namedStudents` (học viên được nêu trong nội dung CK, nếu có). Trợ lý tìm đúng dòng theo ngày + số tiền + nội dung.
- `POST /api/v1/ops/review/preview`
  - thu: `{ "transactionId": "...", "action": "collect", "studentCode": "HV0333", "classCode": "S25" }`
    (classCode bỏ trống được nếu HV chỉ học 1 lớp; lớp khóa có thể thêm `courseIndex`);
  - bỏ qua: `{ "transactionId": "...", "action": "ignore", "note": "tiền nước" }`.
  → KHÔNG ghi. Trả `message` (vd "Thu 1.560.000đ (CK ngày 26/10/2026 07:20) cho … lớp S25: Thu học phí Khóa 2 …
  Sau khi thu: hết nợ lớp này"), `preview`, `previewId` (15 phút).
  Lỗi rõ: `STUDENT_NOT_FOUND`, `STUDENT_CODE_DUPLICATE`, `CLASS_MISMATCH` (kèm lớp thật của HV), `CLASS_REQUIRED`,
  `NOT_IN_QUEUE`, `COLLECT_FAILED` (vd ngày đã đối soát).
- Trợ lý **hỏi anh Vũ**; anh đồng ý mới gọi `POST /api/v1/ops/review/commit { "previewId": "..." }`.
  Thu = đúng hàm "Thu thủ công" trên web: số tiền = số tiền giao dịch, phương thức Chuyển khoản, biên lai + buổi học +
  sổ thu chi (ngày chứng từ = ngày CK), giao dịch gỡ khỏi hàng đợi; Nhật ký ghi "Muse (trợ lý AI)".
- Chốt an toàn như nhập sao kê: previewId dùng một lần, dữ liệu học phí đổi → 409 `STALE_PREVIEW`.
- Trợ lý không có quyền sửa / xóa phiếu thu, công nợ hay dữ liệu nào khác.

Code: `cloudflare/bank-statement.ts` (queueUnmatched), `cloudflare/ops-api.ts`, `importBankStatement`, `opsReviewQueue`,
`opsReviewAction`, `collectTuitionAction` (reviewTransactionId, dryRun) trong `cloudflare/worker.ts`.
Test: `tests/statement-queue.test.ts`.
