---
title: "Tích hợp SePay + MISA meInvoice + Zalo OA (ZBS) cho luồng thu học phí tự động"
description: "Thống nhất mã thanh toán, nối webhook SePay vào kích hoạt buổi học, phát hành hóa đơn MISA thật và gửi Zalo OA cho phụ huynh; mọi tham số cấu hình sửa qua UI của app production cloudflare/."
status: pending
priority: P1
effort: 61h
branch: main
tags: [sepay, misa, zalo, hoc-phi, hoa-don, tich-hop, cai-dat]
created: 2026-09-22
---

# Tích hợp SePay + MISA meInvoice + Zalo OA (ZBS)

**Ngày lập:** 2026-09-22 (viết lại lần 2)
**Nhánh:** `main`
**Trạng thái:** pending — Phase 1 và Phase 2 chạy được ngay; Phase 4 cần chốt Quyết định D1 và D2 bên dưới.

---

## Phạm vi kỹ thuật đã xác minh

App production là `cloudflare/worker.ts` (2246 dòng) chạy qua `cloudflare/vps-server.ts`, phục vụ
frontend JS thuần từ `cloudflare/public/app.js`. Kho dữ liệu là PostgreSQL quan hệ, truy cập qua
`cloudflare/storage/relational-kv.ts` với ngữ nghĩa khối JSON (`compareAndPut` trên
`storage_blocks`, `relational-kv.ts:154-170`). Toàn bộ nghiệp vụ trong plan này nằm trong
`cloudflare/`, `prisma/schema.prisma` và `tests/`.

**Không đụng tới:** `src/app/**` (app Next.js đang ngừng dùng), riêng `src/app/(app)/syllabus/**` và
`src/components/ui/*` vẫn sống qua `cloudflare/client/*` nhưng nằm ngoài phạm vi này.

Nguồn scout: [`docs/nangcapsepay.md`](../../docs/nangcapsepay.md). Plan này đã xác minh lại từng
trích dẫn của tài liệu đó trực tiếp trên mã nguồn và **đính chính bốn điểm** ở mục kế tiếp.

---

## Bốn đính chính so với `docs/nangcapsepay.md`

### Đ1 — Mã thanh toán trên phiếu báo học phí KHÔNG BAO GIỜ khớp được với webhook (chặn toàn bộ tự động hoá)

Đây là phát hiện nghiêm trọng nhất, không có trong tài liệu scout lẫn bản plan trước.

Hệ thống đang chạy **hai lược đồ mã thanh toán song song, không giao nhau**:

| Nơi sinh mã | Công thức | Ví dụ | Vị trí |
|---|---|---|---|
| Phiếu báo học phí mà nhân viên in/gửi phụ huynh | `HP` + mã học viên + `YYYYMM` (hoặc `KHOA<n>`) | `HPHV001202609` | `cloudflare/public/app.js:2442-2443` |
| Đơn thanh toán mà webhook đối soát | `HP` + 6 ký tự ngẫu nhiên từ `CODE_ALPHABET` | `HP8F4K92` | `sepay-engine.ts:215-223` |

Webhook trích mã bằng `extractPaymentCode()` với regex `/\bHP[A-Z0-9]{6,10}\b/`
(`sepay-engine.ts:226`), rồi tìm `paymentOrders.find(item => item.paymentCode === code)`
(`sepay-engine.ts:337`). Hai hệ quả, đã kiểm chứng bằng cách chạy chính regex đó trên chuỗi thật:

1. Chuỗi `HPHV001202609` (13 ký tự) **không khớp regex** vì phần sau `HP` dài 11 ký tự, vượt giới
   hạn `{6,10}` và không có ranh giới từ để cắt ngắn → `extractPaymentCode` trả `null` →
   giao dịch bị đánh `UNMATCHED / NO_PAYMENT_CODE` (`sepay-engine.ts:333-335`).
2. Ngay cả khi chuỗi ngắn hơn và khớp regex (ví dụ `HPS28KHOA24`), mã trích ra vẫn **không tồn tại**
   trong `paymentOrders` → `UNMATCHED / UNKNOWN_PAYMENT_CODE` (`sepay-engine.ts:339-347`).

**Kết luận:** mọi khoản chuyển tiền của phụ huynh làm đúng theo phiếu báo hiện tại đều rơi vào hàng
chờ đối soát tay. Nối MISA và Zalo vào một chuỗi mà mắt xích đầu không bao giờ khớp là vô nghĩa.
Phase 4 tồn tại để sửa đúng chỗ này, và nó **phải xong trước** Phase 5-7.

