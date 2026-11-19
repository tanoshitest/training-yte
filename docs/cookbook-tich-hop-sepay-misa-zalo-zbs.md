# Cookbook: tích hợp SePay + MISA meInvoice + Zalo ZBS vào một CRM mới

> **Đối tượng đọc: AI coding agent.** Mục tiêu: dựng lại đúng bộ ba tích hợp này (thu tiền chuyển khoản
> tự đối soát → hóa đơn điện tử → báo phụ huynh/khách qua Zalo) trong một dự án CRM khác, từ khâu khai báo
> tài khoản, lấy token, đến code. Viết lại từ code đang chạy production của STEPS LMS (xác minh ngày
> 2026-10-02), thay thế tài liệu scout cũ `nangcapsepay.md` (đã xóa vì lỗi thời).
>
> Quy ước: **[ĐÃ KIỂM CHỨNG]** = đã chạy thật (sandbox/production) trong dự án gốc. **[CHƯA KIỂM CHỨNG]** =
> dựng theo tài liệu nhà cung cấp, chưa có bằng chứng chạy thật — phải thử bằng `curl` trước khi tin.
> Mọi đường dẫn `cloudflare/*.ts` là file tham chiếu trong repo STEPS LMS (xem mục 13).

## 0. Cách dùng cookbook này

1. Đọc mục 1-2 (luồng + nguyên tắc bắt buộc) trước, **không bỏ qua mục 2**.
2. Mục 3 là việc **con người** phải làm ngoài code (đăng ký, nạp tiền, chờ duyệt mẫu tin 2-3 ngày). Báo
   người dùng bắt đầu mục 3 ngay từ đầu vì nó chặn go-live, không chặn viết code.
3. Làm theo thứ tự: mục 4 (nền cấu hình + mã hóa) → 5 (SePay) → 6 (Zalo) → 7 (MISA) → 8 (outbox) → 10 (test).
4. Dùng bảng mục 9 để ánh xạ khái niệm của dự án mới (học viên / khoản thu / lớp…) sang CRM của họ. Chỉ phần
   "nghiệp vụ sau khi tiền về" là riêng từng dự án; mọi thứ còn lại tái dùng nguyên.
5. Không in secret/token ra log, chat, commit. Chỉ báo "OK/rỗng/độ dài/4 ký tự cuối".

## 1. Luồng tổng thể

```
Nhân viên bấm "Gửi yêu cầu thanh toán"
  → chốt khoản phải thu (amountDue) + mã đối soát (paymentCode) + QR VietQR
  → xếp tin Zalo PAYMENT_REQUEST vào outbox  ──► Zalo ZBS gửi SĐT phụ huynh
Phụ huynh chuyển khoản, nội dung = paymentCode
  → ngân hàng → SePay → POST /api/webhooks/sepay  (xác thực API Key)
       1. chống trùng theo transaction id
       2. trích mã từ nội dung CK, khớp khoản phải thu ACTIVE
       3. đủ tiền → ghi payment + receipt + hóa đơn PENDING, chạy nghiệp vụ "kích hoạt" (cộng buổi/gia hạn…)
       4. ghi DB bằng compare-and-swap (retry 3 lần), RỒI mới xếp tin Zalo "đã thanh toán"
       5. trả 200 {"success":true} ngay; việc mạng chạy nền (fire-and-forget)
  → nền: processZaloOutbox() rồi processInvoiceOutbox()
Kế toán xem bản nháp hóa đơn ở MISA (unpublishview) → bấm "Xuất" → approvedAt
  → hàng chờ gọi MISA /invoice/publishing (SignType 2, HSM) → lưu số hóa đơn
  → MISA tự gửi email hóa đơn cho người mua nếu có email
```

Hai điểm đã chốt với khách ở dự án gốc (áp dụng làm mặc định, đổi nếu khách khác):
- Zalo "đã thanh toán" gửi **trước** hóa đơn và **không chờ** MISA; phát hành hóa đơn xong **không** gửi Zalo.
- Hóa đơn **không bao giờ tự phát hành thật** — luôn cần người duyệt (`approvedAt`) sau khi xem bản nháp.

## 2. Nguyên tắc bắt buộc (mỗi cái đều từng gây sự cố hoặc suýt gây sự cố)

| # | Nguyên tắc | Vì sao |
|---|---|---|
| R1 | **Không gọi mạng ngoài (MISA/Zalo) trong cửa sổ đọc–ghi dữ liệu tài chính.** Mẫu 3 giai đoạn: (1) claim lô + đánh dấu PROCESSING bằng một lượt ghi ngắn, (2) gọi mạng ngoài mọi transaction, (3) đọc lại → áp kết quả → ghi lại (chỉ sửa đúng dòng trong lô) | Giữ lock/ghi đè lạc quan lâu → mất dữ liệu hoặc deadlock |
| R2 | **Ghi tài chính bằng compare-and-swap + retry ≤ 3 lần**, trả 409 khi hết lượt (SePay sẽ gửi lại). Không ghi đè trần | Hai webhook gần như đồng thời ghi đè nhau → mất tiền ghi nhận |
| R3 | **Idempotent theo transaction id của SePay** (`id`/`referenceCode`): trùng → trả 200 `duplicate`, không xử lý lại | SePay retry tối đa 7 lần trong ~33 phút |
| R4 | **Webhook không bao giờ nhận request khi secret rỗng.** Secret rỗng → từ chối (`MISSING_SECRET`), không "bỏ qua xác thực". Chế độ tắt xác thực chỉ hợp lệ khi cờ demo bật | Bản đầu của dự án gốc có lỗ này: bất kỳ ai POST giả tiền về là xong |
| R5 | **Secret mã hóa AES-GCM trong DB, không trả plaintext về client** (chỉ trả `hint` 4 ký tự cuối). Client gửi chuỗi rỗng hoặc chuỗi mask `••••1234` → giữ secret cũ | UI cấu hình sửa được mà không đụng `.env` |
| R6 | **Một mã đối soát duy nhất** dùng đồng thời cho QR, phiếu báo, tin Zalo và bộ khớp webhook | Bản đầu có 2 lược đồ mã song song → webhook không bao giờ khớp được tiền thật (lỗi nặng nhất của dự án gốc) |
| R7 | Tiền về nhưng nghiệp vụ nội bộ lỗi (hết lớp, miễn phí, lệch số tiền) → **vẫn trả 200**, đánh giao dịch `NEEDS_REVIEW` + lý do cho kế toán. Đừng trả lỗi để SePay gửi lại vô hạn | Tiền thật đã vào ngân hàng |
| R8 | Tin Zalo **chỉ gửi tự động đúng 1 lần** mỗi dòng (không tự retry dòng `FAILED`); gửi lại chỉ do người bấm | Mỗi tin ZBS tính phí; retry tự động = rủi ro chi phí |
| R9 | Mỗi tích hợp có **công tắc bật/tắt riêng**; tắt thì luồng thu tiền vẫn chạy bình thường (đường lùi) | Zalo/MISA hỏng không được chặn thu tiền |
| R10 | Công tắc **`issueEnabled` riêng cho "phát hành hóa đơn thật"**, tách khỏi `misa.enabled` (đã cấu hình). Hàng chờ tự động cũng phải tôn trọng | Lúc dev/test không lỡ phát hành hóa đơn thật có giá trị pháp lý |
| R11 | **Backup DB trước mọi migration/đổi dữ liệu.** Migration chỉ additive | Quy tắc dự án |

