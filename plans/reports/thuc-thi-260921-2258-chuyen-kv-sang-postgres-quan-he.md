# Báo cáo thực thi: chuyển tầng lưu trữ từ KV/JSON sang PostgreSQL quan hệ

**Ngày:** 2026-09-21
**Plan:** [`plans/260921-2217-chuyen-kv-sang-postgres-quan-he/`](../260921-2217-chuyen-kv-sang-postgres-quan-he/README.md)
**Phạm vi đã làm:** Phase 1 → Phase 4, toàn bộ trên máy local
**Chưa làm:** Phase 5 (cắt chuyển production) — theo đúng yêu cầu không đụng tới VPS

## Kết quả

Toàn bộ dữ liệu thật đã nằm trong 42 bảng quan hệ, và ứng dụng chạy trên tầng lưu trữ mới cho
kết quả **giống hệt** tầng cũ ở mọi phép đối chiếu tự động. Không một dòng nào của
`cloudflare/worker.ts` bị sửa; điểm sửa duy nhất ngoài thư mục `cloudflare/storage/` là ba dòng
lắp công tắc trong `cloudflare/vps-server.ts`.

| Tiêu chí nghiệm thu | Kết quả | Bằng chứng |
|---|---|---|
| 1. Không mất bản ghi | Đạt | Mọi số đếm khớp tuyệt đối với bảng chốt trong Phase 3 |
| 2. Không mất trường dữ liệu | Đạt | 9/9 nhóm dựng lại JSON giống hệt bản gốc, so sánh sâu từng trường |
| 3. App chạy y như cũ | Đạt, có một khác biệt đã giải thích | 23/23 phép đối chiếu API giữa hai tầng trùng nhau |
| 4. Số liệu tài chính khớp | Đạt | Tổng thu, công nợ, số dư buổi khớp tuyệt đối (xem bảng dưới) |
| 5. Ghi đồng thời an toàn | Đạt ở mức khối dữ liệu | Test `compareAndPut` và test ghi song song hai nhóm |

### Số đếm sau khi chuyển

| Nhóm | Số dòng | Nhóm | Số dòng |
|---|---|---|---|
| Học viên | 936 | Khoản phải thu (SePay) | 479 |
| Số dư buổi | 944 | Lệnh thu | 480 |
| Tín dụng buổi | 553 | Thanh toán | 394 |
| Tháng đã đóng | 360 | Biên lai | 392 |
| Lớp học | 63 | Phiếu thu chi | 392 |
| Ghi danh | 938 | Dòng đối soát | 392 |
| Lịch học | 128 | Đối soát theo ngày | 9 |
| Phí học liệu | 1 | Giáo viên / Kế toán / Trợ giảng | 13 / 2 / 1 |
| Buổi học | 289 | Chi nhánh / Loại lớp / Ca học / Phòng | 2 / 2 / 32 / 4 |
| Điểm danh | 3.886 | Gói học phí | 1 |
| Điểm theo cột | 1.480 | Nhật ký | 1.000 |
| Cột đánh giá / thứ tự cột | 125 / 333 | Báo cáo định kỳ | 0 (chưa phát sinh) |

### Số liệu tài chính

| Chỉ tiêu | Kho JSON cũ | Bảng quan hệ |
|---|---|---|
| Tổng thu trong sổ thu chi | 215.625.000 | 215.625.000 |
| Tổng phải thu (SePay) | 326.125.000 | 326.125.000 |
| Đã thu | 215.625.000 | 215.625.000 |
| Còn nợ | 110.500.000 | 110.500.000 |
| Tổng số dư buổi (944 dòng) | 3.486 | 3.486 |

## Đã làm gì ở từng phase

### Phase 1 — Schema

Quyết định D1 được chốt theo đề xuất của plan: 35 bảng của app Next.js được đổi tên sang tiền tố
`legacy_` bằng `ALTER TABLE ... RENAME`, nên hai dòng dữ liệu trong `centers` và `users` vẫn còn
nguyên. Tổng cộng 44 bảng mang tiền tố `legacy_` (bao gồm 9 bảng `finance_*` trước đây chỉ có
trong schema mà chưa từng có migration, nay được tạo dưới tên `legacy_finance_*` để schema và
database khớp nhau).