### Đ2 — Khoản phải thu (`amountDue`) và báo giá thu tiền (`charge.amount`) tính bằng hai công thức khác nhau

- `syncTuitionReceivables()` đặt `amountDue = classTuitionCharge(cls, sessions)` — **chỉ tháng hiện
  tại**, không trừ `tuitionCredits` (`tuition-billing.ts:318, 328-339`).
- `collectManualTuition()` dùng `tuitionCollectionCharge()` — có thể **gộp nhiều tháng chưa đóng**
  (`tuition-billing.ts:260-265`) và **trừ tín dụng buổi giáo viên cho nghỉ**
  (`tuition-billing.ts:268-278`).

Nên số tiền in trên QR có thể lệch số tiền mà đường thu tay sẽ tính. Nếu Phase 5 cho webhook gọi
thẳng `collectManualTuition()` sau khi khớp `amountDue`, hệ thống sẽ **ghi nhận số tháng khác với
số tiền phụ huynh đã trả**. Cách chặn nằm ở Phase 4: "gửi yêu cầu thanh toán" **chốt cứng** khoản
phải thu theo đúng `tuitionCollectionCharge`, để hai con đường dùng chung một báo giá.

### Đ3 — Khoản phải thu ĐÃ mang `classId` và `billKey`

Tài liệu scout (mục 3) viết rằng webhook "không có `studentId`/`classId` tường minh, cần suy ra".
Thực tế `SepayReceivable` có sẵn `classId` và `billKey` (`sepay-engine.ts:46-47`), được
`syncTuitionReceivables()` điền ở `tuition-billing.ts:335-336, 343-348`. Phase 5 vì vậy tra được
lớp trực tiếp từ khoản phải thu, không cần suy đoán.

### Đ4 — Endpoint QR đều đã có auth, nên link gửi qua Zalo hiện KHÔNG dùng được

Câu hỏi mở trong tài liệu scout đã trả lời được bằng mã nguồn:

- `/api/finance/qr-image` (`worker.ts:1795`) nằm **sau** cổng phiên đăng nhập ở `worker.ts:1248-1249`
  → phụ huynh chưa đăng nhập nhận 401.
- `/api/finance/tuition-qr` (`worker.ts:1804-1805`) còn chặt hơn: yêu cầu `canManageFinance`.

Do đó Phase 4 phải mở một endpoint tra cứu công khai có token riêng cho từng đơn thanh toán; Phase 7
gửi link tới endpoint đó, không gửi thẳng hai đường dẫn trên.

---

## Kết quả mong muốn

Học vụ/kế toán bấm **"Gửi yêu cầu thanh toán"** cho một khoản phải thu trên app production. Từ đó
hệ thống tự chạy hết chuỗi:

1. Khoá số tiền, kỳ thu và mã `HP******` của khoản phải thu (một báo giá duy nhất, dùng chung cho cả
   đường thu tay lẫn đường chuyển khoản).
2. Gửi tin Zalo OA (ZBS Template) cho phụ huynh kèm số tiền, mã thanh toán và link trang thanh toán
   công khai hiển thị QR động mang đúng mã đó.
3. Phụ huynh quét QR chuyển khoản.
4. Webhook SePay nhận giao dịch, xác thực chữ ký, đối soát khớp tiền, tạo biên lai **đầy đủ field**.
5. Số buổi của học viên được kích hoạt ngay trong lượt xử lý webhook đó.
6. Hóa đơn điện tử phát hành thật qua API MISA meInvoice.
7. Tin Zalo OA thứ hai gửi kèm link tra cứu/tải hóa đơn.

Toàn bộ tham số của ba tích hợp (SePay, MISA, Zalo) sửa được trên UI của app production, không cần
sửa `.env` và không cần deploy lại.

## Vì sao làm

- Mã thanh toán trên phiếu báo không đối soát được (Đ1) → mọi giao dịch phải khớp tay.
- Webhook đối soát xong **không kích hoạt buổi học**: `handleSepayWebhook` chỉ ghi khối tài chính
  (`worker.ts:981`) và không hề gọi `persistStudentsMerged`, trong khi `collectTuitionAction` thì có
  (`worker.ts:1142`).
- Hóa đơn điện tử vẫn là mock: `finishInvoices` (`worker.ts:725-730`) gọi `issueDemoInvoice`
  (`sepay-engine.ts:458-479`), sinh số hóa đơn ngẫu nhiên với ký hiệu cứng `"1C26TYY"`.
- Không có nơi lưu cấu hình MISA/Zalo, và chưa có bất kỳ mã Zalo nào trong repo.

## Ràng buộc