## 3. Việc ngoài code (con người làm) — khai báo, đăng ký, lấy token

Giao danh sách này cho người dùng ngay, kèm ước lượng thời gian. Cột "Chặn" = chặn go-live.

### 3.1 SePay (thời gian: ~30 phút nếu có sẵn tài khoản ngân hàng doanh nghiệp)

1. Đăng ký tài khoản tại `my.sepay.vn`, **liên kết tài khoản ngân hàng nhận tiền** (SePay đọc biến động số dư;
   mỗi ngân hàng có cách liên kết riêng qua app ngân hàng). Ghi lại: tên ngân hàng, số tài khoản, tên chủ TK.
2. Cấu hình mã thanh toán: **Cấu hình công ty → Cấu hình chung → Cấu trúc mã thanh toán**: tiền tố (ví dụ `HP`),
   hậu tố chữ + số, độ dài tối thiểu/tối đa khớp với mã bạn sinh (mục 5.1). Bật thử ở chế độ Test trước.
   **Không** bật "Chỉ gửi webhook khi có mã thanh toán" — để giao dịch sai nội dung vẫn về app dạng
   `UNMATCHED` cho kế toán xử lý tay. SePay chỉ trích mã và gửi webhook; việc khớp đơn nằm hoàn toàn trong app.
3. Thêm webhook: **Tích hợp Webhooks → Thêm webhook**:
   - URL: `https://<domain-công-khai-thật>/api/webhooks/sepay` (chốt domain **trước**; đổi domain là khai lại).
   - Sự kiện: tiền vào. Chọn đúng tài khoản ngân hàng.
   - Kiểu xác thực: **API Key** → SePay sinh/nhận một token; token này sẽ dán vào cấu hình tích hợp của app
     (secret của mục 4). SePay gửi header `Authorization: Apikey <token>`.
   - **Không dùng HMAC thuần body**: SePay không ký kiểu đó → 401 toàn bộ. (Nếu khách đòi HMAC, dùng
     `HMAC_TIMESTAMP_BODY`: header `X-SePay-Signature: sha256=<hex>` + `X-SePay-Timestamp`, ký `timestamp.body`.)
4. SePay yêu cầu phản hồi **HTTP 200/201 kèm `{"success":true}`**; nếu không, retry 7 lần trong ~33 phút. IP nguồn
   (nếu cần allowlist): 172.236.138.20, 172.233.83.68, 171.244.35.2, 151.158.108.68, 151.158.109.79,
   103.255.238.139, 45.57.137.67.
5. Tài liệu: `docs.sepay.vn/tich-hop-webhooks.html`, `developer.sepay.vn/vi/sepay-webhooks/{cau-hinh-ma-thanh-toan,xu-ly-loi,xac-thuc}`.
   Nhãn menu của giao diện SePay có thể đổi — nếu lệch, theo tài liệu trực tuyến.
6. **[CHƯA KIỂM CHỨNG]** Dự án gốc chưa chạy webhook SePay với giao dịch tiền thật đầu-cuối (đã test bằng payload
   giả + unit test). Bắt buộc chuyển thử một khoản nhỏ thật khi go-live (mục 11).

Đầu ra cần có: `bank`, `accountNumber`, `accountName`, `webhook API key`, domain.

### 3.2 MISA meInvoice (thời gian: **không xác định**, có thể vài ngày — Chặn go-live hóa đơn)

1. Có tài khoản **MISA meInvoice** chính thức của doanh nghiệp (đã phát hành hóa đơn tay được). Ghi lại:
   mã số thuế (`taxcode`), username, password đăng nhập meInvoice.
2. **Gói dịch vụ phải có API.** Khách của dự án gốc từng nói "MISA không cho dùng API" — nhiều khả năng gói chưa
   gồm API. Hỏi thẳng bộ phận kinh doanh MISA, đề nghị cấp **ClientID + ClientSecret** cho OpenAPI meInvoice
   (cổng `developer.misa.vn/products-openapi/MEINVOICE`) **và** một môi trường **sandbox** để thử.
3. Có **mẫu hóa đơn đã đăng ký/được duyệt**: ký hiệu `InvSeries` (vd `1C26TYY`; ký tự thứ 2 `C` = có mã CQT,
   `K` = không mã; ký tự đầu = mẫu số, `1` = GTGT) và `InvTemplateNo`. Lấy bằng API `GET /invoice/templates`
   (mục 7.2) sau khi có token.
4. Chốt với kế toán: **thuế suất áp cho phụ huynh/khách cá nhân** (KCT / KKKNT / 0% / 5% / 8% / 10% / `KHAC:x%`).
   Tài liệu API không quy định nghiệp vụ thuế — đây là quyết định của khách.
5. Base URL (theo tài liệu MISA): `https://developer.misa.vn/apis/itg/meinvoice` [ĐÃ KIỂM CHỨNG làm token +
   templates + unpublishview]. URL sandbox do MISA cấp riêng — **hỏi MISA, không đoán**. Sandbox và production
   dùng ClientID/Secret/MST/ký hiệu khác nhau; đổi môi trường = đổi cả bộ.
6. Token MISA hạn ~14 ngày; app tự lấy lại, không cần người thao tác.

Đầu ra cần có: `baseUrl`, `clientId`, `clientSecret`, `taxCode`, `username`, `password`, `invSeries`,
`invTemplateNo`, `taxRateLabel`.

### 3.3 Zalo OA + ZBS Template Message (thời gian: **2-3 ngày duyệt mỗi mẫu tin** — Chặn go-live Zalo)

Từ 2026, ZNS đã đổi thành **ZBS Template Message** (bắt buộc định dạng mới từ 1/3/2026). Cần ba thứ:

1. **Zalo OA** (Official Account) đã **xác thực doanh nghiệp**.
2. **App** tại `developers.zalo.me/createapp`: lấy **App ID** và **App Secret** (ở trang cài đặt App, *không*
   phải ở API Explorer). Cần quyền gửi ZBS.
3. **ZBS Account** (cổng `account.zalo.solutions`, quản lý số dư và tính phí), liên kết OA và App qua
   **ZBS → Cài đặt → Quản lý tài sản** (tab LIÊN KẾT OA / LIÊN KẾT ỨNG DỤNG, hai thao tác riêng).
   - **Một OA chỉ liên kết với đúng một ZBS Account.** Trước khi tạo/nạp tiền, vào `oa.zalo.me/manage` →
     Quản lý → Quản lý tài khoản → Quản lý liên kết → xem "Danh sách tài khoản ZBS đã liên kết". Đã có thì
     **không** tạo mới, xin quyền quản trị/nạp tiền ở chính ZBS Account đó. Nạp nhầm ví khác → vẫn lỗi `-137`.
4. **Đăng ký mẫu tin (template)** và chờ duyệt. Cần tối thiểu 2 mẫu (đặt tên tham số **đúng chính tả bạn sẽ
   code**, đổi sau khi duyệt tốn thêm 2-3 ngày):
   - *Yêu cầu thanh toán*: `order_code, ma_hoc_vien, transfer_amount, loai_hoc_phi, ten_hoc_vien`
   - *Thông báo đã thanh toán*: `date, ma_hoc_vien, loai_hoc_phi, paid_fee, lop, chi_nhanh, ten_hoc_vien`
   - Với CRM khác, đổi tên tham số theo nghiệp vụ, nhưng quy tắc giữ nguyên: **tham số kiểu "Tên khách hàng"
     tối đa 30 ký tự** — vượt là `-1121 "<tham số> data breaks max length"`. Không ghép nhiều thứ vào một tham số.
   - Mẫu ZBS **không đính kèm file, không có trường link tùy ý** trừ khi mẫu khai báo. Đừng hứa gửi PDF/link hóa đơn.
