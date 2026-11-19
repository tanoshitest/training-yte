# STEPS LMS — 12 Activity Engines

Nguồn yêu cầu: `PLAN_STEPS_LMS_12_ACTIVITY_ENGINES.md`.

## Kiến trúc triển khai

- `activity-types.ts`: model dùng chung cho Builder, Worker và Portal Player.
- `activity-registry.ts`: registry duy nhất cho 12 engine, mode mặc định và validation.
- Durable Object của syllabus lưu game theo `lessonId`; game tách biệt với Teaching material và hệ bài tập cũ.
- Activity Builder đặt thành một khối riêng dưới Teaching material.
- Preview dùng route độc lập `/activity-preview/:syllabusId/:activityId` và mở tab mới.
- Portal chỉ nhận game có trạng thái `PUBLISHED`.
- Kết quả chơi được ghi vào KV theo học viên để phục vụ lịch sử/progress demo.

## Trạng thái

- [x] Audit code và chốt kiến trúc dữ liệu.
- [x] Model, registry và validation tích hợp vào storage/API.
- [x] Activity Builder và CRUD 12 loại.
- [x] Player/preview 12 loại.
- [x] Portal và attempt/progress.
- [x] Test, build, deploy và xác minh production.

## Kiểm thử hiện tại

- Registry có đúng 12 engine duy nhất.
- Tất cả engine tạo được draft hợp lệ và bộ dữ liệu demo xuất bản.
- Local Worker: login, seed 12 game, Portal nhận 12 game, preview HTTP 200, lưu attempt HTTP 201.
- TypeScript, ESLint, bundle và Wrangler dry-run đều đạt.
- Production: Worker version `d8033c55-72d5-41e4-8784-6170ead90112`; health OK, 12 engine đã seed, Portal nhận 12 game và preview HTTP 200.