1. **Backup database trước mỗi migration.** `deploy/deploy.sh:42` tự dump trước deploy, nhưng
   migration thử tại máy cục bộ và lần deploy đầu tiên của Phase 2 vẫn cần dump tay theo
   `docs/DEPLOY.md:89`.
2. **Không sửa công thức tính học phí.** Không đụng các hàm tính toán trong `tuition-billing.ts`;
   chỉ được gọi lại đúng hàm đã có.
3. **Không xây lại app Next.js `src/`.**
4. **Bí mật không bao giờ hiển thị lại dạng rõ trên UI** sau khi lưu, và chỉ `ADMIN` được sửa.
5. **Code phải chạy được khi chưa có tài khoản MISA/Zalo thật** — dùng cờ "chưa cấu hình"; luồng thu
   tiền đang chạy không được hỏng.
6. **Mọi lệnh gọi mạng ra ngoài (MISA, Zalo) phải nằm ngoài cửa sổ đọc-sửa-ghi khối tài chính.**
   Lý do ở Rủi ro R1.

## Không làm (non-goals)

- Không nhắc nợ/nhắc hạn định kỳ tự động.
- Không xây UI soạn/duyệt nội dung mẫu tin ZBS trong app — mẫu đăng ký trên Zalo Business Manager,
  app chỉ lưu `template_id` đã duyệt.
- Không migrate app Next.js `src/` sang production.
- Không đụng các API phụ của MISA (gửi email hóa đơn, chuyển hóa đơn giấy, ký USB token).
- Không tự động gửi tin cho toàn bộ phụ huynh — việc gửi luôn là thao tác tường minh của nhân viên.

## Quyết định cần chốt trước khi thực thi Phase 4

| # | Quyết định | Đề xuất | Đã chốt |
|---|---|---|---|
| **D1** | Thống nhất một lược đồ mã thanh toán. Phiếu báo học phí chuyển sang in `paymentOrder.paymentCode` (`HP` + 6 ký tự) thay cho `HP{mã HV}{YYYYMM}` | **Dùng `paymentOrder.paymentCode`** — đây là mã duy nhất webhook đối soát được. Mã cũ không có đường nào khớp (Đ1) | ✅ chốt 2026-09-22 |
| **D2** | Khi "gửi yêu cầu thanh toán", chốt cứng khoản phải thu theo `tuitionCollectionCharge` (gộp tháng nợ + trừ tín dụng), hay giữ `classTuitionCharge` (chỉ tháng hiện tại) | **Chốt theo `tuitionCollectionCharge`**, để số tiền trên QR đúng bằng số tiền đường thu tay sẽ tính (Đ2). Nếu giữ nguyên, Phase 5 phải từ chối kích hoạt khi hai con số lệch | ✅ chốt 2026-09-22 |
| **D3** | Gửi Zalo tới `parentPhone1`, hay cả `parentPhone1` và `parentPhone2` khi khác nhau | **Chỉ `parentPhone1`**, trừ khi trung tâm yêu cầu khác; mỗi tin ZBS đều tính phí | ✅ chốt 2026-09-22 — chỉ gửi `parentPhone1` |

## Điều kiện tiên quyết ngoài code (Phase 0 — chặn go-live, không chặn viết code)

| Việc | Bên phụ trách | Độ trễ dự kiến |
|---|---|---|
| Tài khoản MISA meInvoice thật + ClientID/ClientSecret + mẫu hóa đơn (`InvSeries`/`InvTemplateNo`) đã đăng ký | Trung tâm làm việc với MISA | Không xác định — xem Q2 |
| Zalo OA xác thực doanh nghiệp | Trung tâm | vài ngày |
| Liên kết OA với ZBS Account (tài khoản trả phí) | Trung tâm | vài ngày |
| 2 mẫu tin ZBS đã duyệt: (a) yêu cầu thanh toán, (b) thông báo hóa đơn | Trung tâm | 2-3 ngày làm việc **mỗi mẫu** |
| Chế độ xác thực webhook + giá trị bí mật thật từ cổng SePay | Dev + trung tâm | ngay — chặn Phase 1 |
| Xác nhận trung tâm có đang dùng ảnh QR tĩnh (`qrImageDataUrl`) không | Trung tâm | ngay — chặn Phase 4 |

## Tiêu chí nghiệm thu

