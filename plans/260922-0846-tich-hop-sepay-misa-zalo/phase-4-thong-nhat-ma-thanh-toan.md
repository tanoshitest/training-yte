# Phase 4 — Thống nhất mã thanh toán, hành động "Gửi yêu cầu thanh toán", trang thanh toán công khai

**Phụ thuộc:** Phase 1. Cần D1, D2, D3 và Q3 đã chốt.
**Ước lượng:** 8h
**Sở hữu file:** `cloudflare/sepay-engine.ts`, `cloudflare/tuition-billing.ts`,
`cloudflare/payment-link.ts` (mới), `cloudflare/worker.ts`, `cloudflare/public/app.js`,
`tests/sepay-matching.test.ts`, `tests/tuition-billing.test.ts`, `tests/vps-worker.test.ts`

## Bối cảnh

**Đây là phase quan trọng nhất của plan.** Không có nó, toàn bộ tự động hoá ở Phase 5-7 gắn vào một
chuỗi mà mắt xích đối soát đầu tiên không bao giờ chạy.

### Vấn đề 1 — hai lược đồ mã thanh toán không giao nhau (Đ1 của plan index)

| Nơi sinh mã | Công thức | Ví dụ |
|---|---|---|
| Phiếu báo học phí (`app.js:2442-2443`) | `HP` + `student.code` + `YYYYMM`, hoặc `HP` + code + `KHOA<n>` | `HPHV001202609` |
| Đơn thanh toán (`sepay-engine.ts:215-223`) | `HP` + 6 ký tự từ `CODE_ALPHABET` | `HP8F4K92` |

Webhook trích mã bằng `extractPaymentCode()` regex `/\bHP[A-Z0-9]{6,10}\b/`
(`sepay-engine.ts:226`) rồi tra `paymentOrders.find(item => item.paymentCode === code &&
item.status === "ACTIVE")` (`sepay-engine.ts:337`).

Đã chạy chính regex đó trên các chuỗi thật:

```
HPHV001202609      -> NO MATCH   (phần sau HP dài 11 ký tự, vượt {6,10}, không có ranh giới từ)
HPHV001KHOA24      -> NO MATCH
HPS28KHOA24        -> HPS28KHOA24  (khớp regex, nhưng không tồn tại trong paymentOrders)
HP8F4K92           -> HP8F4K92     (mã duy nhất webhook đối soát được)
```

Kết quả: mọi giao dịch thật đều rơi vào `UNMATCHED` (`sepay-engine.ts:333-347`).

### Vấn đề 2 — số tiền khoản phải thu lệch số tiền đường thu tay tính (Đ2)

- `syncTuitionReceivables()` đặt `amountDue = classTuitionCharge(cls, sessions)` — chỉ tháng hiện
  tại, không trừ `tuitionCredits` (`tuition-billing.ts:318, 328-339`).
- `collectManualTuition()` dùng `tuitionCollectionCharge()` — gộp mọi tháng chưa đóng
  (`tuition-billing.ts:260-265`) và trừ tín dụng buổi giáo viên cho nghỉ (`:268-278`).

Nếu Phase 5 cho webhook chạy `collectManualTuition` sau khi khớp `amountDue`, hệ thống ghi nhận số
tháng khác với số tiền phụ huynh đã trả.

### Vấn đề 3 — khoản phải thu được tạo tự động, không ai bấm

`syncTuitionReceivables()` chạy trong `syncedFinance()` (`worker.ts:904`) ở **mỗi lượt đọc tài
chính**, tạo khoản phải thu cho mọi học viên × mọi lớp có `billingEnabled`
(`tuition-billing.ts:315-322`). Nối việc gửi tin Zalo vào đó là đầu mỗi tháng nhắn tin cho toàn bộ
phụ huynh. Cần một hành động tường minh.

### Vấn đề 4 — endpoint QR đều yêu cầu đăng nhập (Đ4)

`/api/finance/qr-image` (`worker.ts:1795`) nằm sau cổng phiên ở `worker.ts:1248-1249`;
`/api/finance/tuition-qr` (`worker.ts:1804-1805`) còn yêu cầu `canManageFinance`. Phụ huynh nhận
link qua Zalo sẽ nhận 401.

## File cần đọc trước

