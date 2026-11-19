# Công nợ đã chốt (số dư đầu kỳ LMS)

Trung tâm đối chiếu từng lớp thu khóa (30 lớp). Lớp nào đã chốt thì **công nợ trên LMS
ngày chốt là số đúng 100%** — từ đó về sau chỉ thay đổi theo thu tiền / logic app bình thường.
Khi chốt xong cả 30 lớp: coi như đã nhập xong số dư đầu kỳ của LMS.

## Quy tắc khi sửa code / logic / dữ liệu
- Mọi thay đổi code hay logic học phí, công nợ, số buổi tồn **phải chạy so với bản chốt**
  (`scripts/cong-no-chot.ts`, `BASELINE=data/cong-no-chot/<ngày>.json`).
- Nếu công nợ của bất kỳ học viên nào trong các lớp đã chốt **thay đổi** (không phải do thu tiền
  thật / phiếu mới phát sinh đúng lịch) → **báo anh Vũ ngay**, chưa deploy.
- Script sửa dữ liệu chỉ được đụng các lớp này khi anh Vũ yêu cầu rõ.

## Danh sách lớp đã chốt
| Ngày chốt | Lớp | Ghi chú |
|---|---|---|
| 25/10/2026 (tạm) | S16, S20, S27, S28, S41 | Anh Vũ xác nhận dữ liệu ngày 25/10 đúng — **chờ kế toán chốt lại** rồi mới chụp bản chốt chính thức (`data/cong-no-chot/`) |
| 26/10/2026 | S16, S20, S23, S27, S28, S32, S34, S41 (8 lớp) | Anh Vũ xác nhận "8 lớp data học phí chuẩn". Tối 26/10 đã sửa: S23 mở lại khóa 2 cả lớp, S34 HV0436 tách nợ khóa 1 725k + khóa 2 1.560k, S32 HV0420 850k về khóa 1 (`scripts/fix-cong-no-26-10.ts`, `scripts/fix-s32-hv0420-khoa-1.ts`). **Sửa code / dữ liệu đụng 8 lớp này → báo anh Vũ trước.** Bản chốt: `data/cong-no-chot/2026-10-26.json` (chụp production 26/10 21:49; thư mục `data/` không đưa lên git vì có tên học viên — bản gốc ở máy anh Vũ `Desktop\Vibe\steps-lms\tmp\cong-no-chot-2026-10-26.json`). |

| 26/10/2026 22:19 | + S12, S21, S35 → **11 lớp**: S12, S16, S20, S21, S23, S27, S28, S32, S34, S35, S41 | Anh Vũ tick "Đã xong" (khớp). S35 sửa theo bảng thông báo học phí (`scripts/fix-s35-no-khoa-cu.ts`). Bản chốt 11 lớp: `data/cong-no-chot/2026-10-26-11lop.json`. |
| 26/10/2026 23:12 | S35 bổ sung | Anh Vũ yêu cầu: HV0957 Danh Bách, HV0958 An Nguyên nợ khóa 1 455.000đ (`scripts/fix-s35-bo-sung-no-khoa-1.ts`). S35: 35.160.000đ → 36.070.000đ — chụp lại bản chốt S35 sau khi chạy. |
| **13/11/2026 21:54** | **Mọi lớp thu tháng — Thạch Khê (23 lớp): T1–T5, T7–T24; Thành Sen (12 lớp): S1, S3–S11, S31, S38** | Anh Mori: "các lớp thu tháng của Thạch Khê và Thành Sen ngay bây giờ khoá cứng, có sai thì sửa các ngày ở sau" — số dư ngày 13/11 là số dư chuẩn; từ đây thu ngày nào cập nhật ngày đó, sai ngày nào sửa ngày đó (sửa bằng phát sinh ngày sau, không sửa ngược số dư đã chốt). Phiếu T11 Thành Sen: S1 455k, S3 600k, S4 455k (HV0058 Trúc Linh 520k — vào lớp 05/11), S5 585k, S6 600k, S7 585k, S8 520k, S9 520k, S10 390k, S11 800k, S31 640k, S38 520k. Bản chốt: `data/cong-no-chot/2026-11-13-lop-thang.json` (`scripts/chot-thanh-sen-13-11.ts`). **Sửa code / dữ liệu đụng công nợ các lớp này → báo anh Mori trước, chạy so bản chốt.** |

Còn lại (chưa chốt): 19 lớp thu khóa — anh Vũ kiểm tra từ 26/10/2026, chốt tới đâu ghi tiếp vào bảng.
