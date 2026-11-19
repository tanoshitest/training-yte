# Phase 8 — Nghiệm thu đầu-cuối, cổng test trên CI, go-live

**Phụ thuộc:** Phase 0 và Phase 1-7
**Ước lượng:** 6h
**Sở hữu file:** `package.json`, `deploy/deploy.sh`, `.github/workflows/deploy.yml`,
`cloudflare/vps-server.ts`, `docs/DEPLOY.md`, `docs/nangcapsepay.md`, `.env.example`

## Bối cảnh

Repo có 31 bộ test trong `tests/`, nhưng `package.json:5-37` **không có script `test` gộp** — chỉ có
`test:e2e`, `test:portal`, `test:activities`, `test:storage`. `deploy/deploy.sh` backup, build,
`prisma migrate deploy` rồi cắt container (`deploy/deploy.sh:42, 52-53, 71, 92`) mà **không chạy bộ
test nào**. Sau bảy phase đụng vào đường tiền, đó là rủi ro không chấp nhận được (R17).

Đồng thời còn hai câu hỏi vận hành chưa trả lời, đều chặn go-live: tên miền khai với SePay/Zalo
(Q8) và máy nào đang phục vụ trung tâm (Q9).

## Các bước

### Bước 1 — Script test gộp

Thêm vào `package.json`:

```json
"test": "prisma generate && tsx --test tests/*.test.ts"
```

Chạy thử cục bộ, sửa các bộ test đang đỏ. `test:storage` cần database nên giữ riêng; script `test`
chỉ gồm các bộ chạy được không cần Postgres.

Nếu có bộ test nào đã đỏ từ trước phase này, **không sửa lén trong phase này** — liệt kê ra, quyết
định riêng: sửa hay tạm loại khỏi script gộp kèm ghi chú lý do.

### Bước 2 — Cổng test trên đường deploy

Trong `deploy/deploy.sh`, chèn `npm test` **trước** `docker compose build app` (hiện ở
`deploy/deploy.sh:60` theo ghi chú của bản plan trước — xác minh lại số dòng khi thực thi). Test đỏ
thì `exit 1` ngay: không build, không migrate, container cũ tiếp tục chạy.

Đặt sau bước backup để bản dump vẫn được tạo — backup không bao giờ là thứ bị bỏ qua.

### Bước 3 — Gỡ bí mật khỏi biến môi trường

Sau khi xác nhận cấu hình UI hoạt động trên production:

- Gỡ `SEPAY_WEBHOOK_SECRET` khỏi `vps-server.ts:185` và khỏi kiểu `DemoEnv` (`worker.ts:77`).
- Gỡ khỏi `/opt/vsteps/.env` và khỏi `.env.example:30`.
- `SEPAY_API_TOKEN` (`.env.example:29`) không nơi nào dùng — gỡ luôn, trừ khi Q13 cho thấy cần giữ.

Chỉ làm bước này **sau** khi đã chứng minh đường cấu hình UI chạy đúng trên production, không phải
trước.

### Bước 4 — Kịch bản nghiệm thu đầu-cuối

Chạy tay trên môi trường staging hoặc production ngoài giờ, theo đúng thứ tự, với một học viên thật
đã xin phép:

| # | Thao tác | Kết quả phải thấy |
|---|---|---|
| 1 | ADMIN cấu hình SePay + MISA + Zalo trên UI | Lưu được, tải lại trang thấy `••••` + 4 ký tự cuối |
| 2 | ACCOUNTANT mở màn hình cấu hình tích hợp | Không thấy thẻ; gọi thẳng API trả 403 |
| 3 | Học vụ bấm "Gửi yêu cầu thanh toán" | Khoản phải thu chốt cứng, có mã `HP******`, có link công khai; một dòng log Zalo `QUEUED` rồi `SENT` |
| 4 | Mở link trong trình duyệt ẩn danh | Trang thanh toán hiện đúng số tiền, QR giải mã ra đúng `paymentCode` |
| 5 | Chuyển khoản thật số tiền nhỏ theo QR | Webhook về, giao dịch `ALLOCATED` |
| 6 | Kiểm tra ngay sau webhook | `sessionBalances` của học viên tăng đúng; biên lai có đủ `classId`, `billingPeriod`, `billingMode`, `materialsAmount` |
| 7 | Chờ hàng chờ hóa đơn | Hóa đơn `ISSUED`, có `providerInvoiceId`, `lookupCode`, `pdfUrl`; đối chiếu trên portal MISA |
| 8 | Chờ hàng chờ Zalo | Tin thứ hai tới, link tải hóa đơn mở được |
| 9 | Bắn lại cùng `providerTransactionId` 3 lần | Không thêm biên lai, không thêm hóa đơn, không thêm tin |
| 10 | Đăng nhập vai STUDENT, gọi `simulate` | 403 |
| 11 | `curl` webhook không chữ ký | 401 |
| 12 | Tắt cả ba công tắc tích hợp, bắn webhook | Biên lai và số buổi vẫn đúng; hóa đơn `PENDING`; không có tin nào |