- `cloudflare/sepay-engine.ts:215-235` (sinh mã, trích mã, URL VietQR), `:264-304` (`createReceivable`),
  `:323-442` (`processBankTransaction`), `:544-552` (`refreshOrderQr`)
- `cloudflare/tuition-billing.ts:152-184` (`classTuitionCharge`), `:212-292`
  (`tuitionCollectionCharge`), `:294-362` (`syncTuitionReceivables`), `:1032-1153`
  (`collectManualTuition`)
- `cloudflare/public/app.js:2428-2500` (`tuitionNoticeDetails`, `tuitionNoticeQrUrl`),
  `:2794-2840` (phiếu báo in ra)
- `cloudflare/worker.ts:1795-1860` (hai endpoint QR + `/api/finance/tuition-notice`),
  `:1244-1249` (ranh giới trước/sau cổng phiên), `:1899-1928` (route `/api/finance/sepay`)
- `cloudflare/vietqr.ts` (`vietQrSvg`)

## Các bước

### Bước 1 — Phiếu báo học phí dùng mã của đơn thanh toán (D1)

Trong `app.js`, `tuitionNoticeDetails()` (`app.js:2428`) hiện tự sinh `paymentContent`
(`app.js:2442-2443`). Thay bằng: tra khoản phải thu tương ứng trong `sepayBook()` theo
`studentId` + `billKey`, rồi lấy `paymentOrder.paymentCode`.

- `billKey` cho lớp tháng là `month|<classId>|<YYYY-MM>`, cho lớp khóa là `course|<classId>`
  (`tuition-billing.ts:169, 182`).
- Không tìm thấy khoản phải thu → **không dựng phiếu báo**, hiện thông báo "Chưa có khoản phải thu
  cho kỳ này, bấm Gửi yêu cầu thanh toán trước". Không được quay về sinh mã tự chế: đó chính là lỗi
  đang sửa.
- `tuitionNoticeQrUrl()` (`app.js:2484`) giữ nguyên đường gọi `/api/finance/tuition-qr`, chỉ đổi
  `addInfo` thành `paymentCode` mới. Nhánh dự phòng trả `settings.qrImageDataUrl` hoặc
  `/QRcodebank.jpg` (`app.js:2496-2500`) **phải bỏ** cho đường tự động — ảnh tĩnh không mang mã
  (R10). Giữ lại nhánh đó thì phiếu in ra sẽ có QR không đối soát được.

**Q3 chặn bước này:** nếu trung tâm đang thật sự dùng ảnh QR tĩnh, phải xác nhận việc ngừng dùng
trước khi sửa.

### Bước 2 — Nới `extractPaymentCode` là đường sai, KHÔNG làm

Ghi lại rõ để người thực thi không đi đường tắt: nới regex `{6,10}` thành `{6,20}` không sửa được
gì, vì mã trích ra vẫn không tồn tại trong `paymentOrders` (`sepay-engine.ts:337`). Giữ nguyên
regex; chỉ đổi nguồn sinh mã ở Bước 1.

### Bước 3 — Hành động "Gửi yêu cầu thanh toán" chốt cứng khoản phải thu (D2)

Thêm `action: "request-payment"` vào `applySepayAction()` (`worker.ts:985-1074`), chỉ
`canManageFinance`:

1. Nhận `studentId` + `classId`.
2. Tính `charge = tuitionCollectionCharge(student, cls, sessions, ledger)` — **đúng hàm mà đường
   thu tay dùng** (`tuition-billing.ts:1053`), nên hai con đường không bao giờ lệch nữa.
3. Tìm khoản phải thu theo `billKey === charge.billKey`; không có thì `createReceivable` rồi gán
   `classId`/`billKey`, y như `collectManualTuition` làm ở `tuition-billing.ts:1059-1076` — tách
   đoạn này thành một hàm dùng chung `ensureReceivableForCharge()` trong `tuition-billing.ts` và cho
   cả hai chỗ gọi (DRY).
4. Đặt `amountDue = balanceDue = charge.amount`, `billingPeriod = charge.period`, gọi
   `refreshOrderQr(order, settings, charge.amount)` để QR mang đúng số tiền
   (`sepay-engine.ts:544-552`).
