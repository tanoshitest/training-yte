# Phase 5 — Webhook khớp tiền xong tự kích hoạt buổi học

**Phụ thuộc:** Phase 1, Phase 4
**Ước lượng:** 8h
**Sở hữu file:** `cloudflare/sepay-engine.ts`, `cloudflare/tuition-billing.ts`,
`cloudflare/worker.ts`, `tests/tuition-billing.test.ts`, `tests/vps-worker.test.ts`

## Bối cảnh

Webhook hiện dừng ở mức tài chính. So sánh hai đường đi:

| Việc | Đường thu tay (`collectTuitionAction`) | Đường webhook (`handleSepayWebhook`) |
|---|---|---|
| Dựng biên lai | `collectManualTuition` điền 15 field, gồm `classId`, `className`, `billingPeriod`, `billingMode`, `creditSessionsUsed`, `materialsAmount`, `paidThroughBefore` (`tuition-billing.ts:1108-1127`) | `processBankTransaction` điền 7 field (`sepay-engine.ts:392-400`) |
| Cập nhật `sessionBalances` | có, `worker.ts:1132-1139` | không |
| Cập nhật `tuitionPaidThrough` | có, `worker.ts:1136-1138` | không |
| Ghi bảng học viên | `persistStudentsMerged` (`worker.ts:1142`) | **không gọi bao giờ** |
| Ghi dòng thu-chi | có, `worker.ts:1108-1124` | chỉ `syncTuitionCashbook` (`worker.ts:981`) |
| Ghi audit | có, `worker.ts:1143-1148` | không |

Hai field thiếu gây hậu quả nghiệp vụ cụ thể, không chỉ là dữ liệu thiếu cho đẹp:

- **Thiếu `materialsAmount`** — `receiptTuitionAmount()` (`tuition-billing.ts:395-398`) trừ
  `materialsAmount` ra trước khi quy số tiền đã thu thành số buổi. Thiếu field này, tiền học liệu bị
  chia cho đơn giá buổi và **cộng khống buổi học**.
- **Thiếu `billingPeriod`** — `receiptMonthKeys()` (`tuition-billing.ts:196-206`) đọc chuỗi
  `"Tháng MM/YYYY"` trong `billingPeriod` để biết tháng nào đã thu. Thiếu field này,
  `tuitionCollectionCharge()` (`:257-259`) không thấy tháng đã đóng và **tính phí lại tháng đó**.
- **Thiếu `billingMode`** — `receiptMonthKeys` bỏ qua biên lai không phải `MONTHLY`
  (`tuition-billing.ts:200`); giá trị vắng mặt được coi là monthly, nên biên lai lớp khóa bị đếm
  nhầm.

Phase 4 đã đảm bảo khoản phải thu mang `classId`, `billKey`, `frozenAt` và số tiền bằng đúng
`tuitionCollectionCharge`. Nhờ đó Phase 5 tra được lớp và kỳ thu mà không phải đoán.

## File cần đọc trước

- `cloudflare/worker.ts:932-983` (đã sửa ở Phase 1), `:1076-1150` (`collectTuitionAction` — khuôn
  mẫu cần bám theo), `:764-804` (`persistStudentsMerged`)
- `cloudflare/sepay-engine.ts:323-442` (`processBankTransaction`), `:444-456` (`applyMatch`)
- `cloudflare/tuition-billing.ts:1032-1153` (`collectManualTuition`), `:212-292`
  (`tuitionCollectionCharge`), `:395-398` (`receiptTuitionAmount`), `:196-206` (`receiptMonthKeys`),
  `:777-795` (`monthlyRemainingSessions`, `receiptClassId`), `:447-460` (`courseRemainingSessions`)

## Các bước

### Bước 1 — Tách hàm dựng biên lai dùng chung

Trong `tuition-billing.ts`, tách phần dựng `SepayReceipt` của `collectManualTuition`
(`:1108-1127`) thành:

```
buildTuitionReceipt(input: {
  receiptNumber: string;
  paymentId: string;
  student; cls; charge;
  method: string; note: string;
  issuedAt: string;
}): SepayReceipt
```

`collectManualTuition` gọi hàm này thay cho khối inline. Phase 5 gọi cùng hàm đó. Đây là điểm DRY
quan trọng nhất của phase: hai đường thu tiền phải sinh ra biên lai **giống hệt nhau về cấu trúc**,
khác nhau duy nhất ở `method` và `note`.

