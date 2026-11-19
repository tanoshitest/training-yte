# Phase 2 — Migration schema: cấu hình tích hợp, cột hóa đơn, log tin Zalo

**Phụ thuộc:** Phase 1
**Ước lượng:** 6h
**Sở hữu file:** `prisma/schema.prisma`, `prisma/migrations/**`,
`cloudflare/integration-settings.ts` (mới),
`cloudflare/storage/integration-settings-repository.ts` (mới),
`cloudflare/storage/zalo-message-repository.ts` (mới),
`cloudflare/storage/finance-repository.ts`, `cloudflare/storage/relational-kv.ts`,
`cloudflare/sepay-engine.ts` (chỉ thêm field optional vào interface),
`tests/relational-storage.test.ts`, `docs/DEPLOY.md`

## Bối cảnh

Ba thứ chưa có chỗ lưu:

1. **Cấu hình tích hợp.** `SepaySettings` (`sepay-engine.ts:18-30`) chỉ có thông tin tài khoản nhận
   tiền và sáu cờ tự động. Bí mật webhook SePay đọc từ `env.SEPAY_WEBHOOK_SECRET`
   (`worker.ts:77`, gán ở `vps-server.ts:185`); MISA và Zalo chưa có gì.
2. **Cột hóa đơn cho MISA.** `OpsSepayInvoice` (`prisma/schema.prisma`, model bắt đầu ngay sau
   `OpsSepayReceipt`, map bảng `sepay_invoices`) có `invoiceNumber`, `invoiceSeries`, `lookupCode`,
   `amount`, `buyerName`, `status`, `retryCount`, `lastError`, `createdAt`, `issuedAt`. Thiếu:
   `buyerTaxCode`, `buyerAddress`, `buyerEmail`, `pdfUrl`, `xmlUrl`, `providerInvoiceId`,
   `taxAuthorityCode`.
3. **Log gửi tin Zalo.** Không có model nào. `sepay_webhook_logs` chỉ dành cho webhook SePay.

Cơ chế kho là "khối JSON dựng từ bảng quan hệ": mỗi khối đăng ký một `BlockRepository` trong
`blockRepositories` (`cloudflare/storage/relational-kv.ts:29-40`), đọc bằng một câu `$queryRaw`
(mẫu: `finance-repository.ts:104-112`), ghi bằng `syncTables` diff toàn bảng
(`finance-repository.ts:536-542`). Ghi có `compareAndPut` so sánh nguyên chuỗi JSON
(`relational-kv.ts:154-170`).

**Hệ quả cần nhớ (R11):** field nào không được map ở **cả hai chiều** sẽ biến mất lặng lẽ khi có
lượt ghi tiếp theo, không lỗi, không cảnh báo.

## File cần đọc trước

- `prisma/schema.prisma` — các model `OpsSepaySetting`, `OpsSepayInvoice`, `OpsSepayReceipt`,
  `OpsStudent`
- `cloudflare/storage/relational-kv.ts:23-45` (đăng ký repository), `:96-172` (bộ định tuyến khoá)
- `cloudflare/storage/settings-repository.ts` — mẫu repository nhỏ, một dòng cấu hình khoá cố định
- `cloudflare/storage/finance-repository.ts` — mẫu repository lớn, map hai chiều
- `cloudflare/storage/relational-table-sync.ts` — `syncTables`, `Row`, `RowDelegate`
- `tests/relational-storage.test.ts` và script `npm run test:storage` (`package.json:35`)
- `docs/DEPLOY.md` mục sao lưu và mục `prisma migrate deploy`

## Các bước

### Bước 0 — Backup trước khi migrate

Bắt buộc, theo rule dự án. Chạy trước cả lần `prisma migrate dev` đầu tiên trên máy cục bộ:

```
ssh root@163.61.72.30 "docker exec vsteps-postgres pg_dump -U vsteps -d vsteps -Fc" > ban-sao-truoc-phase-2.dump
```

(`docs/DEPLOY.md:89`.) Bản dump chỉ tính là backup khi **đã thử phục hồi thành công ít nhất một
lần** (`docs/DEPLOY.md:100`).

### Bước 1 — Kiểu dữ liệu `IntegrationSettings`

Tạo `cloudflare/integration-settings.ts`. Một khối riêng, **không** nhồi vào `SepaySettings` (khối
đó gắn với sổ cái tài chính và được ghi lại mỗi lần đối soát; trộn bí mật vào đó làm cửa sổ xung đột
của khối tài chính dài thêm mà không có lý do).