5. Đặt thêm ba field mới trên `SepayReceivable`: `frozenAt` (ISO), `publicToken` (chuỗi ngẫu nhiên
   32 ký tự), `requestedBy` (email người bấm). Thêm vào `interface SepayReceivable`
   (`sepay-engine.ts:32-48`) dưới dạng optional, và map hai chiều trong
   `cloudflare/storage/finance-repository.ts` (`ReceivableRow` ở `:61`, chiều đọc `:198-212`, chiều
   ghi trong khối `receivables`). **Kèm cột mới trong `prisma/schema.prisma` cho
   `OpsSepayReceivable`** — nếu Phase 2 đã chạy thì gộp vào migration của Phase 2; nếu Phase 4 chạy
   song song thì tự tạo migration riêng, vẫn `ADD COLUMN` nullable.
6. Ghi audit qua `writeAudit` (`worker.ts:660-702`) để có vết ai gửi cho ai lúc nào.
7. Không gửi tin gì ở phase này — chỗ cắm cho Zalo là Phase 7.

Khi đã `frozenAt`, `syncTuitionReceivables()` **không được ghi đè** `amountDue`/`billingPeriod` nữa.
Thêm điều kiện ở `tuition-billing.ts:347-352`: bỏ qua nhánh cập nhật khi `existing.frozenAt` có giá
trị và `existing.status === "OPEN"`. Đây là thay đổi hành vi duy nhất trong `tuition-billing.ts`;
không đụng công thức tính tiền (ràng buộc 2 của plan index).

### Bước 4 — Trang thanh toán công khai (Đ4, R9)

Tạo `cloudflare/payment-link.ts`:

- `paymentLinkPath(receivable)` → `/thanh-toan/<receivableId>/<publicToken>`
- `findReceivableByToken(ledger, receivableId, token)` — so sánh hằng thời gian, trả `undefined` khi
  không khớp.

Trong `worker.ts`, đặt route **trước** `readSession` (`worker.ts:1248`), cùng chỗ với
`/api/webhooks/sepay` (`worker.ts:1244-1246`):

```
GET /api/public/payment/:receivableId/:token   -> JSON: số tiền, kỳ thu, mã thanh toán, tên học viên, trạng thái
GET /api/public/payment-qr/:receivableId/:token -> SVG QR động, sinh bằng vietQrSvg(...)
```

Quy tắc bắt buộc:

- QR **luôn** sinh động theo `paymentCode` + `amountDue` hiện tại, không bao giờ trả
  `qrImageDataUrl` (R10).
- Chỉ trả tên học viên và số tiền; **không** trả số điện thoại, email, địa chỉ, danh sách lớp.
- Token không đoán được, và mất hiệu lực khi khoản phải thu chuyển `PAID`/`CANCELLED` (vẫn trả 200
  với trạng thái "đã thanh toán", để phụ huynh mở lại link cũ không thấy lỗi).
- Đặt `Cache-Control: private, no-store` như các endpoint tài chính khác (`worker.ts:1817`).
- Giới hạn tần suất theo IP để không thành kênh dò `receivableId`. Repo chưa có helper rate-limit;
  viết một bộ đếm trong bộ nhớ tiến trình là đủ cho mức này — **lưu ý lifetime: `vps-server.ts` chạy
  một tiến trình duy nhất nên biến module cấp tiến trình dùng được, nhưng nó reset mỗi lần deploy và
  không chia sẻ giữa nhiều instance.** Chấp nhận, ghi chú trong mã.

Trang HTML cho phụ huynh: thêm một nhánh trong `cloudflare/public/app.js` nhận `location.pathname`
bắt đầu bằng `/thanh-toan/`, render một trang tối giản, **không gọi `/api/session`**, không hiện
sidebar. Kiểm tra `index.html` và đường phục vụ tài sản tĩnh trong `vps-server.ts` để chắc chắn
đường dẫn này trả về `index.html` chứ không 404.

### Bước 5 — Nút "Gửi yêu cầu thanh toán" trên UI

Thêm nút cạnh nút lập phiếu báo học phí hiện có trong `app.js`. Nút gọi
`POST /api/finance/sepay { action: "request-payment", studentId, classId }` theo đúng mẫu
`app.js:5414`. Sau khi thành công, hiển thị mã thanh toán và link công khai để nhân viên copy gửi
tay trong lúc chờ Phase 7.

