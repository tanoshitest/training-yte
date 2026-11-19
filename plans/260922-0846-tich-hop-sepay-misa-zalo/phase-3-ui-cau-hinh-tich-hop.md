# Phase 3 — UI cấu hình tích hợp, API đọc/ghi và mã hoá bí mật

**Phụ thuộc:** Phase 2
**Ước lượng:** 8h
**Sở hữu file:** `cloudflare/crypto-secrets.ts` (mới), `cloudflare/integration-settings.ts`,
`cloudflare/worker.ts`, `cloudflare/vps-server.ts`, `cloudflare/public/app.js`,
`tests/integration-settings.test.ts` (mới), `docs/DEPLOY.md`

## Bối cảnh

Yêu cầu của người dùng: **mọi tham số cấu hình (SePay webhook secret, MISA, Zalo) sửa được qua UI,
không đụng `.env`, và bí mật không echo lại dạng rõ sau khi lưu.**

Repo đã có sẵn đúng một mẫu để theo, không cần phát minh gì:

- Khối cấu hình trung tâm: route `GET/PUT /api/settings` (`worker.ts:1254-1256`, `:1930-1944`),
  chỉ `ADMIN` được `PUT` (`worker.ts:1931`), có ghi audit (`worker.ts:1939-1942`).
- Khối cấu hình tài khoản nhận tiền: `action: "update-settings"` trên `POST /api/finance/sepay`
  (`worker.ts:1014-1020`), form dựng ở `app.js:3330-3331`, gọi ở `app.js:5414-5415`, thẻ bao ở
  `app.js:709`.

Repo **chưa có** helper mã hoá nào — cần viết mới. `AUTH_SECRET` bắt buộc phải tồn tại
(`vps-server.ts:20` throw nếu thiếu), nên dùng được làm nguồn dẫn xuất khoá.

## File cần đọc trước

- `cloudflare/worker.ts:1254-1256`, `:1930-1944` (mẫu route settings), `:82-84` (`canManageFinance`),
  `:1014-1020` (mẫu update-settings), `:660-702` (`writeAudit`)
- `cloudflare/public/app.js:709` (thẻ bao settings), `:3330-3331` (`sepayBankForm`),
  `:5405-5420` (submit handler)
- `cloudflare/vps-server.ts:175-195` (dựng `env`)
- `cloudflare/integration-settings.ts` (Phase 2)
- `tests/einvoice-queue-ui.test.ts` — mẫu test UI: nạp `app.js` vào sandbox `node:vm` rồi gọi hàm
  dựng giao diện

## Các bước

### Bước 1 — Helper mã hoá `cloudflare/crypto-secrets.ts`

```
encryptSecret(plaintext: string, masterKey: string): Promise<string>   // "v1.<iv b64>.<ct b64>"
decryptSecret(ciphertext: string, masterKey: string): Promise<string>
secretHint(plaintext: string): string                                   // 4 ký tự cuối
```

- AES-256-GCM qua `crypto.subtle` (đã dùng sẵn trong repo cho HMAC ở `sepay-engine.ts:618`, nên có
  trong cả hai môi trường chạy).
- Khoá dẫn xuất từ `AUTH_SECRET` bằng SHA-256 → 32 byte. Không thêm biến môi trường mới, để không
  phát sinh thêm một thứ phải khai khi dựng máy.
- `decryptSecret` trả chuỗi rỗng khi ciphertext hỏng hoặc `AUTH_SECRET` đã đổi, **không throw** —
  cấu hình hỏng phải hiện thành "chưa cấu hình", không được làm sập worker.

Tiền tố `v1.` để sau này đổi thuật toán mà không phải đoán định dạng.

### Bước 2 — Hàm mask và hàm gộp

Trong `cloudflare/integration-settings.ts` thêm:

- `maskIntegrationSettings(settings)` — trả bản sao **bỏ hẳn** mọi field `*Encrypted`, giữ
  `*Hint`. Đây là dạng duy nhất được trả về client.
- `mergeIntegrationSettings(current, patch, masterKey)` — với mỗi field bí mật: patch gửi chuỗi rỗng
  hoặc không gửi → **giữ nguyên giá trị cũ**; patch gửi chuỗi mới → mã hoá và cập nhật cả `Hint`.
  Quy tắc này cho phép UI hiện `••••1234` mà không cần client biết giá trị thật.

### Bước 3 — Hai route mới trong `worker.ts`

Đặt cạnh khối `/api/settings` hiện có:

```
GET  /api/integrations   -> ADMIN, trả maskIntegrationSettings(...)
PUT  /api/integrations   -> ADMIN, mergeIntegrationSettings + compareAndPut + writeAudit
```

- Cả hai nằm **sau** `readSession` (`worker.ts:1248-1249`), nên đã có cổng đăng nhập.
- Chỉ `session.role === "ADMIN"`, giống `worker.ts:1931`. `ACCOUNTANT` **không** được — bí mật MISA
  và Zalo rộng quyền hơn thông tin tài khoản nhận tiền.
- Ghi bằng `env.STEPS_LMS_DATA.compareAndPut("integrations:steps-demo", expected, ...)`. Xung đột →
  409 kèm thông điệp tiếng Việt như `worker.ts:1925`.
- `writeAudit` với `entity: "Settings"`, tóm tắt **không chứa giá trị bí mật**, chỉ liệt kê tên
  nhóm field đã đổi.

### Bước 4 — Hàm đọc cấu hình hiệu lực dùng chung