```
export interface IntegrationSettings {
  sepay: {
    webhookMode: "HMAC_BODY" | "HMAC_TIMESTAMP_BODY" | "API_KEY" | "DISABLED";
    webhookSecretEncrypted?: string;   // ciphertext, không bao giờ trả về client
    webhookSecretHint?: string;        // 4 ký tự cuối, để UI hiện "••••1234"
  };
  misa: {
    enabled: boolean;
    baseUrl: string;
    clientId: string;
    clientSecretEncrypted?: string;
    clientSecretHint?: string;
    taxCode: string;
    username: string;
    passwordEncrypted?: string;
    passwordHint?: string;
    invSeries: string;
    invTemplateNo: string;
    taxRateLabel: string;              // câu trả lời của Q5
  };
  zalo: {
    enabled: boolean;
    appId: string;
    appSecretEncrypted?: string;
    appSecretHint?: string;
    oaId: string;
    refreshTokenEncrypted?: string;
    refreshTokenHint?: string;
    templateIdPaymentRequest: string;
    templateIdInvoiceIssued: string;
  };
  updatedAt: string;
  updatedBy: string;
}
```

Kèm `defaultIntegrationSettings()` trả về mọi cờ `enabled: false` và chuỗi rỗng, theo đúng kiểu
`defaultSettings()` (`settings-types.ts:51-83`).

**Việc mã hoá/giải mã nằm ở Phase 3**, không ở đây. Phase 2 chỉ lưu chuỗi ciphertext như dữ liệu
mờ đục.

### Bước 2 — Model Prisma mới và cột mới

Thêm vào `prisma/schema.prisma`:

```
model OpsIntegrationSetting {
  id       String @id          // khoá cố định "integration"
  payload  Json                // IntegrationSettings đã tuần tự hoá
  updatedAt String
  updatedBy String

  @@map("integration_settings")
}

model OpsZaloMessageLog {
  id            String  @id
  position      Int
  kind          String            // PAYMENT_REQUEST | INVOICE_ISSUED
  receivableId  String?
  invoiceId     String?
  studentId     String
  phone         String
  templateId    String
  status        String            // QUEUED | SENT | FAILED | DELIVERED
  providerMsgId String?
  errorCode     String?
  errorMessage  String?
  createdAt     String
  sentAt        String?
  deliveredAt   String?

  @@unique([kind, receivableId, invoiceId])
  @@index([position])
  @@index([studentId])
  @@map("zalo_message_logs")
}
```

Khoá `@@unique([kind, receivableId, invoiceId])` là cơ chế chống gửi trùng của Phase 7 (R13 của bản
plan trước): một khoản phải thu chỉ có đúng một tin yêu cầu thanh toán, một hóa đơn chỉ có đúng một
tin thông báo.

Dùng `Json` cho `OpsIntegrationSetting.payload` thay vì trải thành cột: cấu trúc này còn thay đổi
khi có spec Zalo thật (Q7), và nó không bao giờ bị truy vấn theo field lẻ.

Thêm vào `OpsSepayInvoice` (tất cả **nullable**, không `DROP` gì):
`buyerTaxCode String?`, `buyerAddress String?`, `buyerEmail String?`, `pdfUrl String?`,
`xmlUrl String?`, `providerInvoiceId String?`, `taxAuthorityCode String?`.

Thêm cùng bảy field optional vào `interface SepayInvoice` (`sepay-engine.ts:115-131`).

Chạy `npx prisma migrate dev --name them-cau-hinh-tich-hop-va-cot-hoa-don`. Đọc file SQL sinh ra và
xác nhận chỉ có `CREATE TABLE` và `ALTER TABLE ... ADD COLUMN`.

### Bước 3 — Repository cho khối cấu hình tích hợp

Tạo `cloudflare/storage/integration-settings-repository.ts` theo mẫu
`settings-repository.ts`:

- `key: "integrations:steps-demo"`
- `read(tx)` — `SELECT payload FROM integration_settings WHERE id = 'integration'`, trả
  `defaultIntegrationSettings()` khi không có dòng nào.
- `write(tx, value)` — `upsert` một dòng.

Đăng ký vào `blockRepositories` (`relational-kv.ts:29-40`). Sau khi đăng ký, worker đọc/ghi khối này
bằng chính `env.STEPS_LMS_DATA.get("integrations:steps-demo", "json")` như mọi khối khác — không cần
API kho mới (DRY).

