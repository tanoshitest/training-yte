# Chuyển tầng lưu trữ từ KV/JSON sang PostgreSQL quan hệ

**Trạng thái:** Phase 1–4 đã thực thi xong ở local (2026-09-21). Phase 5 chưa làm, production
chưa bị đụng tới. Kết quả và số liệu: [`plans/reports/thuc-thi-260921-2258-chuyen-kv-sang-postgres-quan-he.md`](../reports/thuc-thi-260921-2258-chuyen-kv-sang-postgres-quan-he.md)
**Ngày lập:** 2026-09-21
**Nhánh:** `main`

## Kết quả mong muốn

App đang chạy production (`cloudflare/worker.ts` qua `cloudflare/vps-server.ts`) giữ nguyên
100% giao diện và nghiệp vụ, nhưng dữ liệu được lưu trong các bảng PostgreSQL quan hệ chuẩn
thay vì các khối JSON lớn trong bảng `vps_app_state`. Nhân viên trung tâm không thấy bất kỳ
khác biệt nào khi sử dụng.

## Vì sao làm

Hiện mỗi nhóm dữ liệu là **một dòng JSON duy nhất**: toàn bộ 936 học viên nằm trong một khối
458KB, toàn bộ tài chính trong một khối 1.04MB, toàn bộ buổi học và điểm danh trong một khối
1.2MB. Hệ quả:

- Sửa một học viên phải ghi lại toàn bộ khối JSON của tất cả học viên.
- Hai người thao tác cùng lúc trên cùng một khối có nguy cơ ghi đè mất thay đổi của nhau.
- Không truy vấn, thống kê, đối chiếu bằng SQL trực tiếp được.
- Khối dữ liệu phình dần theo thời gian, đọc/ghi chậm dần.

## Ràng buộc

1. **Không được ảnh hưởng app production.** Toàn bộ Phase 1–4 thực hiện trên máy local, trên
   bản sao dữ liệu đã restore. Không kết nối, không ghi gì lên VPS.
2. **Không sửa nghiệp vụ.** Đây là thay đổi tầng lưu trữ, không phải cơ hội để "tiện tay" sửa
   logic tính học phí, điểm danh hay bất cứ quy tắc nào.
3. **Không mất dữ liệu.** Mọi trường dữ liệu đang tồn tại phải có chỗ chứa trong schema mới.
   Thiếu chỗ chứa thì sửa schema, không được lược bỏ dữ liệu.
4. **Có đường lùi ở mọi bước.** Bản backup `backups/stepslms_local_pre-migration_20260921-221324.zip`
   là điểm khôi phục gốc cho toàn bộ quá trình.

## Không làm (non-goals)

- Không chuyển dữ liệu sang schema Prisma hiện có của app Next.js (`src/`). Schema đó mô tả một
  mô hình học phí khác (gói buổi theo Level / trọn khóa IELTS) không khớp nghiệp vụ thật đang
  chạy (thu theo tháng, đơn giá buổi, phí học liệu theo tháng). Dùng nó sẽ mất dữ liệu.
- Không viết thêm tính năng mới cho người dùng cuối.
- Không đụng vào 8 bản snapshot `backup:*` và 6 cờ `kv:migration:*` — giữ nguyên tại chỗ.
- Không triển khai lên production trong phạm vi plan này (xem Phase 5, cần quyết định riêng).

## Tiêu chí nghiệm thu

| # | Tiêu chí | Cách kiểm chứng |
|---|---|---|
| 1 | Không mất bản ghi | Đếm khớp tuyệt đối: 936 học viên, 63 lớp, 289 buổi học, 13 giáo viên, 392 phiếu thu chi, 479 khoản phải thu, 394 thanh toán, 392 biên lai |
| 2 | Không mất trường dữ liệu | Với mỗi bản ghi, đọc lại từ bảng quan hệ và dựng lại JSON phải **giống hệt** JSON gốc (so sánh sâu từng trường) |
| 3 | App chạy y như cũ | Chạy app local trên tầng lưu trữ mới, đối chiếu từng màn hình với app local chạy tầng cũ |
| 4 | Số liệu tài chính khớp | Tổng thu, tổng chi, công nợ từng học viên khớp tuyệt đối giữa hai bên |
| 5 | Ghi đồng thời an toàn | Hai thao tác ghi cùng lúc trên hai học viên khác nhau không làm mất thay đổi của nhau |

## Các phase

| Phase | Nội dung | Phụ thuộc | File |
|---|---|---|---|
| 1 | Thiết kế schema quan hệ bám nghiệp vụ thật | — | [phase-1-thiet-ke-schema.md](phase-1-thiet-ke-schema.md) |
| 2 | Viết tầng repository thay thế KV | Phase 1 | [phase-2-tang-repository.md](phase-2-tang-repository.md) |
| 3 | Script chuyển đổi dữ liệu | Phase 1 | [phase-3-chuyen-du-lieu.md](phase-3-chuyen-du-lieu.md) |
| 4 | Đối chiếu và chạy thử song song ở local | Phase 2, 3 | [phase-4-doi-chieu.md](phase-4-doi-chieu.md) |
| 5 | Cắt chuyển production | Phase 4 + quyết định riêng của chủ dự án | [phase-5-cat-chuyen.md](phase-5-cat-chuyen.md) |

## Điểm cắt kỹ thuật (vì sao khả thi với rủi ro thấp)

Toàn bộ truy cập dữ liệu của app đi qua đúng **một interface 3 hàm** tại
`cloudflare/vps-server.ts:95-107`:

```
kv.get(key, "json")                    → đọc cả khối
kv.put(key, jsonString)                → ghi đè cả khối
kv.compareAndPut(key, expected, json)  → ghi có kiểm tra xung đột
```