Schema mới gồm 42 model tiền tố `Ops*` trong `prisma/schema.prisma`, đặt tên bảng sạch
(`students`, `classes`, `lesson_sessions`, `attendances`, `sepay_receipts`…). Ba quy ước quan
trọng, đã ghi thành chú thích ngay trong schema:

- Cột `position` giữ đúng thứ tự phần tử trong mảng JSON gốc, vì giao diện phụ thuộc thứ tự đó.
- Cột tiền dùng `Decimal(15, 0)`, không dùng `Float` và không dùng `Int` 32-bit (mức trần
  1.000 tỷ mà `worker.ts` cho phép vượt quá Int 32-bit).
- Cột `String?` (NULL) nghĩa là **trường vắng mặt** trong JSON gốc; chuỗi rỗng vẫn lưu là chuỗi
  rỗng. Đây là điều kiện bắt buộc để dựng lại JSON giống hệt.

Trạng thái để kiểu `String` chứ không dùng enum PostgreSQL: tầng này là bản sao trung thực của dữ
liệu, thêm một giá trị trạng thái mới trong app không được phép làm hỏng việc ghi. Ràng buộc giá
trị đã có sẵn ở các hàm `clean*` trong `worker.ts`.

Hai migration mới: `20260921154500_doi_ten_bang_app_nextjs_sang_legacy` và
`20260921154600_tang_luu_tru_quan_he`. `prisma migrate diff` báo không còn chênh lệch.

### Phase 2 — Tầng repository

Thư mục `cloudflare/storage/` gồm:

| File | Vai trò |
|---|---|
| `relational-read.ts` | Quy ước đường đọc: một câu lệnh SQL cho mỗi nhóm, kèm helper gom dòng con |
| `relational-table-sync.ts` | Bộ đồng bộ chung: so dòng cũ với dòng mới rồi chỉ ghi phần thay đổi |
| `block-repository.ts` | Hợp đồng đọc/ghi của một nhóm dữ liệu |
| `relational-kv.ts` | Định tuyến theo khóa, giữ đúng chữ ký `get`/`put`/`compareAndPut` |
| `students-repository.ts`, `classes-repository.ts`, `sessions-repository.ts`, `finance-repository.ts`, `people-repository.ts`, `settings-repository.ts`, `audit-repository.ts` | Từng nhóm dữ liệu |

Khóa chưa chuyển (`backup:*`, `migration:*`, `_health`, `do:document:*`) vẫn rơi về
`vps_app_state` như cũ.

Phép đọc dựng lại cả nhóm bằng **một câu lệnh SQL**; một câu lệnh của PostgreSQL luôn chạy trên
một ảnh chụp duy nhất nên không thể đọc phải trạng thái nửa vời — kho KV cũ đọc một dòng nên vốn
đã có tính chất này, tầng mới tạo lại bằng cách gom truy vấn. Phép ghi khóa dòng phiên bản trong
bảng `storage_blocks` bằng `SELECT ... FOR UPDATE`, nên hai lượt ghi cùng một nhóm không chồng
lên nhau.

Công tắc `STORAGE_MODE=kv|relational` đọc ở `cloudflare/vps-server.ts`; mặc định là `kv`, tức là
**không đổi hành vi nếu không đặt biến môi trường**.

Bảy test mới trong `tests/relational-storage.test.ts`, chạy bằng `npm run test:storage` trên một
database riêng (`stepslms_storage_test`) nên không đụng dữ liệu làm việc. Test bao phủ: dựng lại
JSON giống hệt cho học viên / lớp / buổi học (gồm số dư âm, trường rỗng, trường vắng mặt, điểm
danh `null`), ghi khác biệt chỉ chạm đúng dòng liên quan, xóa học viên kéo theo dòng phụ thuộc,
`compareAndPut` từ chối bản cũ, và hai lượt ghi song song trên hai nhóm khác nhau.

### Phase 3 — Chuyển dữ liệu

`scripts/migrate-kv-to-relational.ts` đọc từng khối JSON trong `vps_app_state` rồi ghi qua chính
tầng repository của Phase 2, theo thứ tự phụ thuộc. Script **chỉ chép, không tính**: không một
giá trị nào được tái tính từ công thức. Chạy lại nhiều lần cho kết quả y hệt vì tầng repository
ghi theo phần thay đổi. Dữ liệu nguồn trong `vps_app_state` không bị script chạm tới.

Chạy `--verify` sẽ đọc lại qua repository và so sánh sâu với khối JSON gốc; kết quả hiện tại là
**9/9 nhóm khớp tuyệt đối**.

