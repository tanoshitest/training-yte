# Phase 2 — Tầng repository thay thế KV

**Mục tiêu:** viết tầng lưu trữ mới đọc/ghi bảng quan hệ nhưng giữ **nguyên chữ ký hàm** mà
`worker.ts` đang dùng, để `worker.ts` không phải sửa một dòng nào.

## Bối cảnh

Toàn bộ truy cập dữ liệu của app đi qua `env.STEPS_LMS_DATA`, được lắp tại
`cloudflare/vps-server.ts:158-170`, với đúng ba hàm (`cloudflare/vps-server.ts:95-107`):

```ts
kv.get<T>(key, "json")                          // đọc cả khối, trả về T | null
kv.put(key, valueAsJsonString)                  // ghi đè cả khối
kv.compareAndPut(key, expectedJson, valueJson)  // ghi khi khối chưa bị ai đổi
```

Phía dưới là `PostgresStorage` (`cloudflare/vps-server.ts:41-93`) đọc/ghi bảng `vps_app_state`.
Thay tầng lưu trữ = viết một lớp mới cùng hợp đồng, định tuyến theo `key`.

## Thiết kế

**Định tuyến theo khóa.** Mỗi khóa đã biết được gắn với một repository; khóa chưa chuyển vẫn rơi
về `PostgresStorage` cũ. Nhờ vậy chuyển đổi được **từng nhóm một**, không phải làm tất cả rồi mới
chạy được.

| Khóa | Repository | Bảng đích |
|---|---|---|
| `students:steps-demo` | `studentRepo` | học viên + số dư buổi + tín dụng + tháng đã đóng |
| `classes:steps-demo` | `classRepo` | lớp + lịch học + danh sách ghi danh + phí học liệu |
| `sessions:steps-demo` | `sessionRepo` | buổi học + điểm danh + cột đánh giá |
| `finance:steps-demo` | `financeRepo` | thu chi + đối soát + lương + dự thu chi + sổ SePay |
| `teachers:` `accountants:` `assistants:` | `peopleRepo` | nhân sự |
| `settings:steps-demo` | `settingsRepo` | trung tâm, chi nhánh, phòng, loại lớp, ca học, gói |
| `audit:steps-demo` | `auditRepo` | nhật ký |
| còn lại (`backup:*`, `migration:*`, `do:*`) | giữ nguyên `vps_app_state` | — |

**Hợp đồng bắt buộc của mỗi repository:**

- `read()` dựng lại **đúng cấu trúc JSON mà `worker.ts` mong đợi**, kể cả thứ tự phần tử trong
  mảng và các trường rỗng. Đây là điều kiện để app chạy y như cũ.
- `write(next)` **so sánh với trạng thái hiện tại rồi chỉ ghi phần thay đổi**: thêm dòng mới,
  cập nhật dòng đổi, xóa dòng biến mất — tất cả trong **một transaction**.
- `compareAndPut` giữ nguyên ngữ nghĩa chống xung đột. Dùng một cột phiên bản cho mỗi nhóm dữ
  liệu, kiểm tra và tăng trong cùng transaction — tương đương cách `updatedAt` đang được dùng ở
  `cloudflare/vps-server.ts:83-87`.

**Lợi ích đạt được ngay ở phase này:** hai người sửa hai học viên khác nhau cùng lúc sẽ ghi vào
hai dòng khác nhau, không còn ghi đè cả khối của nhau.

## Việc cần làm

1. Tạo thư mục `cloudflare/storage/` chứa các repository, mỗi nhóm một file
   (`students-repository.ts`, `classes-repository.ts`, ...).
2. Viết lớp định tuyến `relational-kv.ts` cùng hợp đồng với `kv` hiện tại.
3. Thêm công tắc môi trường (ví dụ `STORAGE_MODE=kv|relational`) để chạy song song hai tầng phục
   vụ đối chiếu ở Phase 4. Đây là công tắc tạm, gỡ sau khi cắt chuyển xong.
4. Đấu công tắc vào `cloudflare/vps-server.ts:160` — đây là **điểm sửa duy nhất** ngoài thư mục
   `cloudflare/storage/`.
5. Viết test cho từng repository: dựng JSON từ bảng phải bằng JSON gốc; ghi một thay đổi nhỏ chỉ
   được chạm đúng những dòng liên quan; hai lượt ghi đồng thời không mất dữ liệu.

## File sẽ chạm

- `cloudflare/storage/*.ts` (tạo mới)
- `cloudflare/vps-server.ts` (sửa đúng chỗ lắp `STEPS_LMS_DATA`)
- `tests/*.test.ts` (thêm test mới, theo đúng cách các test hiện có trong `tests/` đang viết)
- **Không sửa** `cloudflare/worker.ts`

## Kiểm chứng

- `npm run typecheck` và `npm run lint` sạch.
- Test mới xanh, test cũ trong `tests/` không hồi quy.
- Với mỗi nhóm: `JSON.stringify(read())` bằng đúng JSON đang lưu trong `vps_app_state`.

## Rủi ro

`worker.ts` có thể dựa vào thứ tự phần tử trong mảng (ví dụ nhật ký mới nhất đứng đầu, danh sách
học viên theo thứ tự nhập). Repository phải tái lập đúng thứ tự đó, nếu không giao diện sẽ đảo lộn
dù dữ liệu vẫn đủ. Test so sánh JSON nguyên văn sẽ bắt được lỗi này.

## Đường lùi

Đặt `STORAGE_MODE=kv` là quay lại tầng cũ ngay lập tức, không cần build lại hay đụng dữ liệu.
