# Phase 1 — Thiết kế schema quan hệ bám nghiệp vụ thật

**Mục tiêu:** có một schema Prisma mới mô tả đúng nghiệp vụ đang chạy, đủ chỗ chứa mọi trường
dữ liệu hiện có, chưa chuyển dữ liệu và chưa sửa app.

## Bối cảnh

Schema Prisma hiện tại (`prisma/schema.prisma`) được thiết kế cho app Next.js với mô hình học
phí **theo gói buổi gắn Level** (`NormalPackage`: level × số buổi → giá) hoặc **trọn khóa IELTS**.
Nghiệp vụ thật đang chạy lại theo mô hình khác: **thu theo tháng hoặc theo khóa, có đơn giá từng
buổi, có phí học liệu theo tháng, số dư buổi có thể âm**. Không thể dùng lại schema đó.

Ví dụ đối chiếu trực tiếp từ dữ liệu thật:

| Trường có thật trong dữ liệu | Có chỗ chứa trong schema Prisma hiện tại? |
|---|---|
| `class.billingMode` = `"MONTHLY"` / `"COURSE"` | Không |
| `class.sessionPrice` = 65000 | Không |
| `class.courseSessions`, `class.courseStartDate`, `class.billingEnabled` | Không |
| `class.materialFees["2026-09"]` = { amount, description } | Không |
| `student.sessionBalances[classId]` = -4 (âm được) | Không |
| `student.tuitionCredits[classId]` | Không |
| `student.tuitionPaidThrough[classId]` = "YYYY-MM" | Không |
| `student.school`, `parentZalo`, `nationalId`, `tuitionExempt` | Không |
| `attendance.late`, `firstStatus`, `worksheetDone`, `vocabularyScore`, `assessmentScores` | Không |
| `session.assessmentColumns`, `attendanceColumnOrder`, `offSource` | Một phần |
| `finance.cashbook` (392 phiếu thu chi) | Không có bảng nào |
| `finance.recon` + `reconEntries` (đối soát) | Không có bảng nào |
| `finance.payroll`, `finance.forecasts` | Không có bảng nào |
| `finance.sepay.*` (receivables/payments/receipts...) | **Có** — nhóm model `Finance*`, nhưng chưa từng có migration |

## Việc cần làm

1. **Kiểm kê trường dữ liệu đầy đủ.** Đọc hết các file định nghĩa kiểu và đối chiếu với dữ liệu
   thật trong DB local, vì dữ liệu thật có thể chứa trường mà kiểu TypeScript không khai báo:
   - `cloudflare/people-types.ts` — học viên, giáo viên, kế toán, trợ giảng
   - `cloudflare/operations-types.ts` — lớp, lịch, buổi học, điểm danh, báo cáo định kỳ
   - `cloudflare/finance-types.ts` — thu chi, đối soát, lương, dự thu dự chi
   - `cloudflare/sepay-engine.ts` — sổ SePay (phải thu, lệnh thu, thanh toán, biên lai, hóa đơn)
   - `cloudflare/syllabus-storage.ts` — tài liệu syllabus (3 khối `do:document:*`)
   - khối `kv:settings:steps-demo` — trung tâm, chi nhánh, phòng, loại lớp, ca học, gói học phí
   - khối `kv:audit:steps-demo` — nhật ký

   Cách đối chiếu bằng SQL, ví dụ với học viên:
   ```sql
   SELECT DISTINCT jsonb_object_keys(item)
   FROM vps_app_state, jsonb_array_elements(value::jsonb) AS item
   WHERE key = 'kv:students%3Asteps-demo';
   ```
   Chạy tương tự cho từng nhóm. Kết quả là danh sách trường **thực tế**, không phải trường
   khai báo. Trường nào có trong dữ liệu mà thiếu trong schema mới là lỗi chặn.

2. **Xử lý quyết định D1** (đổi tên nhóm bảng cũ của app Next.js thành `legacy_*`) sau khi chủ
   dự án chốt. Các bảng này đang rỗng nên thao tác nhẹ và lùi được.

3. **Viết schema mới** trong `prisma/schema.prisma`, giữ nguyên quy ước đặt tên hiện có của dự án.
   Nguyên tắc thiết kế:
   - Mỗi thực thể một bảng, mỗi bản ghi một dòng. Không nhét mảng vào cột JSON khi mảng đó là
     tập thực thể (điểm danh, lịch học, phí học liệu đều tách bảng riêng).
   - Giữ nguyên **định danh gốc** (`student-import-0006`, `class-import-s1`) làm khóa chính dạng
     chuỗi. Không sinh id mới — đây là điều kiện bắt buộc để tầng repository dựng lại JSON giống
     hệt bản gốc và để không phải viết bảng ánh xạ id.
   - Giữ nguyên kiểu và ngữ nghĩa giá trị: số dư buổi vẫn cho phép âm, chuỗi rỗng vẫn là chuỗi
     rỗng (không tự đổi thành NULL), thứ tự phần tử trong mảng phải tái lập được (thêm cột thứ tự
     khi thứ tự có ý nghĩa).
   - Cột tiền dùng `Decimal` hoặc `Int` (đồng), không dùng `Float`.
   - Dữ liệu thật sự tự do (ví dụ `assessmentScores` do giáo viên tự đặt cột) vẫn để `Json` — đó
     là dữ liệu động, không phải thực thể.

4. **Sinh migration** bằng `npx prisma migrate dev`, chỉ chạy trên DB local.

## File sẽ chạm

- `prisma/schema.prisma` (sửa)
- `prisma/migrations/<mới>/migration.sql` (sinh tự động)

## Kiểm chứng

- `npx prisma migrate status` báo sạch trên DB local.
- Bảng đối chiếu "mọi trường thật đều có chỗ chứa" được lập thành bảng và rà soát hết, không còn
  dòng nào bỏ trống.
- Chưa có dữ liệu nào được chuyển ở phase này — các bảng mới rỗng là đúng.

## Rủi ro

Trường hiếm dùng chỉ xuất hiện ở vài bản ghi sẽ không lộ ra nếu chỉ xem một bản ghi mẫu. Bước 1
bắt buộc quét `DISTINCT jsonb_object_keys` trên **toàn bộ** mảng, không phải phần tử đầu tiên.

## Đường lùi

Chưa có dữ liệu nên chỉ cần `npx prisma migrate reset` trên DB local rồi restore lại từ file zip
backup.