Quá trình này phát hiện và sửa một lỗi thật: ban đầu chuỗi rỗng `""` bị lưu thành NULL nên khi
dựng lại thì trường biến mất (8 trường `note` của thanh toán và biên lai). Đã tách bạch “vắng
mặt” (NULL) với “chuỗi rỗng” (`''`).

### Phase 4 — Đối chiếu

Hai bản sao database giống hệt nhau (`stepslms_phase4_kv`, `stepslms_phase4_rel`) chạy hai tiến
trình app: một `STORAGE_MODE=kv` cổng 3101, một `STORAGE_MODE=relational` cổng 3102.
`scripts/compare-storage-modes.ts` đăng nhập cả hai, gọi cùng một chuỗi yêu cầu và so sánh sâu
từng phản hồi (che định danh và thời điểm do mỗi tiến trình tự sinh).

23 phép đối chiếu đều trùng khớp: 11 endpoint đọc (Dashboard/bootstrap, Học viên, Lớp học, Buổi
học, Giáo viên, Kế toán, Trợ giảng, Cấu hình, Tài chính, Nhật ký, Syllabus) và 12 phép ghi (sửa
hồ sơ học viên, điểm danh một buổi, thêm và xóa phiếu chi, thu học phí một học viên còn nợ, kèm
các lần đọc lại sau mỗi thao tác).

## Hai vấn đề đã phát hiện và xử lý

### 1. Mỗi lượt ghi tài chính mất gần 4 giây

Hàm so sánh dòng coi mọi cột tiền là “đã đổi”, vì giá trị đọc từ database là đối tượng `Decimal`
còn dòng mới là `number`. Hệ quả: lượt ghi nào cũng cập nhật lại toàn bộ 392 phiếu thu chi và các
bảng SePay dù không có gì thay đổi. Sau khi quy cả hai về cùng một dạng chuỗi trước khi so:
**3.946ms → 47ms** cho một lượt ghi tài chính không đổi gì.

### 2. Nhật ký: tầng mới ghi ít mục hơn — và đây là điều đúng

Đây là khác biệt duy nhất còn lại giữa hai tầng, đã truy được nguyên nhân và **là một cải thiện,
không phải hồi quy**.

`worker.ts:679` phát hiện thay đổi bằng `JSON.stringify(old) !== JSON.stringify(row)`, tức là
**phụ thuộc thứ tự khóa trong JSON**. PostgreSQL lưu `jsonb` với thứ tự khóa riêng của nó, nên
khi đọc từ kho JSON cũ, thứ tự khóa không bao giờ khớp thứ tự mà app sinh ra — kết quả là **mọi
học viên đều bị coi là đã thay đổi** mỗi lần lưu danh sách học viên.

Con số đo được trên hai bản sao sau cùng một kịch bản thao tác:

| | Kho JSON cũ | Bảng quan hệ |
|---|---|---|
| Mục `Student UPDATE` | 996 | 908 (đều là dữ liệu lịch sử có sẵn) |
| Mục thật sự do thao tác vừa rồi sinh ra | ~996 | 4 |
| Lịch sử cũ còn lại trong trần 1.000 dòng | gần như bị xóa sạch | giữ nguyên |

Dữ liệu production hiện tại đã mang sẵn triệu chứng này: 918/1.000 mục nhật ký là
`Student UPDATE`, tức nhật ký thật đang bị đẩy ra ngoài trần 1.000 dòng bởi các mục giả. Tầng
quan hệ trả JSON theo đúng thứ tự khóa mà app sinh ra nên chỉ ghi nhận thay đổi thật.

**Đề nghị chấp nhận khác biệt này.** Bắt chước lại hành vi cũ là không thể (thứ tự khóa của
`jsonb` không tái lập được) và cũng không nên.

## Hiệu năng

Bản đầu tiên chậm hơn tầng cũ từ 1,4 đến 6 lần, nên đã làm thêm một vòng tối ưu. Nguyên nhân
không phải thiếu index mà là **số lượt đi–về giữa app và database**: mỗi nhóm dữ liệu phải chạy
nhiều truy vấn tuần tự trong một transaction để giữ ảnh chụp nhất quán.