5. **Lấy Refresh Token** (không cần dựng redirect URL): `developers.zalo.me/tools/explorer` → chọn đúng App →
   "Loại access token" = **OA Access Token** → chọn OA → đăng nhập, bấm "Đồng ý" → copy **Refresh Token**.
   Hệ thống **không lưu access token tĩnh**; luôn đổi từ refresh token.
6. **Refresh token xoay vòng**: mỗi lần dùng, Zalo trả refresh token mới và token cũ chết ngay. Hệ quả:
   **mỗi môi trường (local, staging, prod) một refresh token riêng**; dùng chung = môi trường kia chết, phải lấy lại.
7. Trang `developers.zalo.me/docs/**` là SPA nặng, trình duyệt tự động hay treo — thao tác tay.

Đầu ra cần có: `appId`, `appSecret`, `oaId`, `refreshToken`, `templateIdPaymentRequest`, `templateIdInvoiceIssued`,
số dư ZBS Account đủ gửi.

## 4. Lớp nền: cấu hình tích hợp + mã hóa secret + API

Làm **trước** ba tích hợp. File tham chiếu: `cloudflare/crypto-secrets.ts`, `integration-settings.ts`,
`finance-storage.ts` (`readEffectiveIntegrationSettings`), route trong `worker.ts` (`/api/integrations*`).

### 4.1 Mã hóa secret (Web Crypto, chạy cả Node 20+ lẫn Workers; copy nguyên)

```ts
// crypto-secrets.ts — khóa dẫn xuất từ AUTH_SECRET (đã có sẵn trong app), không thêm biến môi trường mới.
const V = "v1";
async function deriveKey(master: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(master));
  return crypto.subtle.importKey("raw", d, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function encryptSecret(plain: string, master: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(master), new TextEncoder().encode(plain));
  return `${V}.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}
/** Không bao giờ throw: hỏng/đổi AUTH_SECRET → "" = coi như chưa cấu hình. */
export async function decryptSecret(cipher: string, master: string) {
  try {
    const [v, iv, ct] = cipher.split(".");
    if (v !== V) return "";
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await deriveKey(master), unb64(ct)));
  } catch { return ""; }
}
export const secretHint = (plain: string) => plain.slice(-4);
```

**Hệ quả phải ghi vào tài liệu deploy của dự án mới:** đổi `AUTH_SECRET` = mọi secret đã lưu thành rác, phải nhập
lại. Khi copy cấu hình giữa môi trường (vd prod → local để test) phải mang theo đúng `AUTH_SECRET` — và dừng dev
server cũ đang chạy `AUTH_SECRET` khác, nếu không nó sẽ ghi đè secret bằng khóa sai (đã gặp thật).

### 4.2 Mô hình cấu hình (một dòng JSON, khóa cố định)

```ts
interface IntegrationSettings {
  sepay: { webhookMode: "API_KEY" | "HMAC_TIMESTAMP_BODY" | "HMAC_BODY" | "DISABLED"; webhookSecretEncrypted?: string; webhookSecretHint?: string };
  misa:  { enabled: boolean; issueEnabled: boolean; baseUrl: string; clientId: string; clientSecretEncrypted?: string; clientSecretHint?: string;
           taxCode: string; username: string; passwordEncrypted?: string; passwordHint?: string;
           invSeries: string; invTemplateNo: string; taxRateLabel: string; invoiceFields: MisaInvoiceFields };
  zalo:  { enabled: boolean; appId: string; appSecretEncrypted?: string; appSecretHint?: string; oaId: string;
           refreshTokenEncrypted?: string; refreshTokenHint?: string; templateIdPaymentRequest: string; templateIdInvoiceIssued: string };
  updatedAt: string; updatedBy: string;
}
```

Quy tắc code:
- `mergeIntegrationSettings(current, patch, masterKey, email)`: với mỗi secret, `patch` rỗng / không gửi / bắt
  đầu bằng `•` → giữ bản cũ; ngược lại mã hóa mới + `secretHint`. Mọi chuỗi qua `text()` (không `undefined`).
- `maskIntegrationSettings()` là **dạng duy nhất** trả về client: bỏ hẳn mọi field `*Encrypted`, giữ `*Hint`.
- `readEffectiveIntegrationSettings(env)`: đọc + giải mã, trả secret plaintext **chỉ cho code phía server**.
  Secret webhook SePay lùi về biến môi trường `SEPAY_WEBHOOK_SECRET` nếu DB chưa có (đường lùi).
- Lưu cấu hình bằng compare-and-swap; xung đột → 409 "dữ liệu vừa đổi ở nơi khác, tải lại".
- Ghi audit log mỗi lần đổi nhóm cấu hình (chỉ tên nhóm, **không** ghi giá trị).
- Mặc định: `sepay.webhookMode = "API_KEY"`, `misa.enabled = misa.issueEnabled = zalo.enabled = false`.

### 4.3 API tối thiểu (chỉ ADMIN)

| Route | Việc |
|---|---|
| `GET /api/integrations` | trả `maskIntegrationSettings` |
| `PUT /api/integrations` | merge + lưu CAS + audit, trả bản mask |
| `POST /api/integrations/ping` `{provider:"misa"\|"zalo"}` | gọi `client.ping()` (chỉ lấy token) — nút "Kiểm tra kết nối". Tắt công tắc thì trả `{ok:false,message}`, không gọi mạng |
| `POST /api/integrations/misa/{templates,test-invoice,status}` | bộ thử sandbox (mục 7.5) |

UI: một thẻ cho mỗi nhà cung cấp trong Cài đặt → Tích hợp; ô secret hiện `••••<hint>`, để trống = giữ nguyên.

## 5. SePay: đối soát tiền tự động

File tham chiếu: `sepay-webhook-auth.ts`, `sepay-engine.ts` (`processBankTransaction`, `extractPaymentCode`,
`vietQrUrl`), `worker.ts` (`handleSepayWebhook`, `requestPaymentAction`), `payment-link.ts`.

### 5.1 Mã đối soát (R6) — quyết định thiết kế quan trọng nhất

- Một khoản phải thu ↔ một **`paymentCode`** duy nhất, tạo **khi chốt khoản thu**. Dùng nó cho: nội dung trong
  QR VietQR, phiếu báo, tham số `order_code` của tin Zalo, và bộ khớp webhook. **Không** sinh mã thứ hai ở đâu khác.
- Dạng mã: `<tiền tố 2 ký tự><6-10 ký tự A-Z0-9>`; dự án gốc dùng `HP` + mã lớp + mã học viên (vd `HPS6HV0077`)
  để phụ huynh/nhân viên đọc là hiểu. Tránh ký tự dễ nhầm (`0/O`, `1/I`) nếu mã ngẫu nhiên
  (bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789`).
- Bộ trích mã (copy): `String(content).toUpperCase().match(/\bHP[A-Z0-9]{6,10}\b/)`. **Độ dài regex phải bao được
  mã dài nhất bạn sinh**, và phải khớp "Cấu trúc mã thanh toán" đã khai ở SePay (3.1 bước 2). Ngân hàng hay
  dính liền/cắt nội dung → webhook ghép `content + description + code` (SePay có trường `code` riêng đã trích sẵn).
