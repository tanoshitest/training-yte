# Phase 7 — Gửi ZBS Template Message qua Zalo OA

**Phụ thuộc:** Phase 2, 3, 4, 6. Cần Q6, Q7 và D3 đã chốt, và Phase 0 (OA + ZBS + 2 mẫu tin duyệt).
**Ước lượng:** 10h
**Sở hữu file:** `cloudflare/zalo-zbs-client.ts` (mới), `cloudflare/zalo-outbox.ts` (mới),
`cloudflare/phone-format.ts` (mới), `cloudflare/worker.ts`, `cloudflare/public/app.js`,
`tests/zalo-zbs.test.ts` (mới), `tests/phone-format.test.ts` (mới)

**Trạng thái 2026-09-28:** Bước 1a (endpoint gửi qua SĐT + OAuth refresh) **đã kiểm chứng bằng tài
khoản OA/ZBS thật** — gửi thành công mẫu "Yêu cầu thanh toán" (ZBS ID `641791`) tới một số điện thoại
thật, nhận `msg_id` hợp lệ. `cloudflare/zalo-zbs-client.ts` không còn đánh dấu "unverified". Sự cố
gặp phải trong lần kiểm chứng và đã sửa: mẫu ZBS đã duyệt giới hạn `order_code`, `ten_hoc_vien`,
`lop` ở kiểu "Tên khách hàng (30 ký tự)" — `buildTemplateData` từng ghép `lop` = "Tên lớp - Tên chi
nhánh" khiến 62/63 lớp vượt 30 ký tự và bị Zalo từ chối (`errorCode -1121`); đã sửa `lop` chỉ còn
tên lớp (xem `docs/DEPLOY.md` mục "Zalo ZBS Template Message").

Còn mở, chặn trước khi bật `zalo.enabled` production:
- Webhook callback trạng thái (Bước 6) chưa nhận callback thật nào — header chữ ký vẫn dựng suy luận,
  chưa xác nhận (xem cập nhật Q7 ở README).
- Bước 1b: chạy câu SQL thống kê định dạng `parentPhone1` trên CSDL production — cần quyền truy vấn
  trực tiếp mà phiên làm việc này không có; `cloudflare/phone-format.ts` tạm xử lý mọi định dạng phổ
  biến đã biết, chưa đối chiếu với phân bố dữ liệu thật.
- Kiểm chứng cuối cùng ở bảng "Cách kiểm chứng" bên dưới (xác nhận nội dung tin hiển thị đúng trên
  điện thoại nhận) chưa làm — mới xác nhận Zalo trả `msg_id` thành công, chưa xác nhận hiển thị.

## Bối cảnh

Repo chưa có bất kỳ mã Zalo nào — grep toàn bộ `cloudflare/`, `package.json`, `.env.example` không
ra SDK, biến môi trường hay bảng log nào. Field `parentZalo` trên `OpsStudent`
(`prisma/schema.prisma`, trong khối `model OpsStudent`) chỉ là thông tin liên hệ tĩnh, không phải
định danh API.

Số điện thoại phụ huynh: `OpsStudent.parentPhone1` và `parentPhone2`, cả hai kiểu `String` **bắt
buộc** (không optional) nên có thể là chuỗi rỗng. D3 chốt gửi tới `parentPhone1`.

Về API: từ 1/1/2026 Zalo gộp ZNS và UID Transaction/Communication message thành **ZBS Template
Message**; từ 1/3/2026 bắt buộc dùng định dạng mới — mốc này đã qua, nên đây là con đường duy nhất.
ZBS Template **không hỗ trợ đính kèm file**, chỉ text + biến + nút/link. Hướng đã chốt: gửi **link**,
không gửi file.

**Spec field-level thật chưa lấy được** (Q7): `developers.zalo.me` là SPA, WebFetch không trích
được, và chưa có tài khoản OA/ZBS để xem tài liệu sau đăng nhập. Bước 1 phải lấy spec trước.

Hai link sẽ gửi:

| Tin | Link | Nguồn |
|---|---|---|
| Yêu cầu thanh toán | `/thanh-toan/<receivableId>/<publicToken>` | Phase 4 Bước 4 |
| Thông báo hóa đơn | `invoice.pdfUrl` do MISA trả về | Phase 6 Bước 2 |

Không được gửi `/api/finance/qr-image` hay `/api/finance/tuition-qr` — cả hai đều sau cổng đăng
nhập (`worker.ts:1248-1249`, `:1805`), phụ huynh nhận 401 (Đ4 của plan index).

## File cần đọc trước

