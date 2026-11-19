# API chỉ đọc cho trợ lý AI — `/api/v1/readonly/`

Cho trợ lý AI bên ngoài tra cứu dữ liệu LMS. **Chỉ GET, không có đường nào ghi dữ liệu.**

## Bảo mật

- Header bắt buộc: `Authorization: Bearer <token>`; token = biến môi trường `LMS_READONLY_API_TOKEN`
  trong `/opt/vsteps/.env` trên VPS (không có trong code). Trống/thiếu → mọi request 401 (API tắt).
  Token phải ≥ 16 ký tự; tạo bằng `openssl rand -hex 32`.
- Method khác GET → 405. Kho dữ liệu được bọc chỉ còn `get`, nên không ghi được kể cả do lỗi code.
- Không trả: mật khẩu/email đăng nhập học viên, CCCD, tài khoản kế toán/trợ giảng, cấu hình tích hợp, bảng lương.
- Không đặt cookie, không gia hạn phiên, `Cache-Control: no-store`. Token không được log.
- Đổi token: sửa `.env` rồi khởi động lại container. Thu hồi: để trống.

## Endpoint

| Đường dẫn | Nội dung |
|---|---|
| `/api/v1/readonly` | Danh sách endpoint |
| `/summary` | Số học viên/lớp/GV, lịch hôm nay, tổng công nợ, thu chi hôm nay |
| `/students?q=&status=&class=&limit=&offset=` | Danh sách học viên (q: tên, mã, tên PH, SĐT) |
| `/students/{mãHV}` | Hồ sơ, lớp, học phí từng lớp (khóa, nợ, tồn, phiếu), biên lai, chuyên cần |
| `/classes?q=&status=` | Danh sách lớp |
| `/classes/{mãLớp}` | Chi tiết lớp, học viên kèm công nợ/tồn, 10 buổi sắp tới |
| `/teachers` | Giáo viên và lớp phụ trách |
| `/sessions?from=&to=&class=&teacher=&attendance=1` | Buổi học, điểm danh (mặc định 7 ngày, tối đa 93) |
| `/periodic-reports?class=&student=` | Báo cáo định kỳ |
| `/finance/debts?class=&min=` | Công nợ theo học viên-lớp, xếp giảm dần |
| `/finance/receipts?from=&to=&student=&class=` | Biên lai học phí (mặc định 31 ngày) |
| `/finance/cashbook?from=&to=&kind=IN\|OUT&q=` | Sổ thu chi + tổng tiền mặt/chuyển khoản |
| `/finance/bank-transactions?from=&to=&status=` | Giao dịch sao kê/SePay và học viên được ghi |
| `/finance/recon?from=&to=` | Ngày đã đối soát/khóa |

Ngày dạng `YYYY-MM-DD`, giờ trả về theo giờ Việt Nam. Danh sách có `limit` (≤ 500) và `offset`.

## Số công nợ

Tính bằng chính hàm `tuitionEffectiveDebt` của app (chạy trong worker thread, không chặn server),
nên khớp số trên màn hình Quản lý học phí. Toàn trung tâm (`/summary`, `/finance/debts`) giữ đệm
60 giây — lần đầu ~10 giây. Trường `debtSource` cho biết nguồn số.

## Ví dụ

```
curl -H "Authorization: Bearer $LMS_READONLY_API_TOKEN" https://<domain>/api/v1/readonly/students/HV0333
```

Code: `cloudflare/readonly-api.ts`; test: `tests/readonly-api.test.ts`.
