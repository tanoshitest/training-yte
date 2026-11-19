---
title: Bo demo khoi luong hoa don MISA va them thong so hoa don chinh o UI
date: 2026-09-30
summary: "Xoa route Next.js demo, simulate, fail-invoice, reset; hoa don tu dong ghi ten phu huynh; thong so hoa don MISA chinh duoc o UI"
---

# Bo demo khoi luong hoa don MISA va them thong so hoa don chinh o UI

## What happened

Rà soát luồng xuất hóa đơn MISA trước golive. Đường thật (hàng chờ `cloudflare/invoice-outbox.ts` và nút xuất thủ công) đã truyền đúng dữ liệu phiếu vào payload MISA, không mock. Phần còn demo nằm ở các chỗ sau:

- Route Next.js `src/app/api/webhooks/sepay/route.ts` dùng `DemoInvoiceProvider`. Route này không được deploy (production chạy `cloudflare/worker.ts`) nên là code chết, nhưng nếu ai deploy nhầm thì hóa đơn sẽ là hóa đơn giả.
- Hóa đơn tạo lúc khớp tiền / thu tay chuyển khoản mang `provider: "DEMO"` (`sepay-engine.ts`, `worker.ts`), chỉ bị ghi đè thành `"MISA"` khi phát hành xong.
- Công cụ giả lập trong `applySepayAction`: `simulate` (tạo giao dịch và hóa đơn giả), `fail-invoice` (ép hóa đơn FAILED) và `reset` (mở lại khoản thu đã trả). `fail-invoice` và `reset` không có chặn demo phía server; `reset` còn cho học viên tự gọi.

## Decision

- Xóa toàn bộ phần demo: route Next.js, `src/lib/finance/invoice-provider.ts`, `simulate`, `fail-invoice`, `reset`, `finishInvoices`, `issueDemoInvoice`, nút "Xác nhận đã CK" và "Mở lại để CK thật". Hóa đơn tự động giờ tạo với `provider: "MISA"`. `POST /api/finance/sepay` chỉ còn quản lý tài chính gọi được.
- Tên người mua trên hóa đơn tự động là tên phụ huynh (không có thì tên học viên). Không đổi `invoice.buyerName` lúc tạo vì tin Zalo dùng chính trường đó làm `ten_hoc_vien`; tên được thay lúc gửi MISA (`resolveMisaBuyerName`), và tên kế toán đã sửa tay được giữ nguyên.
- Thông số hóa đơn chuyển thành cấu hình ở UI (Cài đặt → Tích hợp → MISA → "Thông số hóa đơn"): mẫu tên dòng hàng với biến `{period}`, `{studentName}`, `{studentCode}`, `{parentName}`, `{className}`, đơn vị tính theo khóa / theo tháng, hình thức thanh toán, nguồn tên người mua, bật/tắt MISA tự gửi email. Lưu trong payload JSON của `misa.invoiceFields` nên không cần migration; bản lưu cũ thiếu khối này vẫn chạy nhờ `normalizeMisaInvoiceFields`. Logic nằm ở `cloudflare/misa-invoice-fields.ts`.
- `IsSendEmail` chỉ bật khi hóa đơn có email người mua, để không gửi MISA một yêu cầu tự mâu thuẫn.

## Verification

`tsc --noEmit` sạch. `tsx --test tests/*.test.ts`: 387/388 pass; test fail duy nhất là `student-filter-ui`, fail cả trên bản gốc (đã stash thay đổi và chạy lại) nên không thuộc đợt này. Đã thêm test cho `misa-invoice-fields`, payload, hàng chờ (tên phụ huynh, mẫu tên dòng hàng, bản cấu hình cũ) và thay test `simulate` bằng test khẳng định `simulate` / `fail-invoice` không còn tác dụng. Chưa mở giao diện trên trình duyệt.

## Next steps

- Xác nhận `ALLOW_DEMO_LOGIN` không bật trên production (chưa kiểm tra được giá trị thật).
- Khi golive: đổi Base URL MISA sang production cùng ClientID/Secret, MST, tài khoản, ký hiệu hóa đơn thật và bật `issueEnabled`.
- Mở Cài đặt → Tích hợp → MISA để xem mục "Thông số hóa đơn" hiển thị đúng.
- Commit chưa được thực hiện; đề xuất tách commit: bỏ demo, thông số hóa đơn MISA, xóa công cụ giả lập.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