Một hàm duy nhất cho Phase 1, 6, 7 dùng chung (DRY):

```
readEffectiveIntegrationSettings(env): Promise<{
  sepay: { mode, secret };        // secret đã giải mã
  misa: { enabled, ...credentials };
  zalo: { enabled, ...credentials };
}>
```

Thứ tự ưu tiên cho bí mật webhook SePay: giá trị trong khối cấu hình (đã giải mã) → rồi mới đến
`env.SEPAY_WEBHOOK_SECRET`. Biến môi trường giữ lại làm đường lùi cho tới khi go-live xong, sau đó
gỡ khỏi `vps-server.ts:185` ở Phase 8.

Nối hàm này vào `handleSepayWebhook` (chỗ Phase 1 gọi `verifyWebhookRequest`), thay cho việc đọc
thẳng `env.SEPAY_WEBHOOK_SECRET`.

### Bước 5 — Tab cấu hình tích hợp trong `app.js`

Thêm một thẻ `settings-card` mới cạnh thẻ "Tài khoản nhận tiền" (`app.js:709`), theo đúng hình dạng
`sepayBankForm()` (`app.js:3330-3331`):

- Ba nhóm: **SePay webhook**, **MISA meInvoice**, **Zalo OA / ZBS**.
- Mỗi nhóm có công tắc `enabled` và một dòng trạng thái: `Chưa cấu hình` / `Đã cấu hình` / `Lỗi kết
  nối lần cuối: ...`.
- Ô nhập bí mật: `type="password"`, `placeholder` là `••••` + `hint`, để trống nghĩa là giữ nguyên.
  Có nút "Đổi giá trị" để xoá ô về rỗng khi người dùng thật sự muốn thay.
- Thẻ chỉ render khi `state.session.role === "ADMIN"`; đây là lớp tiện dụng, còn lớp chặn thật nằm
  ở route (Bước 3).
- Mỗi nhóm có nút "Kiểm tra kết nối" gọi một endpoint thử nghiệm. **Endpoint thử nghiệm của MISA
  viết ở Phase 6, của Zalo ở Phase 7**; Phase 3 chỉ dựng nút và để nó hiện "Chưa khả dụng".

Không tái cấu trúc `app.js` (461 KB, xem ghi chú sở hữu file ở plan index).

### Bước 6 — Cập nhật tài liệu vận hành

`docs/DEPLOY.md`: ghi rõ `SEPAY_WEBHOOK_SECRET` trong `/opt/vsteps/.env` giờ là đường lùi, nguồn
chính là màn hình cấu hình tích hợp; MISA và Zalo **không** có biến môi trường tương ứng.

## Cách kiểm chứng

| # | Kiểm chứng | Cách làm |
|---|---|---|
| 1 | Mã hoá/giải mã đúng chiều | `tests/integration-settings.test.ts`: `decryptSecret(encryptSecret(x)) === x` |
| 2 | Ciphertext hỏng không throw | Truyền chuỗi rác → trả `""` |
| 3 | Response không chứa bí mật | `tests/vps-worker.test.ts`: `GET /api/integrations` bằng phiên ADMIN, khẳng định `JSON.stringify(body)` không chứa plaintext vừa lưu và không chứa key `*Encrypted` |
| 4 | Lưu rồi lưu lại với ô bí mật để trống không xoá mất giá trị | `PUT` lần 1 có secret, `PUT` lần 2 không có → giải mã vẫn ra giá trị lần 1 |
| 5 | Vai trò khác ADMIN bị chặn | Phiên ACCOUNTANT/TEACHER/STUDENT gọi `GET` và `PUT` → 403 |
| 6 | Hai admin lưu đồng thời không mất dữ liệu của nhau | Test `compareAndPut` trả 409 cho lượt sau |
| 7 | Webhook dùng bí mật từ cấu hình UI | Lưu bí mật qua API, bắn webhook ký bằng bí mật đó → 200; ký bằng bí mật cũ trong `.env` → 401 |
| 8 | Thẻ cấu hình chỉ hiện với ADMIN | Test UI theo mẫu `tests/einvoice-queue-ui.test.ts`, đổi `state.session.role` |
| 9 | Không vỡ kiểu | `npm run typecheck` |

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Đổi `AUTH_SECRET` làm mọi bí mật đã mã hoá thành rác (R13 lân cận) | `decryptSecret` trả rỗng → UI hiện "Chưa cấu hình", tích hợp tự tắt thay vì gọi API bằng credential rác. Ghi cảnh báo này vào `docs/DEPLOY.md` |
| Bí mật lọt vào log audit hoặc thông điệp lỗi | Bước 3 quy định tóm tắt audit chỉ liệt kê tên nhóm field. Thêm một test khẳng định bản ghi audit không chứa plaintext |
| Bí mật lọt vào bản dump backup (R13) | Chấp nhận có ciphertext trong dump; khoá nằm ở `AUTH_SECRET` trong `.env`, không nằm trong dump database |
| UI gửi nhầm chuỗi mask `••••1234` lên server và ghi đè bí mật thật | Bước 2: patch rỗng = giữ nguyên; thêm kiểm tra từ chối mọi chuỗi bắt đầu bằng `•` |

**Đường lùi:** tắt cả ba công tắc `enabled` trên UI là hệ thống quay về hành vi trước phase này mà
không cần deploy. Nếu cần lùi hẳn, revert mã; khối `integrations:steps-demo` trong DB nằm im, không
ai đọc.
