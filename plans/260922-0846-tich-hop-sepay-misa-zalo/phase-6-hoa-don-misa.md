# Phase 6 — Phát hành hóa đơn thật qua MISA meInvoice

**Phụ thuộc:** Phase 2, Phase 3, Phase 5. Cần Q4 và Q5 đã trả lời.
**Ước lượng:** 10h
**Sở hữu file:** `cloudflare/misa-invoice-client.ts` (mới), `cloudflare/invoice-outbox.ts` (mới),
`cloudflare/sepay-engine.ts`, `cloudflare/worker.ts`, `cloudflare/public/app.js`,
`tests/misa-invoice.test.ts` (mới), `tests/einvoice-queue-ui.test.ts`

## Bối cảnh

Hóa đơn hiện là mock hoàn toàn. `issueDemoInvoice()` (`sepay-engine.ts:458-479`) sinh số hóa đơn
ngẫu nhiên, ký hiệu cứng `"1C26TYY"`, mã tra cứu `LK<số>`. Ba nơi gọi:

| Nơi | Ngữ cảnh |
|---|---|
| `worker.ts:980` | qua `finishInvoices()` (`worker.ts:725-730`), trong `handleSepayWebhook` |
| `worker.ts:1048` | qua `finishInvoices()`, trong nhánh `action: "simulate"` |
| `worker.ts:1052, 1057` | `action: "retry-invoice"` và `action: "fail-invoice"` |
| `worker.ts:1070` | qua `finishInvoices()`, trong nhánh `action: "match"` |

`finishInvoices` chuyển **mọi** hóa đơn `PENDING`/`FAILED` sang `ISSUED` ngay trong request. Giữ nó
trên đường production nghĩa là MISA không bao giờ được gọi mà cũng không ai biết (R12).

Ràng buộc kiến trúc quan trọng (R1): khối tài chính ghi bằng `compareAndPut` khoá dòng
`storage_blocks` rồi so sánh nguyên chuỗi JSON dựng lại (`relational-kv.ts:154-170`). Một lệnh gọi
HTTP 2-5 giây nằm giữa `read` và `compareAndPut` sẽ kéo dài cửa sổ xung đột lên nhiều lần và làm mất
biên lai. **Mọi lệnh gọi MISA phải nằm ngoài cửa sổ đó.**

`worker.fetch()` không có `ctx.waitUntil` trên đường VPS (`vps-server.ts` gọi thẳng `worker.fetch`),
nên "chạy nền" ở đây nghĩa là một vòng lặp hẹn giờ trong tiến trình, không phải cơ chế của nền tảng.

## Tóm tắt API MISA meInvoice (theo `docs/nangcapsepay.md` mục 6 — chưa kiểm chứng bằng tài khoản thật)

- `POST /invoice/token` — ClientID/ClientSecret + taxcode/username/password → access token.
- `GET /invoice/templates` — lấy `InvSeries` / `InvTemplateNo` đã đăng ký.
- `POST /invoice/publishing` — phát hành thật. `SignType: 2` (ký HSM, không cần USB token, phù hợp
  server-to-server). `RefID` chống trùng — dùng `SepayInvoice.id`.
- `POST /invoice/status` — tra trạng thái, poll 3-5 giây/lần, tối đa 3 lần.

**Toàn bộ mục này chưa được kiểm chứng trên tài khoản thật.** Bước 1 phải xác nhận lại trước khi
viết client.

## File cần đọc trước

- `cloudflare/sepay-engine.ts:115-131` (`SepayInvoice`, đã thêm 7 field ở Phase 2), `:413-430` (nơi
  hóa đơn được tạo với `provider: "DEMO"`, `status: "PENDING"`), `:458-479` (`issueDemoInvoice`)
- `cloudflare/worker.ts:725-730` (`finishInvoices`), `:980`, `:1046-1058`, `:1064-1071`
- `cloudflare/integration-settings.ts` và `readEffectiveIntegrationSettings` (Phase 3)
- `cloudflare/public/app.js` — màn hình hàng chờ hóa đơn; `tests/einvoice-queue-ui.test.ts` chỉ ra
  các hàm `invoicesPage` và `invoiceQueueRows`

## Các bước

### Bước 1 — Xác nhận spec bằng tài khoản thật (chặn các bước sau)

Lấy ClientID/ClientSecret + tài khoản meInvoice của trung tâm (Q4), gọi thử `POST /invoice/token`
và `GET /invoice/templates` bằng `curl`. Ghi lại: URL thật của môi trường sandbox và production,
tên field chính xác, `InvSeries`/`InvTemplateNo` được cấp.