- **Mã dùng lại giữa các kỳ** (cùng học viên + lớp, nhiều tháng) → `find` lệnh `ACTIVE` đầu tiên có thể khớp nhầm
  kỳ cũ. Nếu mã lặp, khi khớp phải chọn khoản đã chốt (`frozenAt`) mới nhất hoặc khoản khớp đúng số tiền; tốt
  nhất là thêm hậu tố kỳ vào mã. (Rủi ro đã ghi nhận ở dự án gốc, chưa sửa — đừng kế thừa.)
- Khoản thu phải **chốt cứng số tiền** lúc gửi yêu cầu (`frozenAt`, `amountDue`); lúc tiền về dùng đúng số đã
  chốt, **không tính lại** (nếu tính lại, dữ liệu đổi giữa chừng → `AMOUNT_MISMATCH`).
- Trang thanh toán công khai (nếu cần link cho khách): token ngẫu nhiên 128-bit trong URL
  (`/thanh-toan/<id>/<token>`), so sánh hằng thời gian, rate limit theo IP, và **không tiết lộ khoản có tồn tại
  hay không khi sai token**. Endpoint ảnh QR nội bộ thường nằm sau đăng nhập → khách không mở được; link gửi
  ra ngoài phải trỏ trang công khai này.
- QR động: `https://img.vietqr.io/image/<bankBin>-<số TK>-compact2.png?amount=<n>&addInfo=<paymentCode>&accountName=<TÊN>`.
  `bankBin` là mã BIN 6 số (VCB 970436, MB 970422, TCB 970407, ACB 970416, BIDV 970418, ICB/VTB 970415,
  VPB 970432, TPB 970423, …). Không dùng ảnh QR tĩnh tải lên — nó không mang mã đối soát.

### 5.2 Xác thực webhook (copy; R4)

```ts
type Mode = "HMAC_BODY" | "HMAC_TIMESTAMP_BODY" | "API_KEY" | "DISABLED";
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyWebhook(a: { rawBody: string; headers: Headers; secret?: string; mode: Mode; allowDemo?: boolean }) {
  if (a.mode === "DISABLED") return a.allowDemo ? { ok: true } : { ok: false, reason: "DISABLED_NOT_ALLOWED" };
  if (!a.secret) return { ok: false, reason: "MISSING_SECRET" };                       // R4
  if (a.mode === "API_KEY") {
    const got = (a.headers.get("authorization") || "").replace(/^Apikey\s+/i, "").trim();
    return got && safeEq(got, a.secret) ? { ok: true } : { ok: false, reason: "INVALID_API_KEY" };
  }
  const sig = (a.headers.get("x-sepay-signature") || a.headers.get("x-signature") || "").replace(/^sha256=/i, "").toLowerCase();
  const ts = a.headers.get("x-sepay-timestamp") || a.headers.get("x-timestamp");
  if (a.mode === "HMAC_TIMESTAMP_BODY") {
    if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { ok: false, reason: "BAD_TIMESTAMP_OR_SIG" };
    return safeEq(await hmacHex(a.secret, `${ts}.${a.rawBody}`), sig) ? { ok: true } : { ok: false, reason: "INVALID_SIGNATURE" };
  }
  return safeEq(await hmacHex(a.secret, a.rawBody), sig) ? { ok: true } : { ok: false, reason: "INVALID_SIGNATURE" };
}
```

Sai/thiếu xác thực → ghi một dòng `webhookLogs` `REJECTED` (để có vết điều tra) rồi trả 401. Đọc `rawBody` bằng
`request.text()` **trước** khi parse JSON (HMAC cần byte gốc).

### 5.3 Handler webhook (khung; theo `handleSepayWebhook`)

Payload SePay (theo tài liệu SePay) có: `id`, `gateway`, `transactionDate`, `accountNumber`, `code`, `content`,
`transferType` (`in`/`out`), `transferAmount`, `accumulated`, `referenceCode`, `description`. Code gốc đọc rộng
rãi cả camelCase lẫn snake_case.

```
POST /api/webhooks/sepay
1. raw = await request.text(); settings = readEffectiveIntegrationSettings()
2. verifyWebhook(...) — fail → appendRejectedLog + 401 {"error":"INVALID_SIGNATURE"}
3. payload = JSON.parse(raw) (lỗi → 400); txId = String(payload.id || payload.referenceCode || ...) ; rỗng → 400
4. LOOP attempt 0..2:
     snapshot = read(); duplicate = đã có bankTransaction {provider:"SEPAY", providerTransactionId: txId}
     ghi webhookLogs (≤ 200 dòng gần nhất): ACCEPTED | DUPLICATE
     nếu !duplicate:
        tx = { status:"RECEIVED", transferType, transferAmount: Math.round(Number(...)), content: [content, description, code].join(" ") }
        match = processBankTransaction(ledger, tx)      // thuần túy, không I/O
        nếu match.event == "TuitionPaymentCompleted": chạy nghiệp vụ kích hoạt (mục 9)
            ERROR  → đánh tx NEEDS_REVIEW + reviewReason, vẫn ghi sổ (R7)
            ALREADY_ACTIVATED → giữ nguyên
     if compareAndSwap(snapshot, next): 
         ghi audit; xếp tin Zalo "đã thanh toán" (nếu khớp đủ); 
         void processZaloOutbox().then(processInvoiceOutbox).catch(()=>{})   // KHÔNG await (R1)
         return 200 {"success":true,"ok":true, duplicate?:true}
     snapshot = read()   // xung đột → thử lại
5. hết lượt → 409 {"error":"CONFLICT"}  (SePay sẽ retry)
```

`processBankTransaction` (thuần, test dễ) phân loại: `IGNORED` (tiền ra) · `UNMATCHED/NO_PAYMENT_CODE` ·
`UNMATCHED/UNKNOWN_PAYMENT_CODE` · `NEEDS_REVIEW/ALREADY_PAID` (mã có nhưng lệnh không còn ACTIVE) ·
`NEEDS_REVIEW/INVALID_RECEIVABLE` · `DUPLICATE` · thiếu/thừa tiền tuân theo cờ `autoPartial` (mặc định bật) /
`autoOverpayment` (mặc định **tắt** → chờ người xử lý) · đủ tiền → `ALLOCATED` + `payment`+`receipt`+`credit`(nếu
thừa)+`invoice PENDING`(theo cờ `autoInvoiceExact/Partial/Overpayment`). Chỉ **khớp đủ** mới phát `event`.

### 5.4 Trạng thái cần có trong DB (tối thiểu)

`receivables` (id, studentId, billingPeriod, amountDue/Paid/balanceDue, status OPEN/PARTIALLY_PAID/PAID/OVERPAID/
CANCELLED, `paymentOrderId`, `frozenAt`, `publicToken`, `classId`/`billKey` nếu cần) · `payment_orders`
(`paymentCode` **unique-ish**, amount, status ACTIVE/PAID/EXPIRED/CANCELLED) · `bank_transactions`
(`provider`+`providerTransactionId` **unique**, status, reviewReason, content) · `payments` · `receipts` ·
`invoices` · `credits` · `webhook_logs`. Nếu CRM mới dùng DB quan hệ chuẩn thì **unique index
(`provider`,`providerTransactionId`)** là hàng rào idempotent cuối cùng, đừng chỉ dựa vào đoạn code kiểm tra.

## 6. Zalo ZBS Template Message