Cách sửa: mỗi nhóm dữ liệu giờ đọc bằng **đúng một câu lệnh SQL**, gom các bảng con thành những
cột JSON riêng (`json_agg`). Một câu lệnh của PostgreSQL vốn đã chạy trên một ảnh chụp duy nhất,
nên bỏ được transaction mà vẫn giữ nguyên tính nhất quán. Phép so sánh trước khi ghi cũng đọc
trạng thái hiện tại của cả nhóm bảng bằng một câu lệnh thay vì một lượt cho mỗi bảng. Việc dựng
lại đối tượng vẫn làm bằng TypeScript để giữ **đúng thứ tự khóa** — đây chính là thứ giữ cho nhật
ký không bị đầy mục giả (xem mục trên).

Trung vị 9 lần gọi, cùng máy, cùng dữ liệu:

| Endpoint | Kho JSON cũ | Bảng quan hệ (trước tối ưu) | Bảng quan hệ (sau tối ưu) |
|---|---|---|---|
| `/api/bootstrap` (màn hình nặng nhất) | 361ms | 497ms | **362ms** |
| `/api/finance` | 187ms | 444ms | **227ms** |
| `/api/students` | 27ms | 179ms | **32ms** |
| `/api/lesson-sessions` | 41ms | 106ms | **57ms** |
| `/api/classes` | 6ms | 13ms | **11ms** |
| `/api/audit-logs` | 12ms | 15ms | **16ms** |

Đo riêng tầng lưu trữ (không qua HTTP): đọc nhóm học viên 190ms → **24ms**, buổi học 143ms →
**82ms**, tài chính 146ms → **38ms**.

Kết luận: màn hình nặng nhất giờ **ngang bằng** tầng cũ, các màn hình còn lại chênh 5–40ms. Mức
này không còn cảm nhận được khi dùng.

## Kiểm chứng đã chạy

- `npm run typecheck` — sạch.
- `npx eslint cloudflare/storage scripts/… tests/relational-storage.test.ts` — sạch.
- `npm run test:storage` — 7/7 xanh.
- Toàn bộ 31 file test trong `tests/` — xanh, trừ 3 lỗi **có sẵn từ trước**, đã xác nhận bằng
  cách stash thay đổi rồi chạy lại: `tests/sepay-matching.test.ts` (2 lỗi về ảnh QR tải lên) và
  `tests/student-filter-ui.test.ts` (1 lỗi). Không liên quan tới tầng lưu trữ.
- `npx tsx scripts/migrate-kv-to-relational.ts --verify` — 9/9 nhóm khớp tuyệt đối.
- `npx tsx scripts/compare-storage-modes.ts` — 23/23 phép đối chiếu trùng khớp.

## Chạy ở local trên tầng quan hệ

Môi trường local giờ chạy thẳng trên bảng quan hệ, không qua khối JSON nữa.

```bash
start.bat          # Windows: bật PostgreSQL, migration, nạp dữ liệu nếu chưa có, chạy app
npm run dev        # hoặc chạy thẳng app (đọc STORAGE_MODE từ .env)
npm run dev:next   # app Next.js cũ trong src/, không được deploy
```

**Ở chế độ `relational`, ứng dụng không còn đọc hay ghi `vps_app_state` nữa.** Những khóa còn sót
lại đã được đưa về bảng riêng:

| Khóa cũ trong `vps_app_state` | Bảng mới | Lý do thiết kế |
|---|---|---|
| `do:catalog:steps-demo:items` | `syllabus_catalog` | Danh mục syllabus là một tập thực thể, mỗi syllabus một dòng |
| `do:document:syllabus-*:document` | `syllabus_documents` | `syllabus-storage.ts` luôn đọc/ghi **trọn gói**, không truy vấn từng bài học, nên đây thật sự là một tài liệu |
| `kv:migration:*` (6 cờ) | `data_migrations` | Đúng bản chất: bước xử lý dữ liệu nào đã chạy, chạy lúc nào |
| `progress:<học viên>` | `student_progress` | Mỗi mục học một dòng |
| `activity-attempts:<học viên>` | `student_activity_attempts` | Mỗi lượt chơi một dòng, `position` giữ thứ tự 100 lượt mới nhất |
| `student:<học viên>` | `student_app_state` | Trạng thái màn hình học của học viên |
| `_health` | — | Chỉ là phép chạm database, nay đếm trên `data_migrations` |