`worker.ts` (2247 dòng) chỉ gọi qua `env.STEPS_LMS_DATA` và **không cần sửa một dòng nào**.
Thay tầng lưu trữ nghĩa là viết lại đúng 3 hàm này để đọc/ghi bảng quan hệ. Việc chuyển đổi
có thể làm **từng nhóm dữ liệu một** (học viên trước, rồi lớp, rồi buổi học...), nhóm chưa
chuyển vẫn chạy trên khối JSON như cũ.

## Quyết định cần chủ dự án chốt trước khi thực thi

| # | Quyết định | Đề xuất của tôi | Đã chốt |
|---|---|---|---|
| D1 | Xử lý các bảng quan hệ cũ của app Next.js (`students`, `classes`... hiện đang rỗng, thuộc app sắp ngừng dùng) | Đổi tên thành `legacy_*` để nhường tên sạch cho schema mới. Không xóa — đổi tên bảng rỗng là thao tác nhẹ và lùi lại được | Chọn đổi tên `legacy_*` (2026-09-21) |
| D2 | Mức độ lịch sử dữ liệu cần giữ | Xem mục "Giới hạn về dữ liệu lịch sử" bên dưới | Giữ nguyên trạng thái hiện tại kèm 8 snapshot tại chỗ |

## Giới hạn về dữ liệu lịch sử (cần biết trước)

Yêu cầu "đủ data từ trước đến nay" có một giới hạn khách quan **không nằm ở cách làm mà nằm ở
dữ liệu hiện có**:

- **Trạng thái hiện tại: đầy đủ.** 936 học viên, 63 lớp, toàn bộ tài chính, buổi học, điểm danh.
- **Lịch sử thay đổi: chỉ còn một phần.** Mô hình KV ghi đè cả khối mỗi lần lưu, nên trạng thái
  trước đó không được giữ lại. Những gì còn:
  - 8 bản snapshot `backup:*` (ngày 13/09 và 15/09) do app tự tạo trước vài thao tác hàng loạt.
  - Nhật ký `audit` nhưng **bị cắt trần ở 1000 dòng** (code `worker.ts:701` cắt `.slice(0, 1000)`),
    nghĩa là nhật ký cũ hơn đã mất vĩnh viễn từ trước, không phải do việc chuyển đổi này.
- **Sau khi chuyển sang quan hệ, lịch sử sẽ được giữ đúng cách về sau:** mỗi bản ghi có vòng đời
  riêng, nhật ký không còn bị cắt trần.

Kế hoạch xử lý: chuyển toàn bộ trạng thái hiện tại không thiếu trường nào, giữ nguyên 8 snapshot
tại chỗ trong `vps_app_state` (và trong file zip backup) để tra cứu khi cần.

### Đã kiểm chứng: dữ liệu hiện tại là bản đầy đủ nhất

Trên VPS còn một database cũ tên `steps_recovery_sep14_20260919`. Đã đối chiếu trực tiếp và kết
luận **không có dữ liệu nào bị mất** ở bản đang chạy:

| Nhóm | Bản recovery (14/09) | Bản đang chạy | Kết luận |
|---|---|---|---|
| Khoản phải thu | 113 | 479 | Tăng |
| Thanh toán | 5 | 394 | Tăng |
| Biên lai | 3 | 392 | Tăng |
| Phiếu thu chi | 3 | 392 | Tăng |
| Học viên | 326KB | 458KB | Tăng |
| Buổi học | 769KB | 1.2MB | Tăng |
| **Khối tài chính (tổng)** | **6.4MB** | **1.04MB** | Giảm — nhưng không mất dữ liệu |

Khối tài chính nhỏ đi vì mỗi lệnh thu trước đây nhúng ảnh QR dạng base64 nặng ~55KB
(`qrUrl` chiếm 55.397 byte/bản ghi), sau đó commit `c5c3f2c` ("gọn payload QR finance") đổi sang
lưu đường dẫn ngắn (284 byte/bản ghi). Số trường giữ nguyên y hệt, chỉ khác độ dài giá trị.

Việc này cũng là một lưu ý cho Phase 1: `qrUrl` nay là đường dẫn ngắn, không cần thiết kế cột cho
dữ liệu ảnh nhúng.

## Rủi ro chính

| Rủi ro | Mức | Cách chặn |
|---|---|---|
| Schema mới thiếu chỗ chứa một trường ít dùng, phát hiện muộn | Cao | Tiêu chí nghiệm thu #2: dựng lại JSON và so sánh sâu từng trường, không so bằng mắt |
| Nghiệp vụ tài chính phức tạp (tín dụng buổi nghỉ, khóa kế tiếp) bị hiểu sai khi map | Cao | Phase 3 chỉ chuyển dữ liệu, tuyệt đối không tính toán lại. Giá trị nào đang lưu thì chép nguyên giá trị đó |
| Ghi đồng thời qua tầng mới có hành vi khác tầng cũ | Trung bình | Phase 2 giữ nguyên ngữ nghĩa `compareAndPut`; có test riêng cho tình huống ghi đồng thời |
| Cắt chuyển production gặp sự cố | Cao | Phase 5 tách riêng, có backup trước, có khung giờ vắng, có kịch bản lùi về KV trong vài phút |

## Đường lùi tổng thể

Mọi phase từ 1 đến 4 chạy trên máy local. Hỏng ở bất kỳ đâu thì khôi phục bằng:

```
docker exec stepslms-postgres pg_restore -U stepslms -d stepslms \
  --no-owner --no-privileges --clean --if-exists -j 4 /tmp/restore.dump
```

(file lấy từ `backups/stepslms_local_pre-migration_20260921-221324.zip`)

Production không bị đụng tới cho đến khi Phase 5 được duyệt riêng.