| # | Tiêu chí | Cách kiểm chứng |
|---|---|---|
| 1 | Chuyển khoản theo đúng nội dung in trên phiếu báo được webhook đối soát tự động | Bắn webhook với `content` lấy nguyên văn từ phiếu báo vừa tạo → giao dịch `ALLOCATED`, không `UNMATCHED` |
| 2 | Webhook không có chữ ký hợp lệ bị từ chối, kể cả khi chưa cấu hình bí mật | `curl` webhook không kèm header chữ ký → 401 |
| 3 | Phiên STUDENT không tự đánh dấu được là đã trả tiền | `POST /api/finance/sepay {"action":"simulate"}` bằng phiên STUDENT → 403 |
| 4 | Webhook và thao tác thu tay chạy cùng lúc không làm mất biên lai của nhau | Kịch bản test đồng thời ở Phase 1 |
| 5 | Sau khi webhook khớp tiền, số buổi của học viên đúng **ngay trong lượt đó** | Bắn webhook, đọc `students` trong DB ngay sau đó (không tải lại trang) |
| 6 | Phí học liệu không bị quy đổi thành buổi học; lớp thu theo tháng không bị tính phí lại | Kiểm chứng riêng ở Phase 5 |
| 7 | Webhook gửi lại cùng `providerTransactionId` không cộng buổi, phát hành hóa đơn hay gửi Zalo lần hai | Bắn lặp 3 lần, đếm biên lai / hóa đơn / log Zalo |
| 8 | Người vận hành đổi được STK, ClientSecret MISA, template ID Zalo trên UI mà không cần deploy | Đăng nhập ADMIN, sửa, lưu, tải lại trang, giá trị mới có hiệu lực ở lượt gọi kế tiếp |
| 9 | Bí mật không hiện lại dạng rõ | Sau khi lưu, ô nhập hiện `••••` + 4 ký tự cuối; response JSON đã mask |
| 10 | Tài khoản không phải ADMIN không xem/sửa được tab tích hợp | Đăng nhập ACCOUNTANT/TEACHER → tab không hiện; gọi thẳng API trả 403 |
| 11 | Hóa đơn phát hành thật, lưu được mã tra cứu và link tải | Đối chiếu với portal MISA |
| 12 | Hai tin Zalo gửi đúng thời điểm, có log trạng thái gửi/nhận | Bảng log Zalo có 2 dòng đúng loại, `msg_id` khớp, callback cập nhật trạng thái |
| 13 | Khi MISA/Zalo chưa cấu hình hoặc lỗi, luồng thu tiền **vẫn thành công** | Tắt cấu hình → bắn webhook → biên lai và buổi học vẫn đúng, hóa đơn/tin ở trạng thái chờ |
| 14 | Link thanh toán gửi qua Zalo mở được khi chưa đăng nhập, và hiển thị QR mang đúng mã `HP******` | Mở link ở trình duyệt ẩn danh, giải mã QR, đối chiếu `paymentCode` |
| 15 | Test tự động chạy trên đường deploy; test đỏ thì không deploy | Làm một test đỏ, push → CI dừng, container cũ vẫn chạy |

## Các phase

| Phase | Nội dung | Phụ thuộc | Ước lượng | File |
|---|---|---|---|---|
| 1 | Vá lỗ hổng webhook và quyền `simulate` | — | 5h | [phase-1-va-lo-hong-webhook.md](phase-1-va-lo-hong-webhook.md) |
| 2 | Migration schema: cấu hình tích hợp, cột hóa đơn, log tin Zalo | Phase 1 | 6h | [phase-2-migration-schema.md](phase-2-migration-schema.md) |
| 3 | UI cấu hình tích hợp + API đọc/ghi + mã hoá bí mật | Phase 2 | 8h | [phase-3-ui-cau-hinh-tich-hop.md](phase-3-ui-cau-hinh-tich-hop.md) |
| 4 | Thống nhất mã thanh toán + hành động "Gửi yêu cầu thanh toán" + trang thanh toán công khai | Phase 1 (D1, D2 đã chốt) | 8h | [phase-4-thong-nhat-ma-thanh-toan.md](phase-4-thong-nhat-ma-thanh-toan.md) |
| 5 | Webhook khớp tiền xong tự kích hoạt buổi học | Phase 1, 4 | 8h | [phase-5-kich-hoat-buoi-hoc.md](phase-5-kich-hoat-buoi-hoc.md) |
| 6 | Phát hành hóa đơn thật qua MISA meInvoice | Phase 2, 3, 5 | 10h | [phase-6-hoa-don-misa.md](phase-6-hoa-don-misa.md) |
| 7 | Gửi ZBS Template Message + 2 điểm gọi + webhook callback | Phase 2, 3, 4, 6 | 10h | [phase-7-zalo-zbs.md](phase-7-zalo-zbs.md) |
| 8 | Nghiệm thu đầu-cuối, cổng test trên CI, go-live | Phase 0 + 1-7 | 6h | [phase-8-nghiem-thu-go-live.md](phase-8-nghiem-thu-go-live.md) |

