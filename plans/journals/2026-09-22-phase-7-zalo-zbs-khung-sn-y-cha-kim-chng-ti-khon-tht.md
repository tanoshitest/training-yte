---
title: "Phase 7 Zalo ZBS: khung sườn đầy đủ, chưa kiểm chứng tài khoản thật"
date: 2026-09-22
summary: "Xây xong Phase 6 hoàn tất + Phase 7 (client, outbox, webhook, UI) theo plan tích hợp SePay/MISA/Zalo; unverified rõ ràng trong code, chờ tài khoản OA/ZBS thật"
---

# Phase 7 Zalo ZBS: khung sườn đầy đủ, chưa kiểm chứng tài khoản thật

## Bối cảnh
Tiếp tục `/ak:cook plans/260922-0846-tich-hop-sepay-misa-zalo/README.md --auto` sau khi Phase 6 (hóa đơn MISA) đã đóng ở phiên trước. Phiên này đóng nốt kiểm chứng Phase 6 rồi làm trọn Phase 7 (Zalo ZBS).

## Việc đã làm
- Phase 6: viết `tests/invoice-outbox.test.ts` (6 test: R1, dedup đồng thời, cứu PROCESSING kẹt, capping retryCount, MISA tắt), thêm assertion hóa đơn giữ PENDING sau webhook vào `vps-worker.test.ts`. Full suite 271/274 pass (3 lỗi baseline), lint 74 lỗi baseline không đổi.
- Phase 7: research thật qua WebSearch/WebFetch tìm được PDF chính thức "ZBS Template Message API" (stc-cms-developers.zdn.vn) xác nhận endpoint gửi qua UID và cấu trúc OAuth refresh token (rotate mỗi lần dùng). Endpoint gửi qua SĐT và webhook callback vẫn suy luận từ quy ước ZNS công khai — CHƯA xác nhận bằng tài khoản thật.
- File mới: `cloudflare/phone-format.ts`, `cloudflare/zalo-zbs-client.ts`, `cloudflare/zalo-outbox.ts`, `cloudflare/zalo-webhook-auth.ts`.
- Wiring vào `worker.ts`: enqueue sau `request-payment` (5a) và sau hóa đơn ISSUED trong `invoice-outbox.ts` (5b), route `/api/webhooks/zalo`, `/api/zalo-messages` (GET + retry), ping provider "zalo".
- Migration `20260922092022_them_processingat_cho_log_tin_zalo` (additive, thêm `processingAt` cho `zalo_message_logs` để hàng chờ tự cứu dòng kẹt PROCESSING, giống mẫu MISA Phase 6).
- UI `app.js`: trang "Nhật ký Zalo" (`/ke-toan/tin-zalo`), nút "Kiểm tra kết nối" Zalo trong Cài đặt → Tích hợp.
- Test mới: `phone-format.test.ts`, `zalo-zbs.test.ts`, `zalo-outbox.test.ts`, `zalo-webhook-auth.test.ts`, `zalo-message-log-ui.test.ts`, cộng 1 test Phase 7 end-to-end trong `vps-worker.test.ts` và 1 round-trip storage test.
- Kiểm chứng sống: khởi động `npm run dev`, đăng nhập thật qua Chrome, xác nhận trang Nhật ký Zalo render đúng, lưu cấu hình Zalo qua UI thành công, nút "Kiểm tra kết nối" bật/tắt đúng theo `zalo.enabled` và gọi API không crash server.

## Kết quả cuối
- `npm run typecheck` sạch. Full test sweep 311/314 pass (3 lỗi baseline không đổi). `npm run test:storage` 15/15 pass. `eslint cloudflare/ tests/` đúng baseline 74 lỗi / 1104 cảnh báo, không tăng.
- Trong lúc kiểm chứng UI, background dev server (port 3000) từng thoát đột ngột với exit code 127 không rõ nguyên nhân (không có stack trace, log sạch trước đó) — khởi động lại thì ổn định, curl/browser xác nhận lại toàn bộ luồng chạy đúng. Nghi là artifact của harness chạy tiến trình nền, không phải lỗi trong code (không lặp lại lần hai). Ghi lại phòng khi tái diễn.

## Còn mở (chặn trước khi bật `zalo.enabled` production)
- Bước 1a của Phase 7: gọi `curl` với token thật để xác nhận đúng endpoint gửi qua SĐT + field webhook callback.
- Bước 1b: chưa chạy được thống kê định dạng `parentPhone1` trên CSDL production (không có quyền truy vấn trực tiếp trong phiên này).
- Q6: 2 mẫu tin ZBS chưa đăng ký/duyệt với Zalo.
- Q4/Q5 (MISA, Phase 6): tài khoản MISA thật + thuế suất áp dụng cho phụ huynh không mã số thuế.
- Q8/Q9: domain thật và máy chủ đang phục vụ trung tâm chưa chốt — chặn Phase 8 (go-live).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