Nút không được xuất hiện hàng loạt: đặt trong màn hình chi tiết học viên × lớp, một lần một khoản.

### Bước 6 — Cửa sổ chuyển tiếp cho phiếu báo đã gửi (R4)

Phiếu báo in trước phase này mang mã cũ. Giữ nguyên `action: "match"` (`worker.ts:1064-1071`) để kế
toán khớp tay. Không viết lại mã của các đơn cũ — làm vậy sẽ khiến phụ huynh đã chuyển khoản theo mã
cũ không khớp được nữa.

Thông báo cho học vụ: từ ngày triển khai, mọi phiếu báo phải in lại từ hệ thống.

## Cách kiểm chứng

| # | Kiểm chứng | Cách làm |
|---|---|---|
| 1 | **Chuỗi in trên phiếu báo đối soát được** | `tests/vps-worker.test.ts`: gọi `request-payment`, đọc `paymentCode` trả về, bắn webhook với `content` chứa đúng chuỗi đó → giao dịch `ALLOCATED`, không `UNMATCHED` |
| 2 | Mã sinh ra luôn qua được `extractPaymentCode` | `tests/sepay-matching.test.ts`: sinh 1000 mã bằng `generatePaymentCode`, khẳng định `extractPaymentCode("... " + code + " ...") === code` |
| 3 | Số tiền trên QR bằng số tiền đường thu tay tính | `tests/tuition-billing.test.ts`: cùng học viên/lớp, so `request-payment` → `amountDue` với `tuitionCollectionCharge(...).amount` |
| 4 | Khoản phải thu đã chốt không bị `syncTuitionReceivables` ghi đè | Chốt một khoản, chạy `syncTuitionReceivables` hai lần, khẳng định `amountDue` và `billingPeriod` không đổi |
| 5 | Link công khai mở được khi chưa đăng nhập | `tests/vps-worker.test.ts`: gọi không cookie → 200 |
| 6 | Token sai bị từ chối | Đổi một ký tự trong token → 404, và không tiết lộ khoản phải thu có tồn tại hay không |
| 7 | QR công khai mang đúng mã | Giải mã nội dung SVG trả về, khẳng định chứa `paymentCode` |
| 8 | Endpoint công khai không lộ dữ liệu cá nhân | Khẳng định body không chứa `parentPhone1`, `loginEmail`, `address` |
| 9 | Round-trip ba field mới của khoản phải thu | `npm run test:storage` |
| 10 | Không vỡ kiểu | `npm run typecheck` |

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Đổi mã thanh toán làm hỏng phiếu báo đang lưu hành (R4) | Bước 6: giữ đường khớp tay; không viết lại mã đơn cũ |
| Endpoint công khai thành kênh dò dữ liệu học viên | Bước 4: chỉ trả tên + số tiền, token 32 ký tự, so sánh hằng thời gian, giới hạn tần suất |
| Chốt cứng khoản phải thu làm nó lệch thực tế khi lớp đổi lịch/đơn giá sau đó | `frozenAt` chỉ khoá khi `status === "OPEN"`; thêm nút "Huỷ yêu cầu" đưa khoản về trạng thái tự đồng bộ. Nếu không muốn nút này trong phạm vi, xoá `frozenAt` bằng `action: "reset"` đã có (`worker.ts:1005-1013`) |
| Bỏ nhánh QR tĩnh làm trung tâm mất ảnh QR quen dùng (Q3) | Chỉ bỏ ở đường tự động; thẻ cấu hình ảnh QR (`app.js:3330`) giữ nguyên cho việc in tay, kèm dòng cảnh báo ảnh tĩnh không đối soát tự động được |
| Sửa `tuition-billing.ts` chạm vào nghiệp vụ học phí | Chỉ thêm một điều kiện bỏ qua ở nhánh cập nhật (`:347-352`) và tách một hàm dùng chung; `tests/tuition-billing.test.ts` hiện có phải xanh y nguyên |

**Đường lùi:** revert mã. Ba field mới trên khoản phải thu là nullable, đơn nào không có `frozenAt`
thì hành vi y như trước. Không có bước nào xoá hay viết lại dữ liệu cũ.