**Phase 4 là mắt xích quan trọng nhất.** Không có nó, Phase 5-7 tự động hoá một chuỗi mà bước đối
soát đầu tiên không bao giờ chạy (Đ1). Nếu phải cắt phạm vi, cắt từ Phase 6-7 trở xuống, không bao
giờ cắt Phase 4.

**Phase 2 và Phase 4 chạy song song được** sau khi Phase 1 xong: Phase 2 chỉ đụng
`prisma/schema.prisma`, `cloudflare/storage/*` và các file mới; Phase 4 đụng
`cloudflare/public/app.js`, `worker.ts`, `tuition-billing.ts`. Giao điểm duy nhất là
`sepay-engine.ts` — giao hẳn cho Phase 4, và Phase 2 chờ Phase 4 nếu cần thêm field vào
`SepayInvoice`.

### Sở hữu file (không phase nào song song đụng cùng file)

| File | Phase sở hữu |
|---|---|
| `cloudflare/sepay-webhook-auth.ts` (mới) | 1 |
| `cloudflare/sepay-engine.ts` | 1 → 4 → 2 → 6 **tuần tự** |
| `prisma/schema.prisma` + `prisma/migrations/**` | 2 |
| `cloudflare/integration-settings.ts` (mới) | 2 → 3 |
| `cloudflare/storage/integration-settings-repository.ts` (mới) | 2 |
| `cloudflare/storage/zalo-message-repository.ts` (mới) | 2 |
| `cloudflare/storage/finance-repository.ts`, `cloudflare/storage/relational-kv.ts` | 2 |
| `cloudflare/crypto-secrets.ts` (mới) | 3 |
| `cloudflare/tuition-billing.ts` | 4 |
| `cloudflare/payment-link.ts` (mới) | 4 |
| `cloudflare/misa-invoice-client.ts`, `cloudflare/invoice-outbox.ts` (mới) | 6 |
| `cloudflare/zalo-zbs-client.ts`, `cloudflare/zalo-outbox.ts`, `cloudflare/phone-format.ts` (mới) | 7 |
| `cloudflare/public/app.js` | 3 → 4 → 7 **tuần tự** |
| `cloudflare/worker.ts` | 1 → 4 → 3 → 5 → 6 → 7 **tuần tự, không song song** |
| `cloudflare/vps-server.ts` | 3 |
| `deploy/deploy.sh`, `package.json`, `docs/*` | 8 (trừ `docs/DEPLOY.md` cũng bị 2 sửa) |

`cloudflare/worker.ts` (2246 dòng) bị sáu phase đụng tới — điểm nghẽn tuần tự đã biết. Cách giảm đau:
mỗi phase viết logic vào file mới của mình và **chỉ thêm một khối gọi nhỏ** vào `worker.ts`. Đừng
chia người làm song song trên file này.

`cloudflare/public/app.js` hiện là **một file 461 KB**. Ba phase cùng sửa nó, nên mỗi phase chỉ thêm
hàm dựng giao diện riêng cạnh hàm cùng loại đã có (`sepayBankForm()` ở `app.js:3330` là mẫu để
theo), không tái cấu trúc file trong phạm vi plan này.

## Rủi ro chính