- `cloudflare/payment-link.ts` và các route công khai (Phase 4)
- `cloudflare/storage/zalo-message-repository.ts` và model `OpsZaloMessageLog` (Phase 2)
- `cloudflare/invoice-outbox.ts` (Phase 6) — hàng chờ này là khuôn mẫu cho hàng chờ Zalo
- `cloudflare/worker.ts:985-1074` (`applySepayAction`, nơi `request-payment` của Phase 4 nằm)
- `cloudflare/integration-settings.ts` — nhóm `zalo`

## Các bước

### Bước 1 — Lấy spec thật và thống kê định dạng số điện thoại (chặn các bước sau)

**1a.** Sau khi có tài khoản OA + ZBS, đăng nhập `developers.zalo.me`, ghi lại: endpoint gửi tin,
tên tham số chính xác, định dạng `template_data`, cấu trúc response (`error`, `message`, `msg_id`,
`sent_time`, quota còn lại), và cấu trúc webhook callback trạng thái.

**1b.** Chạy trên database production:

```sql
SELECT
  count(*) FILTER (WHERE parentPhone1 = '')                              AS rong,
  count(*) FILTER (WHERE parentPhone1 ~ '^0[0-9]{9}$')                   AS chuan_0xxxxxxxxx,
  count(*) FILTER (WHERE parentPhone1 ~ '^84[0-9]{9}$')                  AS chuan_84,
  count(*) FILTER (WHERE parentPhone1 ~ '^\+84')                         AS co_dau_cong,
  count(*)                                                               AS tong
FROM students;
```

Kết quả quyết định `phone-format.ts` phải xử lý bao nhiêu dạng (R16).

### Bước 2 — Chuẩn hoá số điện thoại

Tạo `cloudflare/phone-format.ts`:

```
toZaloPhone(raw: string): string | null    // "0912345678" -> "84912345678"; không hợp lệ -> null
```

Xử lý: khoảng trắng, dấu chấm, gạch ngang, `+84`, `84`, `0` đầu; từ chối số không phải di động Việt
Nam. Trả `null` chứ không đoán — gửi nhầm số là gửi thông tin học phí cho người lạ.

### Bước 3 — Client ZBS

Tạo `cloudflare/zalo-zbs-client.ts`:

```
createZaloClient(config): {
  getAccessToken(): Promise<string>;        // OAuth refresh token, cache theo thời hạn
  sendTemplate(input: { phone; templateId; templateData }): Promise<{ ok: true; msgId; sentTime } | { ok: false; retryable: boolean; code: string; message: string }>;
  ping(): Promise<{ ok: boolean; message: string }>;
}
```

Cùng nguyên tắc với client MISA (Phase 6 Bước 2): không throw, phân biệt `retryable`, timeout cứng,
không log bí mật, cache token cấp module kèm ghi chú lifetime.

**Điểm riêng của Zalo:** refresh token của Zalo **xoay vòng** — mỗi lần dùng, Zalo trả về refresh
token mới và token cũ hết hiệu lực. Client phải ghi token mới vào khối cấu hình tích hợp ngay sau
khi nhận. Bỏ qua điểm này là sau vài giờ tích hợp tự chết. Lượt ghi đó là một `compareAndPut` ngắn
trên khối `integrations:steps-demo`, **không** nằm trong cửa sổ ghi khối tài chính (R1).

### Bước 4 — Hàng chờ gửi tin

Tạo `cloudflare/zalo-outbox.ts`, theo đúng khuôn `invoice-outbox.ts`:

1. Chọn các dòng `OpsZaloMessageLog` trạng thái `QUEUED`, đánh dấu đang xử lý.
2. Gọi `sendTemplate` **ngoài mọi transaction**.
3. Ghi kết quả (`SENT` + `providerMsgId`, hoặc `FAILED` + `errorCode`/`errorMessage`).
4. Khoá `@@unique([kind, receivableId, invoiceId])` từ Phase 2 làm hàng rào chống gửi trùng ở tầng
   database, không chỉ ở tầng mã.

### Bước 5 — Hai điểm xếp hàng

**5a. Sau `action: "request-payment"`** (Phase 4 Bước 3). Sau khi khoản phải thu đã ghi thành công,
xếp một dòng `kind: "PAYMENT_REQUEST"`. Biến của mẫu tin: tên học viên, tên lớp, kỳ thu, số tiền,
mã thanh toán, link trang thanh toán.

Việc xếp hàng nằm **sau** lượt ghi khối tài chính, không nằm trong đó.

**5b. Sau khi hóa đơn chuyển `ISSUED`** (Phase 6 Bước 3, giai đoạn áp kết quả). Xếp một dòng
`kind: "INVOICE_ISSUED"` với biến: tên học viên, số hóa đơn, ký hiệu, số tiền, link `pdfUrl`.