File tham chiếu: `zalo-zbs-client.ts`, `zalo-outbox.ts`, `phone-format.ts`, `zalo-tuition-label.ts`,
`zalo-webhook-auth.ts`, `storage/zalo-message-repository.ts`.

### 6.1 Client — endpoint & luồng token [ĐÃ KIỂM CHỨNG production 2026-09-28: refresh + gửi + nhận `msg_id`]

| Việc | Gọi |
|---|---|
| Đổi refresh → access token | `POST https://oauth.zaloapp.com/v4/oa/access_token`, `Content-Type: application/x-www-form-urlencoded`, body `app_id`, `grant_type=refresh_token`, `refresh_token`, `secret_key` (code gốc gửi `secret_key` cả ở header lẫn body — nguồn tài liệu không thống nhất; thử chỉ body trước, dư thì bỏ) |
| Gửi tin theo SĐT | `POST https://business.openapi.zalo.me/message/template`, header `access_token: <token>`, JSON `{ phone, template_id, template_data }` |
| Thành công | `{ error: 0, message, data: { msg_id, sent_time } }` |

```ts
// Cache access token theo expires_in API trả về (nguồn ghi 1h hoặc ~25h — KHÔNG hardcode), trừ hao 5 phút.
// Response có refresh_token MỚI mỗi lần → gọi onTokenRotated(next) để LƯU NGAY (không lưu = tích hợp chết sau vài giờ).
// Lượt lưu là một CAS ngắn trên khối cấu hình, nằm ngoài cửa sổ ghi tài chính.
// 401 → xóa cache token, retryable. Lỗi retryable: HTTP 408/429/5xx và error -124 (quá tần suất).
// Mọi hàm trả { ok:true,... } | { ok:false, retryable, code, message }; KHÔNG throw; timeout cứng 20s (AbortController).
```

Lỗi thường gặp: `-137 "ZBS Account charge failure"` = hết số dư **hoặc** ví nạp không phải ZBS Account đang liên kết
(3.3.3) → kiểm tra số dư ở `account.zalo.solutions` trước, rồi kiểm tra liên kết. `-1121` = tham số quá 30 ký tự.

### 6.2 Số điện thoại — gửi nhầm số là lộ thông tin tiền học cho người lạ

`toZaloPhone(raw): string | null`: bỏ khoảng trắng/`.`/`-`/`()`; nhận `0xxxxxxxxx`, `+84…`, `84…`, `xxxxxxxxx` (9 số);
**kiểm đầu số di động VN** (32-39, 52, 55, 56, 58, 59, 70, 76-79, 81-86, 87, 88, 89, 90-94, 96-99); sai → `null`,
**không đoán**. Kết quả dạng `84xxxxxxxxx`. Dòng log vẫn tạo nhưng `FAILED` + `INVALID_PHONE` để nhân viên thấy.
**[CHƯA KIỂM CHỨNG]** chưa đối chiếu với phân bố SĐT thật trong CSDL — chạy thống kê định dạng trước khi bật.
Gửi tới SĐT nào (cha/mẹ) là quyết định nghiệp vụ; dự án gốc chốt chỉ `parentPhone1`.

### 6.3 Outbox tin nhắn (bảng `zalo_message_logs`)

Cột chính: `id, kind (PAYMENT_REQUEST|INVOICE_ISSUED), receivableId?, invoiceId?, studentId, phone, rawPhone,
templateId, status (QUEUED|PROCESSING|SENT|FAILED|DELIVERED), processingAt, providerMsgId, providerSentTime,
errorCode, errorMessage, templateData(JSON text), snapshot tên/mã/lớp, attemptCount, lastAttemptAt, sentAt,
deliveredAt, webhookAt, webhookPayload, requestedBy, createdAt`. **Khóa duy nhất (kind, receivableId, invoiceId)**
→ chống gửi trùng ở tầng DB.

`enqueue()` — không throw, không chặn luồng thu tiền: tắt `zalo.enabled` → không tạo dòng; chưa có `templateId`
cho loại tin → không tạo; SĐT sai → tạo dòng `FAILED/INVALID_PHONE`; đã có dòng → `DUPLICATE` (trừ khi
`resend:true` do người bấm → reset dòng cũ về `QUEUED`, vẫn dùng lại **đúng dòng cũ**). Trả kết quả có kiểu để UI
báo đúng ("đã xếp"/"trùng"/"tắt"/"chưa có mẫu") thay vì luôn báo "đã gửi".

`process()` theo R1 + R8: chọn dòng `QUEUED` (cứu `PROCESSING` kẹt > 10 phút về `QUEUED`) → đánh `PROCESSING` →
**ngoài transaction** dựng `template_data` từ dữ liệu hiện tại + gọi `sendTemplate` → đọc lại, ghi `SENT`/`FAILED`
**kèm đúng `templateData` đã gửi** (để xem lại nội dung phụ huynh nhận, cả khi lỗi). Cờ `outboxRunning` cấp module
chặn chạy chồng. Chỉ lấy `QUEUED`, không lấy `FAILED` (R8). Nút "Gửi lại" ở trang nhật ký đặt `FAILED → QUEUED`.

### 6.4 `template_data`

Tên khóa phải **trùng từng ký tự** với tham số khai khi tạo mẫu (xem trang chi tiết mẫu ở `account.zalo.solutions`,
mục "Tham số"; đừng suy từ tên mẫu). Giá trị đều là **chuỗi** (số tiền gửi `String(15000)`, không dấu phẩy/"đ").
Ngày `dd/MM/yyyy` theo múi `Asia/Ho_Chi_Minh`. Cắt/diễn đạt ngắn để mỗi tham số "tên" ≤ 30 ký tự
(vd `loai_hoc_phi` = `Theo tháng 01/09/26-30/09/26`, năm 2 số để ≤ 28 ký tự).

### 6.5 Webhook callback trạng thái tin (`POST /api/webhooks/zalo`) — [CHƯA KIỂM CHỨNG]

Code gốc: header `x-zevent-signature` = hex của `HMAC-SHA256(appSecret, appId + rawBody + timestamp)` (timestamp
header `x-zevent-timestamp`) — **suy luận từ quy ước webhook OA, chưa nhận callback thật nào**. Secret rỗng →
`MISSING_SECRET`. Khớp `msg_id` → đặt dòng log `DELIVERED`, lưu `webhookPayload` (cắt 4000 ký tự). Payload lạ vẫn
trả 200 (đừng để Zalo bắn lại vô hạn), nhưng chữ ký sai/thiếu luôn 401. Đây là phần **không bắt buộc** cho luồng
gửi tin; bật sau khi đã quan sát callback thật và đối chiếu header/công thức.

## 7. MISA meInvoice

File tham chiếu: `misa-invoice-client.ts`, `misa-invoice-payload.ts`, `misa-invoice-fields.ts`,
`misa-invoice-input.ts`, `misa-invoice-draft.ts`, `misa-invoice-routes.ts`, `invoice-outbox.ts`.

### 7.1 API (luồng "phát hành lên cloud", ký HSM, không cần USB) — Base URL = `config.baseUrl`