| # | Rủi ro | Khả năng × Tác động | Cách chặn |
|---|---|---|---|
| **R1** | **Gọi API ngoài bên trong cửa sổ ghi khối tài chính gây mất biên lai.** Khối tài chính được ghi bằng `compareAndPut`, khoá dòng `storage_blocks` rồi so sánh nguyên chuỗi JSON dựng lại (`relational-kv.ts:154-170`). Thêm một lệnh gọi HTTP 2-5 giây vào giữa kéo dài cửa sổ xung đột lên nhiều lần | Cao × Cao | Gọi MISA/Zalo **sau khi** đã ghi xong và đóng transaction. Kết quả áp vào bằng một lượt ghi ngắn thứ hai, có khoá idempotency. Không bao giờ `await` mạng giữa `read` và `compareAndPut` |
| **R2** | **Webhook ghi đè mất thay đổi của người khác.** `handleSepayWebhook` dùng `persistFinance` (`worker.ts:981`, định nghĩa `worker.ts:753-755`) — ghi đè vô điều kiện, khác `persistFinanceIfUnchanged` + retry ở `worker.ts:1907-1911` | Cao (tăng mạnh khi bật webhook thật) × Cao | Phase 1 đổi sang `persistFinanceIfUnchanged` + vòng lặp retry |
| **R3** | **Mã thanh toán không khớp (Đ1)** khiến mọi giao dịch thật rơi vào hàng chờ tay, kể cả sau khi làm xong Phase 5-7 | Chắc chắn × Rất cao | Phase 4 hợp nhất hai lược đồ mã; có kiểm chứng riêng đi từ chuỗi in trên phiếu báo tới `ALLOCATED` |
| **R4** | **Phiếu báo đã in/gửi trước khi triển khai Phase 4** vẫn mang mã cũ; phụ huynh trả theo mã đó sẽ không khớp | Cao × Trung bình | Phase 4 Bước 6: giữ nguyên `action: "match"` để khớp tay; thông báo cho học vụ trong một cửa sổ chuyển tiếp, không xoá dữ liệu cũ |
| **R5** | **Số tiền khoản phải thu lệch số tiền đường thu tay tính (Đ2)** → kích hoạt sai số tháng | Cao × Cao | Phase 4 chốt cứng khoản phải thu theo `tuitionCollectionCharge`; Phase 5 từ chối kích hoạt và chuyển sang chờ duyệt tay khi hai con số vẫn lệch |
| **R6** | **Biên lai do webhook sinh ra thiếu gần hết field.** `sepay-engine.ts:392-400` chỉ điền 7 field; thiếu `materialsAmount` → phí học liệu bị quy đổi thành buổi học (`tuition-billing.ts:395-398` trừ `materialsAmount` khi quy tiền ra buổi); thiếu `billingPeriod` → `receiptMonthKeys()` (`tuition-billing.ts:196-206`) không nhận ra tháng đã thu, lớp thu theo tháng bị tính phí lại | Cao × Cao | Phase 5: tách hàm dựng biên lai dùng chung với đường thu tay, kiểm chứng riêng cho từng hậu quả |
| **R7** | **Học viên/phụ huynh tự đánh dấu đã trả tiền.** Phiên STUDENT được phép gọi `simulate` trên khoản phải thu của mình (`worker.ts:1915-1922`), chạy đủ đường khớp tiền, tạo biên lai + hóa đơn | Cao × Rất cao | Phase 1 Bước 3: giới hạn `simulate` về `canManageFinance` và đặt sau cờ `ALLOW_DEMO_LOGIN` (`worker.ts:1211`) |
| **R8** | **Công thức HMAC hiện tại có thể không khớp spec SePay** — `verifySepaySignature` ký raw body (`sepay-engine.ts:615-622`); nhiều cổng ký `{timestamp}.{body}`. Lỗ "bí mật rỗng = bỏ qua xác thực" (`worker.ts:936`) đang che lỗi này; bịt lỗ kia mà không sửa công thức là 401 toàn bộ | Trung bình × Cao | Phase 1 xác nhận chế độ thật với SePay (Q11) trước khi bịt; kiểm chứng bằng payload thật, không phải payload tự bịa |
| **R9** | **Endpoint QR đều yêu cầu đăng nhập (Đ4)** → link gửi qua Zalo trả 401 cho phụ huynh | Chắc chắn × Cao | Phase 4 mở endpoint tra cứu công khai có token ngẫu nhiên riêng cho từng đơn; Phase 7 chỉ gửi link đó |
| **R10** | **Ảnh QR tĩnh không mang mã thanh toán.** `refreshOrderQr` trả `/api/finance/qr-image` khi trung tâm đã tải ảnh riêng (`sepay-engine.ts:544-552`); ảnh đó cố định, không có mã `HP******` | Cao × Cao | Phase 4: trang thanh toán công khai **luôn** sinh QR động theo `paymentCode`; ảnh tĩnh chỉ dùng cho phiếu in tay, kèm cảnh báo trên UI |
| **R11** | **Field mới không được map sẽ biến mất trong im lặng.** Repository đọc bằng `$queryRaw` dựng JSON (`finance-repository.ts:104-112`) và ghi bằng `syncTables` diff toàn bảng (`finance-repository.ts:536-542`); thiếu map ở một chiều là mất dữ liệu, không lỗi, không cảnh báo — kể cả mã hóa đơn thật đã phát hành | Trung bình × Cao | Phase 2: map cả hai chiều, kèm khẳng định round-trip trong `tests/relational-storage.test.ts` |
| **R12** | `finishInvoices` (`worker.ts:725-730`) gắn hóa đơn giả `ISSUED` cho mọi biên lai **trước khi** MISA chạy → MISA không bao giờ được gọi mà không ai biết. Ba nơi gọi: `worker.ts:980, 1048, 1070` | Trung bình × Cao | Phase 6 Bước 4: gỡ khỏi đường production, xử lý đủ cả ba nơi gọi, `npm run typecheck` bắt phần sót |
| **R13** | Bí mật lưu trong DB bị lộ qua bản dump backup (`deploy/deploy.sh:42` dump toàn bộ) | Trung bình × Cao | Phase 3: mã hoá AES-256-GCM bằng khoá dẫn xuất từ `AUTH_SECRET` (`vps-server.ts:20` đã bắt buộc có); repo hiện chưa có helper mã hoá nào |
| **R14** | Trung tâm không được MISA cấp API (Q2) | Trung bình × Cao | Phase 6 giữ `issueDemoInvoice` làm đường lùi qua cờ cấu hình; luồng 1-5 và 7 vẫn dùng được độc lập |
| **R15** | Chưa có spec field-level thật của API ZBS Template | Cao × Trung bình | Phase 7 tách riêng lớp client; xác nhận spec khi có tài khoản OA/ZBS rồi mới chốt tên field. Xem Q5 |
| **R16** | `parentPhone1` trong dữ liệu thật có định dạng lẫn lộn (`prisma/schema.prisma:1383` bắt buộc `String`, có thể rỗng) → gửi Zalo lỗi hàng loạt | Trung bình × Trung bình | Phase 7 Bước 1 là query thống kê định dạng thật trước khi viết hàm chuẩn hoá |
| **R17** | **Không có bước test nào trên đường deploy.** `package.json:5-37` không có script `test` gộp; `deploy/deploy.sh` không chạy test nào dù repo có 31 bộ test trong `tests/` | Cao × Cao | Phase 8 Bước 2: thêm script `test` và chèn vào `deploy/deploy.sh` trước `docker compose build` |
| **R18** | Migration Phase 2 chạy trên production làm hỏng dữ liệu | Thấp × Rất cao | Chỉ thêm bảng/thêm cột nullable, không `DROP`. Dump tay trước khi chạy (`docs/DEPLOY.md:89`) |

