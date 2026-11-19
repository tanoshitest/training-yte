# STEPS LMS — ghi nhớ cho phiên làm việc

- Người dùng: anh Vũ (trung tâm ngoaingusteps.edu.vn), trao đổi tiếng Việt, xưng "em".
- **Công nợ đã chốt:** xem `docs/cong-no-da-chot.md`. Trước khi deploy bất kỳ thay đổi nào về học phí /
  công nợ / số buổi tồn: chạy `scripts/cong-no-chot.ts` với `BASELINE` bản chốt mới nhất trong
  `data/cong-no-chot/`. Lệch ở lớp đã chốt → báo anh Vũ ngay, chưa deploy.
- **KHOÁ CỨNG 13/11/2026 21:54 (anh Mori): mọi lớp thu tháng Thạch Khê (T1–T5, T7–T24) + Thành Sen (S1, S3–S11, S31, S38).**
  Số dư 13/11 là chuẩn — bản chốt `data/cong-no-chot/2026-11-13-lop-thang.json`. Từ đây thu ngày nào cập nhật ngày đó,
  sai ngày nào sửa ngày đó (không sửa ngược số dư đã chốt). Sửa code/dữ liệu đụng công nợ các lớp này → báo anh Mori trước.
- **11 lớp data học phí chuẩn (26/10/2026): S12, S16, S20, S21, S23, S27, S28, S32, S34, S35, S41.** Sửa code hay dữ liệu
  có đụng tới công nợ / tồn / phiếu thu của các lớp này → báo anh Vũ trước, chưa deploy / chưa chạy.
- Sửa dữ liệu production: script dry-run mặc định, `APPLY=1` mới ghi; chỉ đụng đúng lớp được yêu cầu.
- Chốt công nợ lớp thu tháng theo bảng Excel của anh Vũ: xem `docs/sua-cong-no-lop-thang.md`
  (`scripts/xem-lop.ts` → `scripts/sua-cong-no-lop-thang.ts` PAID / OWE / OVERPAY, dry-run rồi mới APPLY).