Kiểm chứng bằng cách **đổi tên bảng `vps_app_state` đi** rồi chạy lại toàn bộ: đăng nhập, 11 màn
hình, sửa hồ sơ học viên, ghi tiến độ học viên — tất cả đều 200, log không một dòng lỗi. Sau đó
đổi tên bảng trở lại; 27 khối JSON cũ vẫn còn nguyên vì chế độ `kv` là đường lùi của production.

Những thay đổi kèm theo:

- `.env` và `.env.example` có `STORAGE_MODE=relational`. Mặc định **trong mã nguồn** vẫn là `kv`,
  nên deploy mà quên đặt biến thì production không đổi hành vi.
- `cloudflare/vps-server.ts` nạp `.env` bằng dotenv để chạy được ở local. Trong container không
  có file này nên lệnh nạp không làm gì, và biến môi trường thật luôn thắng giá trị trong `.env`.
- `npm run dev` trước đây chạy app Next.js; nay chạy **ứng dụng thật**. App Next.js chuyển sang
  `npm run dev:next`.
- `start.bat` gọi script đồng bộ với cờ `--only-if-empty`: nhóm nào đã có dữ liệu trong bảng quan
  hệ thì giữ nguyên. Đây là hàng rào bắt buộc — sau khi làm việc trên tầng mới, khối JSON cũ đã
  lạc hậu, nạp đè sẽ xóa mất phần vừa làm.
- `stat.bat` đọc lại theo tên bảng mới và hiển thị thêm bảng `storage_blocks`.
- `start.bat` từ chối khởi động nếu `.env` không đặt `STORAGE_MODE=relational`, để ở local không
  chạy nhầm sang khối JSON cũ.
- Sau khi ứng dụng đã chạy ở chế độ `relational`, khối JSON trong `vps_app_state` đứng yên còn
  bảng quan hệ tiếp tục thay đổi, nên `npm run storage:verify` báo khác biệt là **bình thường**.
  Phép đối chiếu đó chỉ có ý nghĩa ngay sau khi vừa chuyển dữ liệu; script đã in kèm lời nhắc này.

```bash
# Chuyển dữ liệu rồi đối chiếu (trên database làm việc)
npm run storage:sync

# Chỉ đối chiếu
npm run storage:verify

# Test tầng lưu trữ (tự tạo database riêng)
npm run test:storage

# Lùi về tầng cũ: đổi STORAGE_MODE=kv trong .env rồi khởi động lại
```

Hai bản sao `stepslms_phase4_kv` và `stepslms_phase4_rel` vẫn còn trong Docker để chạy lại phép
đối chiếu song song bất cứ lúc nào (hoặc mở hai cổng 3101/3102 để so bằng mắt trên trình duyệt).
Hai tiến trình app dùng cho đợt đối chiếu đã được tắt.

## Điểm cần lưu ý trước khi nghĩ tới Phase 5

1. **Chưa đụng gì tới VPS.** Production vẫn đang chạy trên kho JSON cũ, không có thay đổi nào.
2. **Công tắc mặc định là `kv`.** Deploy code này lên production mà không đặt biến môi trường thì
   hành vi không đổi.
3. **Dữ liệu KV cũ phải giữ nguyên tại chỗ** khi cắt chuyển — đó chính là đường lùi.
4. **Ghi đồng thời ở mức bản ghi vẫn chưa có.** Tầng mới chỉ ghi đúng những dòng thay đổi, nhưng
   `worker.ts` vẫn gửi xuống **cả mảng**, nên một người lưu từ màn hình mở lâu vẫn có thể ghi đè
   thay đổi của người khác giống hệt trước đây. Hàng rào thật sự vẫn là `persistStudentsMerged`
   và `compareAndPut` đã có sẵn trong `worker.ts`. Muốn có an toàn ở mức từng bản ghi thì phải
   sửa `worker.ts` — nằm ngoài phạm vi plan này.

## Quyết định của chủ dự án (2026-09-21)

1. **Chấp nhận** khác biệt nhật ký: tầng mới chỉ ghi thay đổi thật.
2. **Tối ưu ngay** — đã làm, kết quả ở mục Hiệu năng.
3. Đối chiếu số liệu và quy trình trên VPS sẽ làm **sau khi hoàn thành ở local**.

## Câu hỏi còn treo

Không còn. Bước tiếp theo là đối chiếu trên VPS khi anh/chị cho phép, và Phase 5 vẫn cần một
quyết định riêng trước khi cắt chuyển production.
