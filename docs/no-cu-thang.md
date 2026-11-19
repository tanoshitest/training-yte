# Lớp thu tháng: phiếu nợ cũ T9 tách riêng (28/10/2026)

Như lớp khóa (phiếu khóa 1 / khóa 2), lớp thu tháng có 2 phiếu: **Nợ cũ T9/2026** (đúng số nợ cũ đã đối chiếu)
và **Tháng 10/2026** (học phí tháng). Ví dụ Gia Phong S8: T9 455.000đ, T10 585.000đ (trước đây gộp 1.040.000đ).

- Phiếu nợ cũ: billKey `olddebt|<lớp>|2026-09`, chốt sẵn (frozenAt), có mã thanh toán riêng.
- Có phiếu này thì báo giá / phiếu tháng không cộng "Nợ cũ tháng trước" nữa (`hasOldDebtBill`).
- Thu tiền (popup, Muse, nhập sao kê): trả nợ cũ trước rồi tới tháng (`monthlyCarryReceivables`).
  Sao kê CK đúng tổng (nợ cũ + tháng) bằng mã HP lớp+HV → chia đúng 2 phiếu.
- Gửi yêu cầu thanh toán phiếu tháng: số tiền gửi cộng phần nợ cũ còn thiếu (`receivableRequestAmount`).
- Tồn buổi giữ nguyên: nợ cũ vẫn trừ tồn như trước; phần đã trả tính theo biên lai của phiếu nợ cũ.
- Dropdown "Tháng 09/2026" trong popup hiện chính phiếu nợ cũ (số tiền + QR của phiếu).

Tách dữ liệu một lần: `scripts/tach-no-cu-thang.ts` (dry-run mặc định, `APPLY=1` mới ghi, `ONLY=HV..` chạy vài em).
Học viên đã đóng phiếu gộp: biên lai chia đôi (phần nợ cũ thành biên lai mới cùng ngày, cùng phương thức; dòng thu chi
tách 2 dòng cùng ngày, tổng ngày không đổi). Script dừng nếu công nợ / tồn của bất kỳ học viên lớp tháng nào, tổng biên lai
hoặc tổng thu chi theo ngày bị đổi. Code: `cloudflare/old-debt-split.ts`. Test: `tests/monthly-olddebt-split.test.ts`.
