# Phase 1 — Vá lỗ hổng webhook và quyền `simulate`

**Phụ thuộc:** không
**Ước lượng:** 5h
**Sở hữu file:** `cloudflare/sepay-webhook-auth.ts` (mới), `cloudflare/sepay-engine.ts`,
`cloudflare/worker.ts`, `tests/sepay-matching.test.ts`, `tests/vps-worker.test.ts`

## Bối cảnh

Ba lỗ hổng đang mở trên production. Chúng hiện gây thiệt hại giới hạn vì webhook mới chỉ ghi khối
tài chính, chưa kích hoạt gì. Sau Phase 5-7, mỗi lỗ trở thành đường để người ngoài cộng buổi học và
phát hành hóa đơn thật. Vá trước, độc lập, không phụ thuộc phase nào.

1. **Bỏ qua xác thực khi bí mật rỗng.** `worker.ts:936` — `if (env.SEPAY_WEBHOOK_SECRET &&
   !signatureValid)`. `.env.example:30` để trống, và `verifySepaySignature` còn `return true` ngay
   khi `secret` rỗng (`sepay-engine.ts:616`). Bất kỳ ai biết URL đều bắn được webhook giả.
2. **Ghi đè không kiểm tra xung đột.** `worker.ts:981` dùng `persistFinance` (`worker.ts:753-755`),
   ghi đè vô điều kiện. Đường thu tay thì dùng `persistFinanceIfUnchanged` (`worker.ts:742-751`) kèm
   vòng retry 3 lần (`worker.ts:1907-1911`).
3. **STUDENT tự đánh dấu đã trả tiền.** `worker.ts:1915-1922` cho phiên `STUDENT` gọi
   `action: "simulate"` với `kind = "exact"` trên khoản phải thu của chính mình. Đường này chạy đủ
   `processBankTransaction` → `applyMatch` → `finishInvoices` (`worker.ts:1046-1048`).

## File cần đọc trước

- `cloudflare/worker.ts:932-983` (`handleSepayWebhook`), `:742-755` (hai hàm ghi),
  `:1899-1928` (route `/api/finance/sepay`), `:1205-1234` (đăng nhập, cờ `ALLOW_DEMO_LOGIN`)
- `cloudflare/sepay-engine.ts:615-622` (`verifySepaySignature`)
- `cloudflare/vps-server.ts:179-190` (nạp biến môi trường vào `env`)
- `tests/vps-worker.test.ts` (mẫu dựng server test và gọi route)
- `tests/sepay-matching.test.ts` (mẫu test thuần trên `sepay-engine`)

## Các bước

### Bước 1 — Tách xác thực webhook ra file riêng

Tạo `cloudflare/sepay-webhook-auth.ts` với một hàm thuần:

```
verifyWebhookRequest(input: {
  rawBody: string;
  headers: Headers;
  secret?: string;
  mode: "HMAC_BODY" | "HMAC_TIMESTAMP_BODY" | "API_KEY" | "DISABLED";
}): Promise<{ ok: true } | { ok: false; reason: string }>
```

- `DISABLED` chỉ hợp lệ khi `ALLOW_DEMO_LOGIN === "true"`; ở production nó trả `ok: false`.
- `HMAC_BODY` giữ nguyên công thức hiện có ở `sepay-engine.ts:618-621` để không phá tương thích.
- `HMAC_TIMESTAMP_BODY` ký `${timestamp}.${rawBody}`, đọc timestamp từ header, từ chối khi lệch quá
  5 phút.
- `API_KEY` so sánh header `Authorization: Apikey <token>` theo kiểu so sánh hằng thời gian.

**Chưa chọn được mode nào là đúng cho trung tâm — đây là Q2 của plan index.** Cho tới khi có câu
trả lời, mặc định `HMAC_BODY` (bằng hành vi hiện tại) và để mode đọc từ cấu hình ở Phase 3.

Giữ `verifySepaySignature` trong `sepay-engine.ts` nguyên vẹn để `tests/sepay-matching.test.ts` và
mọi chỗ gọi cũ không gãy; hàm mới gọi lại nó cho nhánh `HMAC_BODY` (DRY).

### Bước 2 — Bắt buộc chữ ký ở `handleSepayWebhook`

Tại `worker.ts:932-938`, thay khối kiểm tra bằng:

- Gọi `verifyWebhookRequest`. Không hợp lệ → `401 INVALID_SIGNATURE`, **kể cả khi bí mật rỗng**.
- Vẫn ghi một dòng `webhookLogs` với `signatureValid: false`, `processingStatus: "REJECTED"` (giá
  trị này đã có sẵn trong kiểu `SepayWebhookLog`, `sepay-engine.ts:148`) trước khi trả 401, để có
  vết cho việc điều tra. Lượt ghi log này dùng `persistFinanceIfUnchanged` như Bước 3.
- Ngoại lệ duy nhất: `ALLOW_DEMO_LOGIN === "true"` thì cho qua, để `npm run dev` cục bộ vẫn thử
  được.