| API | Gọi | Trạng thái |
|---|---|---|
| Token | `POST /invoice/token`, header `ClientID`, `ClientSecret`; body `{taxcode, username, password}` → `Data` = token | [ĐÃ KIỂM CHỨNG] |
| Mẫu hóa đơn | `GET /invoice/templates?invoiceWithCode={true\|false}&ticket=false&year=YYYY` (gọi cả true và false) | [ĐÃ KIỂM CHỨNG sandbox] |
| Xem trước (nháp) | `POST /invoice/unpublishview` body = `InvoiceData` → `Data` = link xem (sống 5 phút, **không** tạo hóa đơn/số/gửi thuế) | [ĐÃ KIỂM CHỨNG sandbox] |
| Phát hành | `POST /invoice/publishing` body `{ SignType: 2, InvoiceData: [data], PublishInvoiceData: null }` → `publishInvoiceResult[0]` có `TransactionID, InvNo, InvSeries, InvCode, InvDate` hoặc `ErrorCode` | **[CHƯA có bằng chứng phát hành thật thành công trong repo]** — thử ở sandbox trước |
| Tra trạng thái | `POST /invoice/status?inputType={1=TransactionID\|2=RefID}&invoiceWithCode=..&invoiceCalcu=..` body = mảng id | dựng theo tài liệu |
| Tải PDF/XML | `POST /invoice/Download?downloadDataType={Pdf\|Xml}&invoiceWithCode=..&invoiceCalcu=..` body `[transactionId]` → base64 | dựng theo tài liệu |

Mọi API nghiệp vụ gửi header `Authorization: Bearer <token>`, `ClientID`, `ClientSecret`. Quy tắc đọc phản hồi
(MISA viết lúc PascalCase lúc camelCase, `Data` có khi là chuỗi JSON): đọc field **không phân biệt hoa/thường**
(`field(obj,"Success")`) và `parseMaybeJson()` cho `Data`. Thành công = HTTP ok **và** `Success === true`.
`401` → xóa cache token, `retryable`. Token cache theo khóa `[baseUrl, clientId, taxCode, username]` (đổi
sandbox↔production không dùng nhầm token), hạn cache 12h. `invoiceWithCode` = ký tự thứ 2 của `invSeries` ≠ `K`;
`invoiceCalcu` = ký tự thứ 5 là `M` (máy tính tiền).

Lỗi retryable do MISA khuyến nghị gửi lại: `InvoiceNumberNotCotinuous`, `SystemError` (+ HTTP 408/429/5xx).
**`InvoiceDuplicated` (trùng `RefID`)** thường là lần gửi trước đã phát hành xong nhưng mất phản hồi: **tra
`/invoice/status` theo RefID (`inputType=2`) và nhận lại hóa đơn đó**, đừng báo lỗi hay phát hành lại.
`RefID` = id nội bộ của hóa đơn (chống phát hành trùng).

### 7.2 Dựng `InvoiceData` (hàm thuần `buildMisaInvoiceData`) — copy logic này

- Một dòng dịch vụ (`ItemType:1`, `Quantity:1`). **Số tiền khách trả là tổng ĐÃ gồm thuế**; tách ngược:
  `withoutVat = percent>0 ? round(amount*100/(100+percent)) : amount`, `vat = amount - withoutVat` (để tổng luôn
  khớp đúng tiền đã thu). VND làm tròn đồng; `OptionUserDefined` khai 0 chữ số thập phân.
- Thuế suất hợp lệ (parse từ chuỗi cấu hình): `KCT`, `KKKNT`, `0%`, `5%`, `8%`, `10%`, `KHAC:x%`. Sai → lỗi
  `INVALID_TAX_RATE`, không gọi mạng.
- `InvDate` = ngày hôm nay **theo giờ Việt Nam** (server có thể chạy UTC); MISA không cho ngày lùi sau hóa đơn đã
  phát hành. `InvTemplateNo` rỗng thì lấy ký tự đầu của `invSeries`. `PaymentMethodName` mặc định `TM/CK`.
- Trường chính: `RefID, InvSeries, InvTemplateNo, InvDate, CurrencyCode:"VND", ExchangeRate:1, IsInvoiceSummary:false,
  BuyerFullName, BuyerLegalName?, BuyerTaxCode, BuyerAddress, BuyerEmail, BuyerPhoneNumber, BuyerIDNumber,
  TotalSaleAmount(OC), TotalDiscountAmount(OC)=0, TotalAmountWithoutVAT(OC), TotalVATAmount(OC), TotalAmount(OC),
  OriginalInvoiceDetail:[{ItemName(≤500), UnitName, Quantity:1, UnitPrice, Amount(OC), AmountWithoutVAT(OC), VATRateName,
  VATAmount(OC), DiscountRate:0...}], TaxRateInfo:[{VATRateName, AmountWithoutVATOC, VATAmountOC}]`. `TotalAmountInWords`
  để trống (MISA tự đọc chữ). Có email người mua → `IsSendEmail:true`, `ReceiverEmail`, `ReceiverName` (MISA tự gửi).