## Đường lùi tổng thể

- Phase 2 chỉ thêm bảng và cột nullable → lùi bằng cách bỏ qua, không cần `DROP`.
- Phase 3, 6, 7 đều nằm sau cờ cấu hình "chưa bật". Tắt cờ trên UI là hệ thống quay về hành vi hiện
  tại mà không cần deploy.
- Phase 4 là thay đổi hành vi không có cờ. Đường lùi là revert commit; dữ liệu cũ không bị sửa vì
  phase này chỉ thêm mã mới cho các đơn thanh toán mới, không viết lại mã đơn cũ.
- Deploy hỏng thì `deploy.sh` tự quay về `vsteps-lms:previous` (`deploy/deploy.sh:92`).
- Dữ liệu hỏng thì phục hồi từ dump theo `docs/DEPLOY.md`.

---

## Câu hỏi chưa rõ

### Chặn thực thi

- **Q1 (chặn Phase 4).** ✅ Trả lời 2026-09-22: D1 và D2 đã chốt (xem bảng trên). Phase 4 đã viết xong.
- **Q2 (chặn Phase 1).** ✅ Trả lời 2026-09-22: dùng chế độ **`API_KEY`** (token webhook), không dùng
  HMAC. Cần đặt token thật vào cấu hình tích hợp (Cài đặt → Tích hợp → SePay) trước khi bật thật trên
  production; xem `cloudflare/sepay-webhook-auth.ts` nhánh `API_KEY` (so khớp `Authorization: Apikey
  <token>` bằng so sánh hằng thời gian).
- **Q3 (chặn Phase 4).** ✅ Trả lời 2026-09-22: không dùng ảnh QR tĩnh, chỉ dùng QR động sinh theo
  mã. Phase 4 sinh QR động theo `paymentCode` như plan đề xuất, không cần xử lý thêm case ảnh tĩnh.
- **Q4 (chặn Phase 6).** Trung tâm đã có tài khoản MISA meInvoice + ClientID/ClientSecret + mẫu hóa
  đơn chưa? Khách từng nói "MISA không cho dùng API", nhưng MISA công khai mời đăng ký meInvoice API
  — nhiều khả năng gói dịch vụ hiện tại chưa gồm API. Cần hỏi thẳng bộ phận kinh doanh MISA.
- **Q5 (chặn Phase 6).** Với phụ huynh cá nhân không có mã số thuế, hóa đơn dịch vụ đào tạo áp thuế
  suất nào (KCT / 0% / khác)? Tài liệu API không quy định nghiệp vụ thuế.