### Bước 3 — Webhook ghi bằng `persistFinanceIfUnchanged` + retry

Tách thân xử lý hiện tại (`worker.ts:939-982`) thành một hàm nhận `snapshot` và trả
`{ conflict: true }` hoặc kết quả, theo đúng hình dạng `collectTuitionAction`
(`worker.ts:1076-1150`). Ở chỗ gọi, lặp tối đa 3 lần đọc lại `readFinanceSnapshot(env)` khi
`conflict`, giống `worker.ts:1907-1911`.

Hết 3 lần vẫn xung đột → trả `409` (không phải `500`). SePay thường gửi lại khi nhận mã lỗi —
**cần xác nhận số lần và giãn cách (Q12 cũ, nay gộp vào Q2)**; nếu không gửi lại, đổi sang ghi vào
một hàng chờ xử lý lại thay vì trả 409.

Bỏ hẳn lời gọi `persistFinance` ở đường webhook. Kiểm tra bằng grep xem còn chỗ nào dùng
`persistFinance` không; nếu không còn, xoá luôn hàm để không ai vô tình dùng lại.

### Bước 4 — Chặn `simulate` khỏi phiên STUDENT

Tại `worker.ts:1915-1922`:

- Phiên `STUDENT` chỉ còn được `action: "reset"` trên khoản phải thu của chính mình nếu nghiệp vụ
  còn cần; nếu không ai dùng, chặn luôn cả `reset`.
- Đưa toàn bộ nhánh `action === "simulate"` (`worker.ts:1021-1048`) ra sau hai điều kiện: vai trò
  thoả `canManageFinance` (`worker.ts:82-84`) **và** `env.ALLOW_DEMO_LOGIN === "true"`.
  `simulate` là công cụ demo, không nên tồn tại trên production.
- Cập nhật `cloudflare/public/app.js:5423-5436` để không hiển thị các nút gọi `simulate` khi cờ tắt.
  Giá trị cờ đã có trên phía client hay chưa cần kiểm tra; nếu chưa, thêm vào payload
  `/api/settings` thay vì suy đoán ở client.

### Bước 5 — Đặt bí mật thật lên production

Đặt `SEPAY_WEBHOOK_SECRET` trong `/opt/vsteps/.env` (đường dẫn theo `docs/DEPLOY.md:20`) bằng giá
trị lấy từ cổng SePay. Đây là bước vận hành, không phải code. Phase 3 sẽ chuyển giá trị này vào
cấu hình sửa qua UI; cho tới lúc đó biến môi trường là nguồn duy nhất.

## Cách kiểm chứng

| # | Kiểm chứng | Lệnh / thao tác |
|---|---|---|
| 1 | Webhook không kèm chữ ký bị từ chối dù bí mật rỗng | Thêm case vào `tests/vps-worker.test.ts`: `POST /api/webhooks/sepay` không header → 401 |
| 2 | Webhook có chữ ký đúng vẫn xử lý bình thường | Test tính HMAC bằng chính `verifySepaySignature`, bắn vào, khẳng định giao dịch xuất hiện trong `bankTransactions` |
| 3 | Bắn lặp cùng `providerTransactionId` trả `duplicate: true`, không tạo thêm biên lai | Bắn 3 lần, đếm `receipts` |
| 4 | Webhook và `collect` chạy song song không mất biên lai | Test đồng thời: `Promise.all` một `collect` và một webhook, khẳng định cả hai biên lai đều còn |
| 5 | Phiên STUDENT gọi `simulate` nhận 403 | `tests/vps-worker.test.ts`, đăng nhập vai STUDENT |
| 6 | Không còn chỗ nào gọi `persistFinance` | `grep -rn "persistFinance(" cloudflare/` chỉ ra `persistFinanceIfUnchanged` |
| 7 | Không vỡ kiểu | `npm run typecheck` |

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Công thức HMAC không khớp spec SePay → 401 toàn bộ webhook thật (R8) | Không triển khai Bước 2 lên production trước khi trả lời Q2. Có thể ship Bước 3-4 trước, Bước 2 sau |
| `409` khiến SePay bỏ giao dịch nếu cổng không gửi lại | Xác nhận chính sách gửi lại trước; nếu không có, chuyển sang hàng chờ nội bộ |
| Tắt `simulate` làm hỏng quy trình nội bộ nào đó đang dùng | Grep `app.js` tìm mọi nút gọi `simulate` trước khi tắt; hỏi học vụ nếu có nút xuất hiện trong màn hình vận hành hàng ngày |

**Đường lùi:** toàn bộ phase là thay đổi mã, không có migration. Revert commit là xong. Giá trị
`SEPAY_WEBHOOK_SECRET` đặt ở Bước 5 có thể xoá khỏi `.env` để quay lại hành vi cũ, nhưng chỉ làm vậy
nếu đã revert Bước 2.