Chạy `tests/tuition-billing.test.ts` ngay sau bước này để chắc chắn việc tách không đổi hành vi.

### Bước 2 — Hàm kích hoạt dùng chung cho webhook

Thêm vào `tuition-billing.ts`:

```
activateSessionsForPayment(input: {
  ledger: SepayLedger;
  receivable: SepayReceivable;   // đã khớp, có classId + billKey
  payment: SepayLedgerPayment;
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
  now?: Date;
}): { error: string } | { ledger; students; receipt; charge }
```

Logic:

1. Tra `student` theo `receivable.studentId`, `cls` theo `receivable.classId`. Thiếu một trong hai
   → trả `error`, không throw.
2. `student.tuitionExempt` → trả `error` (đường thu tay cũng chặn, `worker.ts:1097`).
3. Tính `charge = tuitionCollectionCharge(student, cls, sessions, ledger, now)`.
4. **Cổng an toàn (R5):** nếu `payment.allocatedAmount !== charge.amount`, **không kích hoạt**. Trả
   `error` mang mã `AMOUNT_MISMATCH`. Chỗ gọi sẽ đánh dấu giao dịch `NEEDS_REVIEW` để kế toán xử
   lý tay. Phase 4 làm cho trường hợp này hiếm, nhưng nó vẫn xảy ra khi phụ huynh trả thiếu
   (`autoPartial` mặc định `true`, `sepay-engine.ts:209`) hoặc khi lớp đổi lịch sau lúc chốt.
5. Thay biên lai rút gọn mà `processBankTransaction` đã tạo bằng biên lai đầy đủ từ
   `buildTuitionReceipt` — **giữ nguyên `id`, `receiptNumber` và `paymentId`** để không phá liên kết
   với dòng thu-chi và với hóa đơn (`sepay-engine.ts:421` gắn hóa đơn theo `paymentId`).
   `method: "Chuyển khoản"`, `note` ghi mã giao dịch ngân hàng.
6. Tính `students` mới đúng như `worker.ts:1132-1139`: `sessionBalances[cls.id] = remainingAfter`,
   trừ `tuitionCredits[cls.id]` đi `charge.creditSessions`, đặt `tuitionPaidThrough[cls.id]` khi
   `charge.mode === "MONTHLY"`.

Hàm này **thuần**: không đọc kho, không gọi mạng. Mọi I/O nằm ở `worker.ts`.

### Bước 3 — Nối vào `handleSepayWebhook`

Trong thân xử lý đã tách ở Phase 1 Bước 3, sau `applyMatch` (`worker.ts:979`):

1. Chỉ chạy khi `result.event === "TuitionPaymentCompleted"` (`sepay-engine.ts:440`) — hiện chưa
   có consumer nào đọc trường này; đây là chỗ cắm.
2. Đọc `classes`, `students`, `sessions` từ kho, y như `collectTuitionAction` làm
   (`worker.ts:1087-1092`), kèm `clampPaidThroughToReceipts` (`worker.ts:1090`).
3. Gọi `activateSessionsForPayment`.
4. `error` → giữ giao dịch ở `NEEDS_REVIEW` với `reviewReason` phù hợp, vẫn ghi khối tài chính, trả
   `200` (đừng bắt SePay gửi lại — tiền đã về, vấn đề là nghiệp vụ nội bộ). Ghi một dòng
   `webhookLogs` mô tả lý do.
5. Thành công → thêm dòng thu-chi giống `worker.ts:1108-1124`, `rebuildRecon` +
   `rebuildReconEntries` (`worker.ts:1129-1130`).
6. `persistFinanceIfUnchanged` (đã có từ Phase 1). Chỉ khi ghi thành công mới gọi
   `persistStudentsMerged(env, nextStudents)` — đúng thứ tự của `worker.ts:1141-1142`, để biên lai
   không bao giờ thiếu mà số buổi đã cộng.
7. `writeAudit` với actor là một danh tính hệ thống (ví dụ `email: "sepay-webhook"`), để phân biệt
   với thao tác người dùng.

### Bước 4 — Chống kích hoạt hai lần

Đường chống trùng hiện có là `bankTransactions.some(... providerTransactionId ...)`
(`worker.ts:950`) và `receivable.status === "PAID"` → `DUPLICATE` (`sepay-engine.ts:354-356`). Thêm
một lớp nữa vì Phase 5 ghi sang hai khối dữ liệu:

- `activateSessionsForPayment` bỏ qua khi `ledger.receipts` đã có biên lai mang `paymentId` của
  `payment` **và** biên lai đó đã có `classId` (dấu hiệu đã kích hoạt xong).
- Test bắn lặp 3 lần và đếm số buổi.

### Bước 5 — Không đụng đường thu tay

`collectTuitionAction` (`worker.ts:1076-1150`) chỉ đổi ở chỗ gọi `buildTuitionReceipt` (Bước 1).
Mọi thứ khác giữ nguyên. Bộ `tests/vps-worker.test.ts` hiện có (`:517-591`) bao phủ đường này, phải
xanh y nguyên.

## Cách kiểm chứng

| # | Kiểm chứng | Cách làm |
|---|---|---|
| 1 | Sau webhook khớp tiền, `sessionBalances` của học viên đúng **ngay trong lượt đó** | `tests/vps-worker.test.ts`: bắn webhook rồi `GET /api/students`, so với kết quả của một lần `collect` tương đương |
| 2 | Biên lai webhook và biên lai thu tay giống nhau về cấu trúc | So hai object, bỏ `id`, `receiptNumber`, `paymentId`, `issuedAt`, `method`, `note` |
| 3 | **Phí học liệu không bị quy thành buổi học** | Lớp có `materialFees` cho tháng đó; bắn webhook; khẳng định `sessionBalances` bằng đúng số buổi tính phí, không cộng thêm phần học liệu |
| 4 | **Lớp thu theo tháng không bị tính phí lại** | Bắn webhook cho tháng 9; gọi `tuitionCollectionCharge` lần nữa; khẳng định `months` rỗng |
| 5 | Lớp khóa (`COURSE`) tính đúng | Lặp #3, #4 với `billingMode: "COURSE"` |
| 6 | Bắn lặp 3 lần không cộng buổi lần hai | Đếm `sessionBalances` và số `receipts` |
| 7 | Số tiền lệch thì không kích hoạt | Bắn webhook trả thiếu → giao dịch `NEEDS_REVIEW`, `sessionBalances` không đổi |
| 8 | Học viên miễn học phí không bị kích hoạt | `tuitionExempt: true` → `error`, không đổi dữ liệu |
| 9 | Webhook và `collect` chạy song song không mất dữ liệu | Test đồng thời; cả biên lai lẫn `sessionBalances` đều nhất quán |
| 10 | Đường thu tay không đổi hành vi | `npx tsx --test tests/tuition-billing.test.ts tests/vps-worker.test.ts tests/cashbook-collect-repro.test.ts` |
| 11 | Không vỡ kiểu | `npm run typecheck` |

## Rủi ro và đường lùi

| Rủi ro | Cách chặn |
|---|---|
| Cộng khống buổi do thiếu `materialsAmount` (R6) | Kiểm chứng #3, là test bắt buộc của phase |
| Tính phí lại tháng đã thu do thiếu `billingPeriod` (R6) | Kiểm chứng #4 |
| Số tiền lệch làm ghi nhận sai số tháng (R5) | Bước 2 mục 4: cổng `AMOUNT_MISMATCH`, thà để kế toán xử lý tay còn hơn ghi sai |
| Ghi hai khối (tài chính + học viên) không nguyên tử: ghi xong tài chính rồi tiến trình chết trước khi ghi học viên | Thứ tự ở Bước 3 mục 6 khiến hậu quả xấu nhất là "đã có biên lai, chưa cộng buổi" — phát hiện được và sửa được bằng `action: "match"` hoặc thu lại. Ngược lại thì không sửa được |
| Thay biên lai rút gọn bằng biên lai đầy đủ làm gãy liên kết hóa đơn/thu-chi | Bước 2 mục 5: giữ nguyên `id`, `receiptNumber`, `paymentId` |
| Webhook chạy lâu hơn giới hạn chờ của SePay do đọc thêm 3 khối dữ liệu | Đo thời gian xử lý trong test; nếu vượt, chuyển phần kích hoạt sang hàng chờ nội bộ xử lý ngay sau khi trả 200. **Không** gọi mạng ngoài trong lượt này (R1) |

**Đường lùi:** revert mã. Phase này không thêm cột, không đổi dữ liệu cũ. Biên lai đã sinh ra với
đầy đủ field vẫn hợp lệ với mã cũ vì các field đó đều optional (`sepay-engine.ts:99-112`).