Nếu MISA không cấp API cho gói hiện tại, dừng phase này và giữ `issueDemoInvoice` sau cờ
`misa.enabled = false`; Phase 7 vẫn chạy được với tin yêu cầu thanh toán, chỉ thiếu tin thông báo
hóa đơn.

### Bước 2 — Client MISA

Tạo `cloudflare/misa-invoice-client.ts`:

```
createMisaClient(config): {
  getToken(): Promise<string>;            // cache trong bộ nhớ theo thời hạn token
  publishInvoice(input): Promise<{ ok: true; providerInvoiceId; invoiceNumber; invoiceSeries; lookupCode; taxAuthorityCode; pdfUrl; xmlUrl } | { ok: false; retryable: boolean; code: string; message: string }>;
  getInvoiceStatus(refId): Promise<...>;
  ping(): Promise<{ ok: boolean; message: string }>;   // cho nút "Kiểm tra kết nối" ở Phase 3
}
```

Nguyên tắc:

- **Không throw ra ngoài.** Mọi lỗi trả về dạng kết quả, phân biệt `retryable` (timeout, 5xx, giới
  hạn tần suất) với không retry được (sai credential, dữ liệu hóa đơn không hợp lệ).
- Timeout cứng cho mỗi lệnh gọi (đề xuất 20 giây) bằng `AbortController`.
- Cache token ở biến cấp module. **Lifetime:** `vps-server.ts` chạy một tiến trình duy nhất nên
  cache dùng được, reset mỗi lần deploy; không chia sẻ giữa instance. Chấp nhận, ghi chú trong mã.
- `RefID = invoice.id` để MISA tự chống trùng khi ta gửi lại.
- Không log giá trị bí mật.

Dữ liệu người mua lấy từ khoản phải thu và bản ghi học viên. Thuế suất áp theo
`misa.taxRateLabel` trong cấu hình (Q5) — **không hardcode**.

### Bước 3 — Hàng chờ phát hành

Tạo `cloudflare/invoice-outbox.ts`:

```
processInvoiceOutbox(env, opts?: { limit?: number }): Promise<{ processed: number; issued: number; failed: number }>
```

Vòng đời một lượt xử lý, tuân thủ R1 tuyệt đối:

1. Đọc khối tài chính, chọn tối đa `limit` hóa đơn `PENDING`/`FAILED` có `retryCount < 5`.
   **Đóng lượt đọc tại đây.**
2. Đánh dấu chúng `PROCESSING` bằng một lượt `compareAndPut` ngắn (trạng thái `PROCESSING` đã có sẵn
   trong `InvoiceStatus`, `sepay-engine.ts:7`). Đây là khoá chống hai vòng lặp cùng xử lý một hóa
   đơn.
3. **Ngoài mọi transaction:** gọi `publishInvoice` lần lượt.
4. Đọc lại khối tài chính, áp kết quả, `compareAndPut`. Xung đột → đọc lại và áp lại, tối đa 3 lần.
   Chỉ sửa đúng các hóa đơn trong lô, không chạm dữ liệu khác.
5. Thất bại không retry được → `FAILED` + `lastError`, không tăng `retryCount` vô hạn.
6. Hóa đơn kẹt `PROCESSING` quá 10 phút → đưa về `PENDING` ở đầu lượt kế tiếp (chống kẹt khi tiến
   trình chết giữa chừng).

Kích hoạt: một `setInterval` trong `vps-server.ts` chạy mỗi 30 giây, **cộng** một lời gọi ngay sau
khi webhook trả response ở `worker.ts` để hóa đơn ra sớm. Lời gọi sau webhook phải là "bắn rồi
quên", không `await` trong đường trả response.

### Bước 4 — Gỡ `finishInvoices` khỏi đường production (R12)

- `worker.ts:980` (webhook): xoá lời gọi. Hóa đơn ở `PENDING` là đúng; hàng chờ sẽ xử lý.
- `worker.ts:1070` (`action: "match"`): xoá tương tự.
- `worker.ts:1048` (`action: "simulate"`): Phase 1 đã đặt nhánh này sau `ALLOW_DEMO_LOGIN`, nên giữ
  `finishInvoices` ở đây là chấp nhận được — đó là đường demo.
- `worker.ts:1052` (`retry-invoice`): đổi thành đặt hóa đơn về `PENDING` + `retryCount = 0` rồi gọi
  hàng chờ, thay vì `issueDemoInvoice`.
- `worker.ts:1057` (`fail-invoice`): giữ, là công cụ vận hành đánh dấu hỏng bằng tay.