**Tuyệt đối không** xếp hàng trong `syncTuitionReceivables()` hay bất kỳ đường nào chạy ở lượt đọc
tài chính (`worker.ts:904`) — đó là đường tạo khoản phải thu tự động cho **mọi** học viên × lớp, nối
vào đó là đầu mỗi tháng nhắn tin cho toàn bộ phụ huynh.

### Bước 6 — Webhook callback trạng thái

Thêm `POST /api/webhooks/zalo` **trước** `readSession` (`worker.ts:1248`), cạnh
`/api/webhooks/sepay` (`worker.ts:1244-1246`). Xác thực chữ ký theo spec lấy ở Bước 1 — **áp dụng
đúng bài học của Phase 1: bí mật rỗng không được coi là hợp lệ.** Cập nhật `status: "DELIVERED"` và
`deliveredAt` cho dòng log khớp `providerMsgId`.

### Bước 7 — Màn hình nhật ký tin nhắn

Thêm một màn hình trong `app.js` liệt kê `OpsZaloMessageLog`: loại tin, học viên, số điện thoại đã
chuẩn hoá, trạng thái, thời điểm, lỗi, nút gửi lại cho dòng `FAILED`. Chỉ `canManageFinance` xem
được (số điện thoại là dữ liệu cá nhân). Nối nút "Kiểm tra kết nối" của Phase 3 vào `ping()`.

Không làm UI soạn/duyệt nội dung mẫu tin — đó là non-goal của plan.

## Cách kiểm chứng

| # | Kiểm chứng | Cách làm |
|---|---|---|
| 1 | Chuẩn hoá số điện thoại đúng và an toàn | `tests/phone-format.test.ts`: các dạng thật lấy từ Bước 1b, cộng các chuỗi rác phải trả `null` |
| 2 | Client xử lý đúng các dạng phản hồi | `tests/zalo-zbs.test.ts` với `fetch` giả: thành công, hết quota, template chưa duyệt, timeout |
| 3 | Refresh token xoay vòng được lưu lại | `fetch` giả trả token mới → khẳng định khối cấu hình đã cập nhật |
| 4 | Không gửi trùng | Xếp hàng hai lần cho cùng `receivableId` → chỉ một dòng log, một lần gọi API |
| 5 | Không gửi hàng loạt | Chạy `syncedFinance()` trên bộ dữ liệu nhiều học viên → số dòng `QUEUED` bằng 0 |
| 6 | Zalo tắt thì thu tiền vẫn chạy | `zalo.enabled = false` → bắn webhook, biên lai + số buổi đúng, không có dòng log nào |
| 7 | Gửi lỗi không chặn luồng tiền | `fetch` giả luôn 500 → khoản phải thu vẫn chốt, hóa đơn vẫn phát hành |
| 8 | Link trong tin mở được khi chưa đăng nhập | Lấy link từ `templateData`, gọi không cookie → 200 (đã kiểm chứng ở Phase 4, lặp lại ở mức đầu-cuối) |
| 9 | Callback cập nhật đúng dòng | Bắn callback với `msg_id` đã biết → `DELIVERED` |
| 10 | Callback không chữ ký bị từ chối | 401 |
| 11 | Không vỡ kiểu | `npm run typecheck` |

Kiểm chứng cuối cùng làm tay: gửi thật tới một số điện thoại của nhân viên trung tâm, xác nhận nội
dung tin và link hiển thị đúng trên điện thoại.

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Chưa có spec thật (Q7, R15) | Bước 1 là cửa chặn. Lớp client tách riêng nên đổi tên field chỉ sửa một file |
| Số điện thoại lẫn lộn định dạng → gửi lỗi hàng loạt hoặc gửi nhầm người (R16) | Bước 1b thống kê trước; Bước 2 trả `null` thay vì đoán; dòng log ghi số đã chuẩn hoá để đối chiếu |
| Gửi hàng loạt cho toàn bộ phụ huynh | Bước 5 cấm xếp hàng trong đường tự động; kiểm chứng #5 |
| Refresh token xoay vòng không được lưu → tích hợp chết sau vài giờ | Bước 3; kiểm chứng #3 |
| Mẫu tin chưa duyệt hoặc hết quota → tin không tới mà không ai biết | Trạng thái `FAILED` hiện trên màn hình nhật ký; nhân viên thấy được để gửi tay |
| Chi phí tin nhắn vượt dự kiến (Q14) | Mỗi khoản phải thu tối đa một tin; khoá `@@unique` bảo đảm điều đó |
| Gửi tin cho phụ huynh của học viên đã nghỉ | Bước 5a chỉ chạy khi nhân viên bấm tường minh, nên người bấm chịu trách nhiệm kiểm tra |

**Đường lùi:** tắt `zalo.enabled` trên UI → hàng chờ dừng, không cần deploy. Tin đã gửi không thu
hồi được — đó là lý do kiểm chứng #4 và #5 là bắt buộc trước khi bật thật.