Ghi kết quả vào `plans/reports/`, không viết đè lên plan.

### Bước 5 — Cửa chặn go-live

Không bật webhook trên cổng SePay cho tới khi cả ba điều sau đúng:

1. **Q9 đã trả lời:** xác nhận `163.61.72.30` là máy đang phục vụ trung tâm.
   `docs/dong-bo-database.md` còn ghi máy cũ `149.28.131.241` là máy đang phục vụ. Webhook chỉ trỏ
   được về một URL, và **không có đường lùi kỹ thuật cho tiền đã đối soát trên máy sai**.
2. **Q8 đã trả lời:** chốt một tên miền duy nhất cho cả SePay và Zalo callback.
3. Bước 4 đã chạy hết 12 mục, không mục nào đỏ.

### Bước 6 — Cập nhật tài liệu

- `docs/DEPLOY.md`: cổng test mới trong `deploy.sh`; bảng biến môi trường bỏ hai biến SePay; ghi rõ
  cấu hình tích hợp nay nằm trong database và **bị `AUTH_SECRET` chi phối** — đổi `AUTH_SECRET` là
  mất toàn bộ bí mật đã lưu.
- `docs/nangcapsepay.md`: đổi từ tài liệu scout thành tài liệu vận hành của tính năng, hoặc ghi rõ
  ở đầu file rằng nó là ảnh chụp ngày 2026-09-22 và nguồn sự thật hiện tại là mã nguồn. Sửa hai chỗ
  đã bị plan này đính chính: mục 3 nói khoản phải thu không có `classId` (sai, `sepay-engine.ts:46-47`)
  và phần bỏ sót việc hai lược đồ mã thanh toán không giao nhau.
- `.env.example`: bỏ hai biến SePay.

### Bước 7 — Theo dõi tuần đầu

Mỗi ngày trong 7 ngày đầu, kiểm tra: số giao dịch `UNMATCHED`/`NEEDS_REVIEW` (phải gần 0 — nếu cao,
Phase 4 chưa đạt mục tiêu), số hóa đơn `FAILED`, số tin Zalo `FAILED`, và số lần webhook trả 409.

## Cách kiểm chứng

| # | Kiểm chứng | Cách làm |
|---|---|---|
| 1 | Test đỏ chặn deploy | Cố ý làm một test đỏ, push lên `main`, khẳng định CI dừng và container cũ vẫn phục vụ |
| 2 | Backup vẫn chạy trước khi test chạy | Đọc log deploy, xác nhận thứ tự dump → test → build |
| 3 | Gỡ biến môi trường không làm gãy webhook | Sau Bước 3, bắn webhook ký bằng bí mật trong cấu hình UI → 200 |
| 4 | Toàn bộ 12 mục của Bước 4 xanh | Biên bản trong `plans/reports/` |

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Bật webhook trên máy sai (Q9) | Bước 5 mục 1 là cửa chặn cứng. Không có đường lùi kỹ thuật |
| Thêm `npm test` làm deploy chậm hoặc hay đỏ vặt | Đo thời gian trước khi chốt; bộ test nào chậm bất thường thì tách khỏi script gộp và chạy riêng theo lịch |
| Gỡ biến môi trường trước khi cấu hình UI chạy đúng → webhook 401 toàn bộ | Bước 3 chỉ chạy sau khi Bước 4 mục 5 đã xanh trên production |
| Đổi `AUTH_SECRET` sau go-live làm mất mọi bí mật đã lưu | Ghi cảnh báo vào `docs/DEPLOY.md` (Bước 6); cân nhắc thêm một câu kiểm tra khi khởi động cảnh báo khi giải mã cấu hình thất bại |

**Đường lùi:** `deploy.sh` tự quay về `vsteps-lms:previous` khi health-check fail
(`deploy/deploy.sh:92`). Ba công tắc tích hợp tắt được trên UI mà không cần deploy. Trường hợp xấu
nhất — dữ liệu hỏng — phục hồi từ bản dump theo `docs/DEPLOY.md`, nhớ rằng bản dump chỉ tính là
backup khi đã thử phục hồi thành công ít nhất một lần.