Sau khi sửa, `npm run typecheck` phải sạch. Grep `finishInvoices` và `issueDemoInvoice` để xác nhận
không còn chỗ gọi ngoài dự kiến.

### Bước 5 — Đường lùi khi MISA tắt

`misa.enabled === false` → hàng chờ không chạy; hóa đơn nằm `PENDING`. Màn hình hàng chờ hóa đơn
hiện dòng "MISA chưa cấu hình". **Luồng thu tiền và kích hoạt buổi học không được ảnh hưởng** — đây
là tiêu chí nghiệm thu #13 của plan index.

### Bước 6 — Màn hình hàng chờ hóa đơn

Bổ sung vào màn hình hiện có (`app.js`, các hàm mà `tests/einvoice-queue-ui.test.ts` gọi): cột nhà
cung cấp, mã tra cứu, mã CQT, link PDF, số lần thử, lỗi gần nhất, nút "Phát hành lại". Nối nút
"Kiểm tra kết nối" của Phase 3 vào `ping()`.

## Cách kiểm chứng

| # | Kiểm chứng | Cách làm |
|---|---|---|
| 1 | Client xử lý đúng các dạng phản hồi | `tests/misa-invoice.test.ts` với `fetch` giả: thành công, 401, 500, timeout, JSON hỏng |
| 2 | Không có lệnh gọi mạng nào nằm giữa đọc và ghi khối tài chính | Đọc lại `invoice-outbox.ts`; trong test, `fetch` giả khẳng định nó được gọi khi không có transaction nào mở |
| 3 | Chạy hàng chờ hai lần đồng thời không phát hành trùng | `Promise.all` hai lượt, đếm số lần `publishInvoice` được gọi cho cùng một `invoice.id` |
| 4 | Hóa đơn kẹt `PROCESSING` được cứu | Đặt `PROCESSING` với thời điểm quá 10 phút, chạy hàng chờ, khẳng định về `PENDING` rồi `ISSUED` |
| 5 | Lỗi không retry được không quay vòng vô hạn | `fetch` giả trả 401 liên tục → `FAILED` sau 1 lần, `retryCount` không tăng mãi |
| 6 | MISA tắt thì thu tiền vẫn chạy | Bắn webhook với `misa.enabled = false` → biên lai + số buổi đúng, hóa đơn `PENDING` |
| 7 | Bảy field mới lưu và đọc lại đủ | `npm run test:storage` |
| 8 | `finishInvoices` không còn trên đường webhook | Bắn webhook, khẳng định hóa đơn ở `PENDING` chứ không `ISSUED` |
| 9 | Bí mật không lọt vào log | Kiểm tra output test không chứa ClientSecret |
| 10 | Không vỡ kiểu | `npm run typecheck` |

Kiểm chứng cuối cùng phải làm tay trên môi trường sandbox của MISA: phát hành một hóa đơn thật, đối
chiếu số hóa đơn và mã tra cứu trên portal MISA.

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Gọi mạng trong cửa sổ ghi gây mất biên lai (R1) | Bước 3 tách rõ ba giai đoạn; kiểm chứng #2 |
| Phát hành trùng hóa đơn (không thu hồi được, phải lập hóa đơn điều chỉnh) | Trạng thái `PROCESSING` làm khoá + `RefID` cho MISA tự chống trùng; kiểm chứng #3 |
| `finishInvoices` còn sót ở một nhánh → MISA không bao giờ được gọi (R12) | Bước 4 liệt kê đủ cả 5 vị trí; grep sau khi sửa |
| Trung tâm không được cấp API (Q4, R14) | Bước 1 là cửa chặn; đường lùi là giữ `issueDemoInvoice` sau cờ tắt |
| Thuế suất sai cho phụ huynh không có mã số thuế (Q5) | Lấy từ cấu hình, không hardcode; không phát hành thật cho tới khi kế toán trung tâm xác nhận |
| Vòng lặp `setInterval` chạy chồng khi một lượt kéo dài | Cờ "đang chạy" cấp module; bỏ qua lượt mới khi lượt cũ chưa xong |

**Đường lùi:** tắt `misa.enabled` trên UI → hàng chờ dừng, hệ thống quay về trạng thái hóa đơn chờ
mà không cần deploy. Hóa đơn đã phát hành thật thì không lùi được bằng kỹ thuật — phải lập hóa đơn
điều chỉnh theo nghiệp vụ kế toán. Vì vậy Bước 1 và kiểm chứng #3 là bắt buộc trước khi bật thật.