- **Q6 (chặn Phase 7).** Nội dung chính xác của 2 mẫu tin ZBS sẽ đăng ký là gì? Phải chốt trước khi
  gửi Zalo duyệt; sửa cấu trúc câu sau khi duyệt tốn thêm 2-3 ngày.
- **Q7 (chặn Phase 7).** ⚠️ Cập nhật 2026-09-22: tài liệu chính thức PDF "ZBS Template Message API"
  (stc-cms-developers.zdn.vn) xác nhận được endpoint gửi qua UID
  (`POST https://openapi.zalo.me/v3.0/oa/message/template`, header `access_token`, body
  `user_id`/`template_id`/`template_data`, response `{data:{message_id,user_id,sent_time},error,
  message}`) và endpoint gửi qua SĐT "kế thừa từ bộ API gửi ZNS hiện tại" nhưng KHÔNG kèm URL/field
  tường minh cho nhánh SĐT — trung tâm dùng nhánh SĐT (D3 gửi `parentPhone1`, chưa có UID người quan
  tâm OA). `cloudflare/zalo-zbs-client.ts` dựng theo quy ước ZNS công khai lâu năm
  (`POST https://business.openapi.zalo.me/message/template`) — **CHƯA gọi thử bằng `curl` với token
  thật**, vẫn là cửa chặn trước khi bật `zalo.enabled` production. Webhook callback trạng thái
  (`cloudflare/zalo-webhook-auth.ts`) cũng dựng suy luận (header `x-zevent-signature`/
  `x-zevent-timestamp`), chưa xác nhận.
  ✅ Cập nhật 2026-09-28: endpoint gửi qua SĐT và OAuth refresh đã kiểm chứng bằng tài khoản OA/ZBS
  thật (gửi thành công mẫu "Yêu cầu thanh toán" tới một số điện thoại thật, nhận `msg_id` hợp lệ) —
  không còn là cửa chặn cho phần gửi tin. Phát hiện thêm: mẫu ZBS đã duyệt giới hạn `order_code`,
  `ten_hoc_vien`, `lop` ở kiểu "Tên khách hàng (30 ký tự)" — xem `docs/DEPLOY.md` mục "Zalo ZBS
  Template Message". Webhook callback trạng thái vẫn CHƯA kiểm chứng (chưa nhận callback thật nào).
- **Q8 (chặn Phase 8 / go-live).** Tên miền nào khai vào cổng SePay và callback Zalo —
  `vsteps.buivanvu.com` (`docs/DEPLOY.md:18`) hay `ngoaingusteps.edu.vn`? Đổi sau khi đã khai là
  phải khai lại ở cả hai nhà cung cấp.
- **Q9 (chặn Phase 8 / go-live).** Máy nào đang phục vụ trung tâm vào thời điểm bật webhook?
  `docs/dong-bo-database.md` còn ghi máy cũ `149.28.131.241` là máy đang phục vụ, còn plan này nhắm
  vào `163.61.72.30`. Webhook SePay chỉ trỏ được về một URL, và không có đường lùi kỹ thuật cho tiền
  đã đối soát trên máy sai.

### Không chặn, nhưng cần cho nghiệp vụ

- **Q10.** Khi phụ huynh trả **thiếu**, có kích hoạt số buổi tương ứng số tiền đã trả hay không kích
  hoạt gì cho tới khi trả đủ? `autoPartial` mặc định `true` (`sepay-engine.ts:209`), nên hành vi
  hiện tại là chấp nhận trả thiếu. Phần trả **thừa** thành `SepayCredit` — ai được dùng, có tự trừ
  vào kỳ sau không?
- **Q11.** Khi thu tiền mặt tại quầy (không qua QR), có gửi tin Zalo thông báo hóa đơn không?
- **Q12.** Một khoản phải thu trả nhiều lần: mỗi lần một hóa đơn, hay gộp một hóa đơn khi trả đủ?
- **Q13.** `SEPAY_API_TOKEN` khai trong `.env.example:29` nhưng không nơi nào trong `cloudflare/`
  dùng. Nếu trung tâm muốn QR động do chính SePay sinh (mang mã đối soát của SePay) thay vì
  `img.vietqr.io`, cần làm rõ để đưa vào Phase 4.
- **Q14.** Bảng giá ZBS Template Message theo tin (VND/tin) chưa tra cứu — cần cho ước tính chi phí
  vận hành hàng tháng.
- **Q15.** App Next.js `src/` còn giữ lại làm gì? Nó đang tạo ra chính sự nhầm lẫn khiến vòng scout
  đầu tiên kết luận ngược. Cân nhắc một plan riêng để gỡ bỏ.