### Bước 4 — Repository cho log tin Zalo

Tạo `cloudflare/storage/zalo-message-repository.ts`, `key: "zalo-messages:steps-demo"`, đọc bằng
`json_agg(... ORDER BY position)` và ghi bằng `syncTables` với `keyFields: ["id"]`, theo đúng mẫu
các bảng trong `finance-repository.ts:536-542`.

Giới hạn số dòng giữ lại: cắt còn 2000 dòng gần nhất ở chiều ghi, giống cách `webhookLogs` bị cắt
còn 200 ở `worker.ts:961`.

### Bước 5 — Map bảy field hóa đơn mới ở cả hai chiều

Trong `cloudflare/storage/finance-repository.ts`:

- **Chiều đọc:** mở rộng `InvoiceRow` (`finance-repository.ts:68`) và khối dựng `invoices`
  (`:268-285`), thêm bảy field qua `withOptional` giống cách `invoiceNumber`/`invoiceSeries` đang
  làm.
- **Chiều ghi:** mở rộng khối `const invoices: Row[]` (`:489-497`), thêm bảy `optionalText(...)`.

Không sửa khối `receipts` trong phase này.

### Bước 6 — Kiểm chứng round-trip trong test kho

Thêm vào `tests/relational-storage.test.ts`:

- Ghi một `SepayInvoice` có đủ bảy field mới, đọc lại, khẳng định từng giá trị bằng nhau.
- Ghi `IntegrationSettings` có ciphertext, đọc lại, khẳng định `JSON.stringify` bằng nhau.
- Ghi hai dòng `OpsZaloMessageLog`, đọc lại đúng thứ tự `position`.
- Ghi hai lần liên tiếp cùng một khối và khẳng định `compareAndPut` lần hai với `expected` cũ trả
  `false` (bảo vệ ngữ nghĩa chống xung đột cho các phase sau).

## Cách kiểm chứng

| # | Kiểm chứng | Lệnh |
|---|---|---|
| 1 | Migration chỉ thêm, không xoá | Đọc file `.sql` trong `prisma/migrations/`, grep `DROP` phải rỗng |
| 2 | Round-trip đủ field | `npm run test:storage` |
| 3 | Không vỡ kiểu | `npm run typecheck` |
| 4 | Bộ test hiện có vẫn xanh | `npx tsx --test tests/sepay-matching.test.ts tests/tuition-billing.test.ts tests/vps-worker.test.ts` |
| 5 | Dữ liệu cũ không đổi sau khi migrate | So `SELECT count(*)` của `sepay_invoices`, `sepay_receipts`, `students` trước và sau |

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Quên map một chiều → field mới mất lặng lẽ (R11) | Bước 6 khẳng định round-trip cho **từng** field mới, không chỉ một field đại diện |
| `compareAndPut` so sánh nguyên chuỗi JSON: thêm field optional vào khối tài chính làm mọi `expected` cũ trong phiên đang chạy hoá lệch, gây 409 hàng loạt ngay sau deploy | Field mới là optional và `withOptional` bỏ hẳn key khi rỗng, nên JSON dựng lại không đổi với dữ liệu cũ. Xác nhận bằng test: đọc khối tài chính có dữ liệu cũ, `JSON.stringify` phải giống hệt trước migration |
| Khối cấu hình tích hợp bị ghi đè mất khi hai admin cùng lưu | Route ghi ở Phase 3 dùng `compareAndPut`, không dùng `put` trần |
| Migration hỏng dữ liệu production | Chỉ `ADD COLUMN` nullable và `CREATE TABLE`. Bước 0 có bản dump đã thử phục hồi |

**Đường lùi:** bảng mới và cột nullable mới không được đường nào đọc cho tới Phase 3/6/7, nên revert
mã là đủ; không cần `DROP`. Nếu buộc phải lùi schema, phục hồi từ bản dump ở Bước 0.

## Tác động tài liệu

`docs/DEPLOY.md` có mục liệt kê biến trong `/opt/vsteps/.env`. Sau Phase 3, `SEPAY_WEBHOOK_SECRET`
chuyển sang cấu hình UI; ghi chú điều đó ở Phase 3, không ở đây. Phase 2 chỉ thêm một dòng vào mục
sao lưu nếu bảng mới cần lưu ý riêng — hiện tại không cần vì `pg_dump` lấy toàn bộ database.
