# Chốt công nợ lớp thu tháng theo bảng đối chiếu (mẫu T1, 28/10/2026)

Anh Vũ gửi bảng Excel của lớp (cột "Còn lại", ô tô vàng = còn nợ). Cách làm:

1. Xem hiện trạng (chỉ đọc): `CLASS=T1 tsx scripts/xem-lop.ts` → từng HV: nợ app, tồn, phiếu, biên lai.
2. Đối chiếu tên trong Excel với mã HV trên LMS (Excel dùng mã khác, vd TK120001):
   - Excel đã đóng mà LMS còn nợ tháng đó → **PAID**.
   - Ô tô vàng (còn nợ) → **OWE** = số còn lại.
   - Đóng dư (vd Mỹ Tâm 400k/300k) → **OVERPAY** = phần dư → tín dụng tự trừ phiếu tháng sau.
3. Chạy `scripts/sua-cong-no-lop-thang.ts` (dry-run) với CLASS, MONTH, PAID, OWE, OVERPAY:
   - PAID: thu đủ phiếu tháng MONTH bằng biên lai **UNRECORDED** (ghi nhận đã thu, không sinh dòng sổ thu chi),
     đi đúng đường thu học phí (khấu trừ buổi nghỉ, mốc đã đóng, tồn buổi).
   - Dừng nếu bất kỳ HV nào trong lớp sau sửa có công nợ khác OWE (hoặc 0đ).
   - LEGACY_PAID + LEGACY_MONTH: HV có tháng đã đóng trước khi dùng hệ thống mà LMS không có phiếu (số buổi tồn
     lệch so với cả lớp, vd -16 thay vì -8) → lập phiếu tháng đó đã thu (UNRECORDED). Công nợ không đổi;
     quy ước tồn: đã đóng hết = 0, còn nợ 1 tháng = -(số buổi tháng đó) như cả lớp.
4. Gửi anh Vũ kết quả dry-run, anh đồng ý mới `APPLY=1`.