- **Ràng buộc người mua (lỗi thật từ MISA):** có `BuyerTaxCode` thì **bắt buộc** `BuyerLegalName` ("Khi có
  [BuyerTaxCode] thì [BuyerLegalName] không được rỗng", kể cả mã là CCCD 12 số → thiếu thì lấy tên người mua) và
  bắt buộc `BuyerAddress`. Không gửi `BuyerCode` (MISA tra danh mục khách và tự điền "Tên đơn vị").
- Hai mẫu người mua (`resolveMisaBuyer`) — quy tắc đã chốt với kế toán dự án gốc, **hỏi lại khách của dự án mới**:
  có MST nhập tay → hóa đơn đơn vị; đủ **tên + địa chỉ + CCCD/MST** → mẫu có thông tin (số điền vào `BuyerTaxCode`);
  thiếu một trong ba → mẫu không thông tin: tên cố định `"Khách hàng chưa cung cấp thông tin"`, không gửi địa chỉ/số/SĐT.
  MST hợp lệ: 10 số, 12 số (CCCD), hoặc 13 số ghi `0101243150-733`. Trường CCCD in trên hóa đơn phụ thuộc **mẫu**
  (mẫu cơ bản `1C26TYY` không có ô CCCD, mẫu `1C26TTT` có) — kiểm bằng xem trước, không suy diễn.
- Thông số hóa đơn chỉnh được ở UI, lưu trong `misa.invoiceFields` (không cần migration): mẫu tên dòng hàng với biến
  `{period}{studentName}{studentCode}{parentName}{className}`, đơn vị tính, hình thức thanh toán, nguồn tên người mua.
  Mọi nơi đọc đi qua `normalizeMisaInvoiceFields()` để bản lưu cũ thiếu field vẫn chạy.

### 7.3 Luồng duyệt trước khi xuất (R10)

1. Khớp tiền (webhook) hoặc thu tay chuyển khoản → tạo hóa đơn `PENDING`, **chưa** `approvedAt`.
2. (Tùy chọn) dựng nháp tự động bằng `unpublishview`: lưu `previewHash` = SHA-256 của `InvoiceInput` (bỏ `refId`),
   báo sớm lỗi MISA vào `lastError` (tiền tố `"Nháp MISA: "`), **không** đặt `approvedAt`. Chỉ ghi nếu hóa đơn vẫn
   còn `PENDING` và chưa duyệt sau khi gọi mạng xong.
3. Kế toán mở phiếu, xem nháp (sửa tên/MST/địa chỉ/email nếu cần → xem lại), bấm **Xuất**: server chỉ chấp nhận khi
   hash nội dung hiện tại **khớp** `previewHash`; rồi đặt `approvedAt` và chạy outbox ngay.
4. `processInvoiceOutbox()`: chỉ lấy hóa đơn `PENDING|FAILED` **đã `approvedAt`**, `retryCount < 5`; đánh `PROCESSING`
   (cứu kẹt > 10 phút) → gọi `publishInvoice` ngoài transaction → ghi `ISSUED` (`invoiceNumber, invoiceSeries,
   lookupCode, providerInvoiceId, taxAuthorityCode, issuedAt`) hoặc `FAILED` (+`lastError`; lỗi **không retryable** →
   đặt `retryCount` = 5 để dừng tự thử, chờ người sửa rồi bấm "Phát hành lại"). Bỏ qua hoàn toàn khi
   `!misa.enabled || !misa.issueEnabled`. Dùng chung `buildMisaInvoiceInput` cho bản xem trước và bản phát hành để
   hai bên luôn ra cùng nội dung (và hash khớp).
5. Tải PDF: proxy `/invoice/Download`, **không lưu file**; xác thực quyền kế toán/ADMIN.
6. Hoàn tác hóa đơn xuất nhầm phía LMS = **xóa dòng hóa đơn** (sau backup), không set null cột rồi giữ dòng
   (UI/outbox sẽ hiểu sai); hóa đơn thật trên MISA phải hủy/điều chỉnh trên portal MISA.

### 7.4 Phân quyền

Xem trước/xuất/tải PDF: ADMIN + kế toán. Bộ thử sandbox và cấu hình: chỉ ADMIN. Webhook: nội bộ `system` actor khi ghi audit.

### 7.5 Bộ thử sandbox (nên có, rất đáng công)

`/api/integrations/misa/templates` (lấy ký hiệu, điền vào form), `/test-invoice` (`mode:"preview"` mặc định,
`"publish"` tạo hóa đơn thật trên môi trường Base URL đang trỏ tới, **không ghi vào sổ**), `/status`. Trước khi
chuyển production: chạy preview + publish thử ở sandbox, tải PDF, tra trạng thái.

## 8. Mẫu outbox dùng chung (MISA và Zalo giống nhau)

```
enqueue(ghi dòng QUEUED/PENDING, idempotent) ── không gọi mạng
process():
  if (running) return; running = true            // cờ cấp module, chống chạy chồng
  cfg = readEffectiveSettings(); if (!enabled) return
  ids = claimBatch()        // CAS: cứu PROCESSING quá 10' → QUEUED/PENDING; chọn ≤10; đánh PROCESSING + processingAt
  results = for each: gọi nhà cung cấp (NGOÀI transaction)
  applyResults(ids, results)// CAS retry 3 lần; chỉ sửa đúng dòng trong lô; xóa processingAt
Kích hoạt: ngay sau webhook/thu tay (void, không await) + setInterval vài phút để quét dòng kẹt/đến hạn.
```

Chạy `setInterval` trong tiến trình server (dự án gốc một tiến trình duy nhất nên cờ module đủ; nhiều instance →
cần khóa phân tán hoặc `SELECT ... FOR UPDATE SKIP LOCKED`).

## 9. Ánh xạ sang CRM khác — chỗ nào cần sửa

| Khái niệm STEPS | Thay bằng ở CRM mới |
|---|---|
| Học viên + phụ huynh (`parentPhone1`, `parentName`, `nationalId`, `address`, email) | Khách hàng/người đóng tiền: SĐT nhận Zalo, tên, địa chỉ, MST/CCCD, email |
| Khoản phải thu theo lớp/tháng/khóa, `billKey` | Đơn hàng/hóa đơn bán/hợp đồng/đợt thu của CRM |
| `activateSessionsForPayment` (cộng buổi, `tuitionPaidThrough`) | **Hook "sau khi tiền về"** của CRM: đánh dấu đã thanh toán, mở dịch vụ, gia hạn… Phải **idempotent** (chạy 2 lần không cộng 2 lần — STEPS kiểm bằng biên lai đã có `classId`) và trả `OK / ERROR(reviewReason) / ALREADY_ACTIVATED` |
| `tuitionCollectionCharge` (số tiền chốt) | Hàm tính số tiền phải thu — dùng **một** hàm cho cả báo giá, khoản phải thu và kiểm tra lúc tiền về |
| Tên tham số mẫu ZBS (`ma_hoc_vien`, `lop`…) | Theo mẫu tin của khách (mục 3.3.4), sửa `buildTemplateData` tương ứng |
| Mẫu tên dòng hàng hóa đơn "Học phí {period} - {studentName}" | Biến/mẫu của khách |
| Lưu trữ khối JSON + bảng quan hệ `Ops*` | Dùng DB/ORM sẵn có của CRM; giữ **các ràng buộc unique** ở mục 5.4/6.3 |

Nếu CRM không dùng lược đồ "khối JSON + compareAndPut" như dự án gốc: thay `persistIfUnchanged` bằng transaction
`SERIALIZABLE`/khóa dòng/`version` cột (optimistic lock) — **yêu cầu ngữ nghĩa giữ nguyên** (R1, R2).

## 10. Kiểm thử

Viết test **trước**, rồi chạy bằng payload giả; sau đó mới tới tiền thật.

1. **Thuần (unit):** `extractPaymentCode` (mã dính liền chữ, mã dài nhất bạn sinh, chữ thường, có dấu cách);
   `processBankTransaction` đủ các nhánh ở 5.3; `verifyWebhook` 4 chế độ + secret rỗng; `buildMisaInvoiceData`
   (tách thuế, tổng khớp, MST thiếu địa chỉ, thuế sai); `toZaloPhone` (mọi dạng + số không hợp lệ);
   `resolveMisaBuyer` hai mẫu; `encrypt/decrypt` round-trip + khóa sai → `""`.
2. **Tích hợp có mock mạng:** webhook trùng id → `duplicate`, không ghi hai lần; 2 webhook song song → CAS không
   mất dữ liệu; nghiệp vụ kích hoạt lỗi → `NEEDS_REVIEW` mà vẫn 200; outbox: chọn lô, kẹt `PROCESSING` được cứu,
   `FAILED` Zalo không tự gửi lại; công tắc tắt → không gọi mạng.
3. **Giả lập webhook SePay (local, đúng chế độ API_KEY):**

```bash
curl -sS -X POST http://localhost:3000/api/webhooks/sepay \
  -H "Authorization: Apikey $SEPAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"id":99001,"transferType":"in","transferAmount":2000,"accountNumber":"<STK>","content":"HPS6HV0077 chuyen khoan","code":"HPS6HV0077","transactionDate":"2026-10-02 09:00:00"}'
# gọi lần 2 cùng id → {"success":true,"ok":true,"duplicate":true}
# bỏ header Authorization → 401 INVALID_SIGNATURE
```

4. **Nhà cung cấp thật, theo thứ tự rủi ro tăng dần:** (a) `ping` MISA/Zalo ở màn cấu hình; (b) MISA
   `templates` → `unpublishview` ở sandbox; (c) MISA `publishing` ở sandbox + `Download` PDF + `status`; (d) Zalo gửi
   một tin tới SĐT nội bộ (kiểm tra `msg_id`, số dư ZBS giảm); (e) chuyển khoản thật số tiền nhỏ qua SePay →
   kiểm tra cả chuỗi: sổ → buổi/dịch vụ → tin Zalo "đã thanh toán" đến **trước** → hóa đơn `PENDING` chờ duyệt.
5. Verify cuối: `tsc --noEmit`, toàn bộ test, lint không tăng lỗi so với baseline.

## 11. Checklist go-live

- [ ] Domain công khai chốt, khai đúng ở SePay (webhook URL) và (nếu dùng) Zalo callback. Máy chủ phục vụ thật
      là máy nào — webhook chỉ trỏ được về một URL, **không có đường lùi cho tiền đã đối soát trên máy sai**.
- [ ] `AUTH_SECRET` production đặt và **không đổi** sau khi đã lưu secret tích hợp.
- [ ] `ALLOW_DEMO_LOGIN` (hoặc cờ demo tương đương) **tắt** — nếu bật, xác thực webhook `DISABLED` được phép.
- [ ] SePay: API Key đã dán vào cấu hình; "Chỉ gửi webhook khi có mã" **tắt**; mã thanh toán khớp regex.
- [ ] MISA: Base URL, ClientID/Secret, MST, tài khoản, `invSeries`, `invTemplateNo`, thuế suất = bộ **production**;
      `misa.enabled` bật; `issueEnabled` **chỉ bật** sau khi kế toán đã xem bản nháp thật và đồng ý.
- [ ] Zalo: OA xác thực, ZBS Account đúng + đủ số dư, 2 mẫu đã duyệt và `templateId` đã dán, refresh token **riêng cho
      môi trường này**; thống kê định dạng SĐT đã chạy.
- [ ] Backup DB trước migration; migration additive; có cách lùi (tắt công tắc `misa.enabled` / `zalo.enabled` —
      luồng thu tiền không ảnh hưởng).
- [ ] Một giao dịch thật số tiền nhỏ chạy trọn chuỗi (mục 10.4e) và được đối chiếu sổ.
- [ ] Giao diện kế toán có chỗ xử lý `UNMATCHED / NEEDS_REVIEW` (đã chuyển nhưng sai nội dung, thiếu, thừa).
- [ ] Giao diện cần làm mới/tải lại để thấy tiền về (dự án gốc không tự refresh) — quyết định có làm polling không.

## 12. Bẫy đã gặp thật (đừng lặp lại)

1. **Hai lược đồ mã thanh toán** → webhook không bao giờ khớp (R6). Thống nhất mã từ ngày đầu.
2. Khoản phải thu cũ giữ mã cũ khi đổi công thức mã → phải **ghi đè mã của các khoản ACTIVE** khi gửi yêu cầu
   (và migrate các lệnh ACTIVE hiện có, sau backup; không đụng lệnh đã PAID).
3. `verifySignature` "secret rỗng → true" (R4). Vá khi review đầu tiên.
4. Ghi tài chính trần không CAS ở webhook, trong khi đường thu tay có CAS (R2). Cả hai đường phải dùng chung cơ chế.
5. App có **code chết cùng tồn tại** (dự án gốc: `src/` Next.js không chạy production, app thật là `cloudflare/`) —
   scout nhầm chỗ thì tích hợp nhầm chỗ. Xác minh entrypoint đang deploy trước khi sửa.
6. Webhook "mô phỏng thanh toán" / "reset khoản thu" dành cho demo mà không chặn quyền → học viên tự đánh dấu
   đã trả. Production không được có công cụ giả lập; nếu giữ thì chỉ ADMIN + cờ demo.
7. Mẫu ZBS đổi tên tham số / vượt 30 ký tự (`-1121`); ví ZBS sai/hết tiền (`-137`); refresh token dùng chung hai
   môi trường (chết lẫn nhau); đổi `AUTH_SECRET` làm rác secret; dev server cũ ghi đè secret bằng khóa cũ.
8. MISA: có MST mà thiếu `BuyerLegalName`/địa chỉ; ngày hóa đơn theo UTC; `InvoiceDuplicated` xử lý như lỗi cứng
   thay vì tra lại theo `RefID`; mẫu hóa đơn không có ô CCCD nên không in dù đã gửi trường.
9. Thiếu/thừa tiền: mặc định thiếu → tự khớp từng phần nhưng lần bù sau lệch `AMOUNT_MISMATCH`; thừa mặc định chờ tay.
   Không hứa "tự xử lý mọi trường hợp" — chốt chính sách với khách (xem mục 14).
10. Ghi hai bước không nguyên tử (sổ tài chính ghi trước, số dư khách ghi sau): bước hai lỗi + SePay retry bị coi
    trùng. Nếu CRM có DB quan hệ, đặt cả hai trong **một transaction**.

## 13. Bản đồ file tham chiếu (repo STEPS LMS)

| Chủ đề | File |
|---|---|
| Mã hóa + cấu hình | `cloudflare/crypto-secrets.ts`, `integration-settings.ts`, `finance-storage.ts`, `storage/integration-settings-repository.ts` |
| SePay | `cloudflare/sepay-engine.ts`, `sepay-webhook-auth.ts`, `payment-link.ts`, `worker.ts` (`handleSepayWebhook`, `requestPaymentAction`, `collectTuitionAction`) |
| Nghiệp vụ sau tiền về | `cloudflare/tuition-billing.ts` (`activateSessionsForPayment`, `studentTuitionPaymentCode`) |
| MISA | `cloudflare/misa-invoice-{client,payload,fields,input,draft,routes}.ts`, `invoice-outbox.ts` |
| Zalo | `cloudflare/zalo-{zbs-client,outbox,webhook-auth,tuition-label}.ts`, `phone-format.ts`, `storage/zalo-message-repository.ts` |
| Schema | `prisma/schema.prisma` (`OpsSepay*`, `OpsIntegrationSetting`, `OpsZaloMessageLog`) |
| Test mẫu | `tests/sepay-{matching,webhook-auth}.test.ts`, `misa-invoice*.test.ts`, `zalo-{zbs,outbox,webhook-auth}.test.ts` |
| Vận hành | `docs/DEPLOY.md` (mục MISA, Zalo, quy trình thu tay), `plans/260922-0846-tich-hop-sepay-misa-zalo/`, `plans/handoffs/handover-sepay.md` |

## 14. Chưa kiểm chứng / câu hỏi mở (hỏi người dùng, đừng tự quyết)

1. MISA `/invoice/publishing` chưa có bằng chứng phát hành thật thành công; giả định 1 lời gọi `SignType:2` làm
   cả tạo + ký + phát hành. Xác nhận ở sandbox. URL sandbox cụ thể: hỏi MISA.
2. Webhook callback Zalo: tên header/công thức chữ ký còn là suy luận.
3. SePay đầu-cuối bằng tiền thật chưa chạy trong dự án gốc; trạng thái webhook trên production lúc viết chưa xác nhận.
4. `SEPAY_API_TOKEN` trong `.env.example` của dự án gốc **không được dùng** ở đâu — nếu muốn gọi API SePay
   (tra giao dịch, QR do SePay sinh `qr.sepay.vn`) thì đó là việc mới, chưa có mã tham chiếu.
5. Chính sách nghiệp vụ cần khách chốt: thuế suất cho khách cá nhân; chuyển **thiếu/thừa** có tự xử lý không (và
   thừa thành `credit` ai dùng); một khoản trả nhiều lần → mỗi lần một hóa đơn hay gộp; tiền mặt có gửi Zalo không;
   gửi Zalo tới SĐT nào; có gửi link/PDF hóa đơn không (mẫu ZBS phải khai trường link).
6. Chi phí ZBS theo tin (VND/tin) chưa tra cứu — cần cho ước tính vận hành.
7. Có nhiều instance server không? Nếu có, cờ `outboxRunning` cấp module không đủ (mục 8).
