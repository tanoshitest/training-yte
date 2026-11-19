---
title: "Production thật nằm ở cloudflare/, không phải Next.js trong src/ — vá bug webhook SePay trả 400 sai"
date: 2026-09-22
summary: "Xác minh qua docker inspect: ngoaingusteps.edu.vn chạy cloudflare/worker.ts (Dockerfile.vps), Next.js trong src/app/** là code chết dù đầy đủ tính năng; sửa nút SePay Kiểm tra kết nối bị khoá cứng và bug webhook 400 do sai case field referenceCode; cắm biển cảnh báo trong code lẫn docs"
---

# Production thật nằm ở cloudflare/, không phải Next.js trong src/ — vá bug webhook SePay trả 400 sai

## Bối cảnh

Người dùng hỏi "giao dịch SePay và giao dịch lệnh trong mục kế toán hiện xử lý
thế nào?". Tôi (agent) trả lời dựa trên `src/app/api/webhooks/sepay/route.ts`
và các bảng Prisma `Finance*` — **sai**, vì đó không phải code đang chạy thật.
Phát hiện ra khi người dùng báo nút "Kiểm tra kết nối" ở Cài đặt → Tích hợp
SePay bấm không có phản ứng, và sau đó khi gửi thử webhook thật từ dashboard
SePay bị trả về 400.

## Việc đã làm

**1. Xác minh production thật chạy ở đâu** — dùng `docker inspect vsteps-app`
trên VPS (qua `mcp-ssh-bnixvsteps`): container chạy lệnh tsx trên file
`cloudflare/vps-server.ts`, build từ `Dockerfile.vps`
(không phải `Dockerfile` gốc chạy Next.js `node server.js`), deploy qua
`deploy/docker-compose.yml`. Đọc `cloudflare/vps-server.ts` xác nhận 100%
request đi qua `worker.fetch()` — Next.js trong `src/app/**` không hề được
Node boot lên trong container này. Bảng Prisma của nhánh Next.js
(`FinanceBankTransaction`, `FinancePaymentOrder`, ...) đã bị đổi
`@@map` sang tiền tố `legacy_*`, xác nhận đúng là nhánh cũ/chết — điều này
`docs/system-architecture.md` đã ghi đúng từ trước, chỉ là không ai đọc tới.

**2. Sửa nút "Kiểm tra kết nối" SePay bị khoá cứng** (`cloudflare/public/app.js`) —
nút này `disabled` cố định từ kế hoạch Phase 3 ban đầu (SePay chỉ gọi webhook
vào hệ thống, không có API để ping ngược lại nên không thể "test kết nối" như
MISA/Zalo). Theo lựa chọn của người dùng, thay bằng badge hiển thị trạng thái
lần nhận webhook gần nhất (`sepay.webhookLogs[0]`, vốn đã có sẵn trong state
của trang, không cần sửa backend). Viết thêm test cho 3 trạng thái (chưa có
log / thành công / bị từ chối). Commit `9f64404`.

**3. Sửa bug webhook 400 thật** (`cloudflare/worker.ts::handleSepayWebhook`) —
dòng trích `providerTransactionId` là
`payload.id || payload.transaction_id || payload.reference_code`. Khi SePay
bấm nút "Gửi thử" trên dashboard của họ, họ gửi `id: 0` (giá trị test, falsy
trong JS nên bị `||` bỏ qua) và định danh giao dịch nằm ở field
`referenceCode` (camelCase) — nhưng code lại tìm `reference_code` (snake_case,
sai tên field so với SePay thật). Ba nhánh đều rỗng → 400
`MISSING_TRANSACTION_ID` dù chữ ký hợp lệ. Bằng chứng bug là so sánh với 3
dòng ngay bên dưới cùng hàm, nơi `accountNumber`/`transactionDate`/
`transferAmount` đã xử lý đúng cả hai kiểu tên field. Viết test mô phỏng đúng
payload SePay gửi khi test (`id: 0`, `referenceCode: "SEPAYTEST123"`), xác
nhận test lỗi đúng `400` khi tạm bỏ fix, pass khi có fix. Thêm
`payload.referenceCode`/`payload.transactionId` vào chuỗi fallback. Full suite
`tests/vps-worker.test.ts` 22/22 pass. Commit `cea7003`.

**4. Cắm biển cảnh báo trực tiếp trong code** để không ai phải chạy lại
`docker inspect` mới biết nhánh nào là thật: comment cảnh báo trong
`Dockerfile` (gốc, Next.js — không được deploy pipeline nào dùng),
`Dockerfile.vps` (xác nhận đây là file production thật), đầu
`handleSepayWebhook` trong `cloudflare/worker.ts` (xác nhận đây là handler
thật), đầu `src/app/api/webhooks/sepay/route.ts` (cảnh báo route này không
nhận request thật). Thêm cross-reference trong `docs/DEPLOY.md` trỏ tới mục
đã có sẵn trong `docs/system-architecture.md`. Commit `dc61045`.

**5. Phát hiện thêm — `src/` không hoàn toàn chết**: `cloudflare/client/*.tsx`
(ví dụ `syllabus-app.tsx`, `activity-games.tsx`) là React thật, build riêng
bằng esbuild (`scripts/build-cloudflare-syllabus.mjs`) ra file tĩnh
`cloudflare/public/syllabus.js`, **commit thẳng vào git** — tái dùng component
từ `src/app/(app)/syllabus/*` và `src/components/ui/*`. Bước esbuild này
**không nằm trong pipeline deploy VPS** (`Dockerfile.vps`/`deploy/deploy.sh`
không gọi tới), nên nếu sửa các màn hình dạng này phải tự chạy build và commit
bundle `.js` kết quả trước khi push, CI không tự làm giúp.

## Kết quả cuối

- `npm run typecheck` sạch cho tất cả file đã sửa.
- `tests/vps-worker.test.ts` 22/22 pass (gồm 1 test mới tái hiện đúng lỗi 400
  trước khi sửa).
- `tests/integration-settings-ui.test.ts` 6/6 pass (gồm 1 test mới cho badge
  trạng thái SePay).
- 3 commit đã push lên `main`: `9f64404`, `cea7003`, `dc61045`.

## Còn mở

- Quyết định dài hạn về nhánh Next.js chết trong `src/app/**` **chưa chốt**:
  người dùng chọn phương án rủi ro thấp nhất (chỉ ghi chú cảnh báo, giữ
  nguyên hiện trạng) thay vì xoá hẳn hoặc lập kế hoạch migrate thật sự sang
  Next.js. Nếu sau này cần quyết, xem lại 3 lựa chọn đã đưa ra trong phiên
  này trước khi bắt đầu.
- Chưa xác minh `cloudflare/public/syllabus.js` hiện tại trên production có
  đang khớp với `cloudflare/client/syllabus-app.tsx` mới nhất hay không (nghi
  vấn phát sinh trong lúc điều tra, chưa kiểm tra — vì esbuild không nằm
  trong CI, bundle có thể bị lệch bất cứ lúc nào có người sửa `syllabus-app.tsx`
  mà quên build lại).
- Chưa dò xem có mục tiêu deploy Cloudflare Workers/Wrangler
  (`wrangler deploy`, `opennextjs-cloudflare`) nào còn thật sự dùng không, hay
  toàn bộ script liên quan (`deploy`, `deploy:full`, `upload`, `preview`,
  `demo:check` trong `package.json`) cũng là tàn dư như `Dockerfile` gốc.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
