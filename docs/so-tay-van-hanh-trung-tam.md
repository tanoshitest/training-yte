# SỔ TAY VẬN HÀNH TRUNG TÂM

**Hệ thống quản lý STEPS LMS**


Hệ thống quản lý STEPS LMS


Tài liệu nội bộ — Quản trị viên, Học vụ, Kế toán, Giáo viên, Trợ giảng
Biên soạn theo mã nguồn và hướng dẫn sử dụng thực tế của hệ thống
Phiên bản 1.0 — Tháng 10/2026


# Mục lục

- 1. Giới thiệu
  - 1.1. Kiến trúc & môi trường
  - 1.2. Đăng nhập & phiên làm việc
- 2. Ma trận vai trò & phân quyền
- 3. Khởi tạo trung tâm — thứ tự bắt buộc
- 4. Cấu hình hệ thống (từng mục)
  - 4.1. Trung tâm
  - 4.2. Chi nhánh
  - 4.3. Loại lớp
  - 4.4. Tiết học
  - 4.5. Cấu hình học phí (gói buổi)
  - 4.6. Tài khoản nhận tiền
  - 4.7. Tích hợp (chỉ ADMIN)
- 5. Quản lý người dùng
  - 5.1. Học viên
  - 5.2. Giáo viên
  - 5.3. Kế toán
  - 5.4. Trợ giảng
- 6. Quản lý lớp học
  - 6.1. Tạo và sửa lớp
  - 6.2. Ba tab trong trang lớp
  - 6.3. Cấu hình lịch nghỉ / lịch khóa (tab Thông tin, cột phải)
  - 6.4. Thông báo học phí của lớp
- 7. Lịch dạy & buổi học
  - 7.1. Cơ chế sinh buổi
  - 7.2. Trang Lịch dạy
- 8. Điểm danh & nhập điểm buổi học
  - 8.1. Quy trình chuẩn một buổi (giáo viên)
  - 8.2. Trạng thái điểm danh
  - 8.3. Cột điểm tùy biến
  - 8.4. Phân quyền trong bảng điểm danh
  - 8.5. Thao tác bàn phím & giao diện mobile
- 9. Ba loại "nghỉ" — khác nhau hoàn toàn
  - 9.1. Buổi GV nghỉ & credit học phí (lớp thu tháng)
- 10. Xếp lịch dạy bù
  - 10.1. Điều kiện một buổi vào danh sách chờ dạy bù
  - 10.2. Quy trình xếp bù (admin)
  - 10.3. Buổi thêm (isExtra)
- 11. Syllabus & nội dung giảng dạy
- 12. Dashboard & Task của giáo viên
- 13. Hai mô hình thu học phí
  - 13.1. Thu theo tháng (MONTHLY)
  - 13.2. Thu theo khoá (COURSE)
  - 13.3. Vòng đời phiếu phải thu (receivable)
- 14. Thu học phí — ba đường tiền về
  - 14.1. Tự động qua SePay (khuyến nghị)
  - 14.2. Thu tay (tiền mặt / CK ngoài SePay)
  - 14.3. Sao kê ngân hàng tải tay
  - 14.4. Giao dịch lệch (`/ke-toan/can-duyet`)
  - 14.5. Phiếu thu & hoàn tác
- 15. Chuyển lớp, nghỉ học & bảo lưu học phí
  - 15.1. Chuyển lớp
  - 15.2. Xoá khỏi lớp → Lớp chờ (bảo lưu)
  - 15.3. Học viên quay lại học
- 16. Thu chi, đối soát & dòng tiền
  - 16.1. Quản lý thu chi (`/ke-toan/thu-chi`)
  - 16.2. Đối soát thu chi (`/ke-toan/doi-soat`)
  - 16.3. Dự thu - Dự chi (`/ke-toan/du-thu-du-chi`)
- 17. Hoá đơn điện tử & tin Zalo
  - 17.1. Quản lý doanh số (`/ke-toan/hoa-don`)
  - 17.2. Nhật ký Zalo (`/ke-toan/tin-zalo`)
- 18. Chấm công & lương giáo viên
  - 18.1. Báo cáo chấm công (`/ke-toan/cham-cong`)
  - 18.2. Báo cáo lương (`/ke-toan/luong`)
- 19. Báo cáo đào tạo
  - 19.1. Báo cáo chuyên cần (`/bao-cao/chuyen-can`)
  - 19.2. Báo cáo học vụ (`/bao-cao/hoc-vu`)
  - 19.3. Báo cáo định kỳ (`/bao-cao/dinh-ky`)
  - 19.4. Chấm điểm Phiếu (`/bao-cao/cham-phieu`) — API thật
  - 19.5. Chấm điểm Video (`/bao-cao/cham-video`) — đang chạy demo
- 20. Cổng học viên (/portal)
- 21. Nhật ký hệ thống & kiểm soát
  - 21.1. Các quy tắc bất biến cần nhớ
- 22. Sổ tay xử lý tình huống (SOP)
  - 22.1. Giáo viên báo nghỉ buổi dạy
  - 22.2. Nghỉ lễ / nghỉ học vụ toàn trung tâm
  - 22.3. Buổi học vẫn diễn ra nhưng miễn phí (lớp bù, lớp trải nghiệm)
  - 22.4. Học viên chuyển lớp giữa chừng
  - 22.5. Học viên nghỉ học giữa chừng
  - 22.6. Phụ huynh đóng tiền mà hệ thống chưa nhận
  - 22.7. Thu nhầm / cần huỷ một phiếu thu
  - 22.8. Cuối tháng chốt sổ
- 23. Checklist vận hành theo nhịp
  - 23.1. Hằng ngày
  - 23.2. Hằng tuần
  - 23.3. Hằng tháng
- Phụ lục
  - A. Bản đồ đường dẫn
  - B. Bảng trạng thái tham chiếu
  - C. Hằng số nghiệp vụ đang áp dụng
  - D. Thuật ngữ
  - E. Giới hạn & điều đã biết

# 1. Giới thiệu


Tài liệu này là **sổ tay vận hành đầy đủ** cho trung tâm ngoại ngữ dùng hệ thống STEPS LMS — bao gồm cách tổ chức lớp học, điểm danh, thu học phí, đối soát ngân hàng, tính lương giáo viên và các báo cáo đào tạo. Nội dung được viết dựa trên **hành vi thật của phần mềm** (đọc trực tiếp từ mã nguồn), không phải quy trình lý tưởng.

Mỗi chương mô tả: màn hình/thao tác tương ứng trong app, quy tắc nghiệp vụ hệ thống đang áp dụng, và các điểm cần thận trọng. Khi một việc là **khuyến nghị quản lý** chứ không phải cơ chế của phần mềm, tài liệu sẽ ghi rõ trong khung KHUYẾN NGHỊ.

> THÔNG TIN: Trong toàn tài liệu, các trạng thái, tên nút, tên tab được viết đúng như trên giao diện (in đậm hoặc trong ngoặc kép). Ngày giờ trong hệ thống luôn theo giờ Việt Nam (UTC+7), tiền tệ là VND.


## 1.1. Kiến trúc & môi trường

- App chạy trên Cloudflare Worker + lưu dữ liệu trong KV — không có server nội bộ cần bảo trì.
- Một mã nguồn phục vụ cả **máy tính và điện thoại**: dưới 768px giao diện tự chuyển sang bố cục mobile (cuộn trong khung, cột ghim trái, nút to dễ chạm).
- Mọi thao tác thêm/sửa/xoá và đăng nhập đều được ghi vào **Nhật ký hệ thống** (chỉ đọc, không xoá được).
- Dữ liệu kế toán trước ngày **01/10/2026** (mốc go-live) bị ẩn khỏi các màn hình tiền — dữ liệu vẫn nằm nguyên trong kho, chỉ không hiển thị.

## 1.2. Đăng nhập & phiên làm việc


Hệ thống dùng **tên đăng nhập = họ tên viết liền không dấu** cho giáo viên, kế toán và trợ giảng (ví dụ: Nguyễn Kim Chi → `nguyenkimchi`; Trợ Giảng → `trogiang`). Quản trị viên đăng nhập bằng email quản trị.

| Vai trò | Tên đăng nhập | Mật khẩu |
|---|---|---|
| Quản trị viên | Email quản trị (cấu hình trong biến môi trường) | Mật khẩu quản trị |
| Giáo viên | Họ tên viết liền không dấu | Mật khẩu quản trị chung của trung tâm |
| Trợ giảng | Họ tên viết liền không dấu | Mật khẩu quản trị chung của trung tâm |
| Kế toán | Họ tên viết liền không dấu | Mật khẩu kế toán (mặc định 123456789 — phải đổi ngay) |


> LƯU Ý: Một họ tên chỉ được tồn tại ở một vai trò nhân sự. Nếu cùng tên xuất hiện ở cả giáo viên và kế toán, hệ thống từ chối đăng nhập để tránh nhầm quyền. Nút chìa khoá trên thanh trên cùng để đổi mật khẩu; nút thoát để đăng xuất.


> KHUYẾN NGHỊ: Đổi mật khẩu kế toán mặc định ngay sau khi tạo tài khoản; đặt mật khẩu quản trị riêng, không gửi chung kênh công khai; cấp cho mỗi nhân sự đúng một vai trò.


# 2. Ma trận vai trò & phân quyền


Hệ thống có 5 vai trò. Mỗi vai trò nhìn thấy menu khác nhau và bị chặn ở mức API — tự gõ đường dẫn cũng không vượt quyền được.

| Vai trò | Nhìn thấy trong menu | Được làm | Không được làm |
|---|---|---|---|
| Quản trị viên (ADMIN) | Dashboard · Vận hành (Syllabus, Lớp học, Lịch dạy) · Báo cáo đào tạo (Chuyên cần, Học vụ, Định kỳ, Chấm Phiếu, Chấm Video) · Kế toán (9 mục) · Quản lý người dùng · Nhật ký, Cấu hình, Tài liệu | Toàn quyền: tạo/sửa/xoá mọi dữ liệu; cấu hình lịch nghỉ, "Học không tính phí", liên kết dạy bù; đổi giá, đổi lịch; xử lý giao dịch lệch; chấm công & lương. | — |
| Kế toán (ACCOUNTANT) | Vận hành (Lớp học, Lịch dạy, Học viên — xem) · Kế toán (9 mục) · Tài liệu sử dụng | Thu học phí, gửi yêu cầu thanh toán, xử lý giao dịch lệch, ghi thu chi, đối soát, xuất doanh số MISA, chấm công & tính lương. | Không sửa lớp/học viên/lịch; không đổi được nghỉ học vụ (offSource ADMIN); không mở khoá "Học không tính phí". |
| Giáo viên (TEACHER) | Dashboard · Lịch dạy · Lớp của tôi · Báo cáo học vụ · Task của tôi | Điểm danh, tick nghỉ buổi mình dạy, tick Clip quay ở nhà / Phiếu bài tập, nhập điểm Từ vựng, tạo tối đa 12 cột điểm riêng, ghi chú, xem syllabus lớp mình. | Không sửa buổi lớp người khác; không tạo/sửa nghỉ học vụ đã khóa; không bật/tắt "Học không tính phí"; không tạo liên kết dạy bù. |
| Trợ giảng (ASSISTANT) | Chỉ Báo cáo học vụ | Mở buổi giáo viên đã điểm danh → nhập điểm Từ vựng, các cột điểm và nhận xét; server giữ nguyên trạng thái điểm danh/clip/phiếu của GV. | Không điểm danh; không tick clip/phiếu bài tập; không tạo buổi mới; không thấy syllabus. |
| Học viên (STUDENT) | Cổng học viên (/portal): Overview, buổi học theo syllabus, bài luyện tập, trang Học phí | Xem tiến độ, mở game ôn tập, quét QR học phí của mình. | Không vào khu quản trị. |


> QUY TẮC: Quyền được chặn ở tầng server: trợ giảng gửi yêu cầu sửa điểm danh sẽ bị server ghi đè lại bằng dữ liệu giáo viên đã lưu; giáo viên/kế toán cố sửa buổi nghỉ học vụ sẽ bị trả 403/409.


# 3. Khởi tạo trung tâm — thứ tự bắt buộc


Khi dựng hệ thống lần đầu, làm theo đúng thứ tự sau vì các bước sau phụ thuộc bước trước (ví dụ: lớp cần có chi nhánh/loại lớp/tiết học; phiếu thu cần tài khoản nhận tiền).
1. **Cấu hình → Trung tâm**: nhập tên trung tâm, SĐT, email, địa chỉ, logo — in lên đầu phiếu thu và phiếu báo.
2. **Cấu hình → Chi nhánh**: tạo các cơ sở. Chi nhánh gắn vào lớp/phòng/học viên và là bộ lọc khắp hệ thống.
3. **Cấu hình → Loại lớp**: các loại hình (nhóm nhỏ, 1-1…). Dùng khi mở lớp và gắn gói học phí.
4. **Cấu hình → Tiết học**: khung giờ chuẩn (ví dụ Tiết 1: 08:00–09:30). Xếp lịch chỉ cần chọn tiết.
5. **Cấu hình → Phòng học** *(hiện đang ẩn trên menu)*: phòng vẫn tồn tại trong dữ liệu lớp; khi cần quản lý phòng, bật lại mục này.
6. **Cấu hình → Cấu hình học phí**: khai báo các **gói buổi** theo loại lớp (Gói 24 buổi mặc định, thêm 48…). Gói chỉ quyết định số buổi — đơn giá nhập ở từng lớp.
7. **Cấu hình → Tài khoản nhận tiền**: ngân hàng + số tài khoản + chủ tài khoản + ảnh QR tĩnh nếu có. SePay đối soát về đúng STK này.
8. **Cấu hình → Tích hợp** (chỉ ADMIN): SePay webhook, MISA meInvoice, Zalo OA/ZBS, OpenAI chấm bài.
9. **Người dùng**: tạo giáo viên → kế toán → trợ giảng (tên đăng nhập tự sinh từ họ tên).
10. **Học viên**: tạo hồ sơ học viên (chưa cần xếp lớp).
11. **Lớp học**: tạo lớp, chọn loại lớp, chi nhánh, GV, hình thức thu, giá/buổi, xếp lịch tuần, thêm học viên.
12. **Tab Thông tin lớp → khối Cấu hình lịch nghỉ/lịch khóa**: chốt ngày bắt đầu khóa, số buổi, ngày nghỉ lễ, học liệu.

> QUY TẮC: Không xoá chi nhánh/loại lớp/tiết học đang được dùng — lớp và lịch tham chiếu trực tiếp. Nếu phải đổi, tạo mục mới rồi chuyển dữ liệu trước.


# 4. Cấu hình hệ thống (từng mục)


## 4.1. Trung tâm


Khối thông tin **in lên đầu trang, biên lai và phiếu thu**: tên trung tâm, số điện thoại, email, đường dẫn logo, địa chỉ. Sửa xong bấm **Lưu**.

## 4.2. Chi nhánh


Mỗi cơ sở một dòng. Chi nhánh là bộ lọc trong Học viên, Lớp, Học phí, Thu chi, Doanh số… Tên chi nhánh còn dùng để sinh **mã hàng MISA** (chữ cái đầu của tên + mã lớp, ví dụ Thạch Khê + T8 → `TKT8`).

## 4.3. Loại lớp


Phân loại lớp khi mở lớp mới và là điểm neo để gắn **gói học phí** ở mục 4.5.

## 4.4. Tiết học


Khai báo tên tiết + giờ bắt đầu/kết thúc. Trong form lớp chỉ cần chọn **thứ + tiết** là đủ — giờ tự điền theo tiết đã chọn.

## 4.5. Cấu hình học phí (gói buổi)


Mỗi gói = **số buổi / khoá** gắn với một loại lớp (ví dụ "Gói 24 buổi", "Gói 48 buổi"). Gói xuất hiện trong ô **Hình thức thu** của lớp.

> LƯU Ý: Gói không chứa đơn giá. Đơn giá luôn nhập ở ô "Giá / buổi" của từng lớp. Thêm gói mới chỉ thêm lựa chọn số buổi, không tự đổi giá.


## 4.6. Tài khoản nhận tiền


Ngân hàng + số tài khoản + tên chủ tài khoản hiển thị trên trang thanh toán và QR VietQR tự sinh. Có thể tải lên **ảnh QR tĩnh** (PNG/JPG) — nếu có, ảnh này được ưu tiên hơn QR tự sinh trên phiếu in.

> QUY TẮC: QR trên trang thanh toán công khai luôn sinh động từ số tiền + mã thanh toán hiện tại — không bao giờ dùng ảnh tĩnh, để tránh QR cũ sai số tiền sau khi phiếu được điều chỉnh.


## 4.7. Tích hợp (chỉ ADMIN)


Bốn thẻ tích hợp; mỗi thẻ có chấm trạng thái (đã cấu hình / chưa / tắt) và nút **Kiểm tra kết nối** riêng (SePay không có nút ping — trạng thái lấy từ log webhook gần nhất vì SePay là bên chủ động gọi vào).

| Tích hợp | Dùng để | Các trường chính | Lưu ý vận hành |
|---|---|---|---|
| SePay — Webhook | Nhận giao dịch ngân hàng tự động: tiền về → khớp mã thanh toán → kích hoạt buổi học. | Chế độ xác thực (API key / tắt) · Bí mật webhook | Secret lưu mã hoá, hiện lại dạng ••••xxxx. Giao dịch trùng ID bị bỏ qua; giao dịch OUT bị ignore. |
| MISA meInvoice | Xuất hoá đơn điện tử thật sau khi tiền khớp. | Bật MISA · Cho phép xuất hoá đơn thật · Base URL · Client ID · Client Secret · Mã số thuế · mẫu tên hàng | Giữ issueEnabled tắt trong giai đoạn thử — bật lên mới xuất thật. Hoá đơn tạo ở trạng thái PENDING rồi hàng chờ phát hành sau, không làm chậm webhook. |
| Zalo OA / ZBS | Gửi tin "yêu cầu thanh toán" và "thông báo đã thanh toán/hoá đơn" tới SĐT chính của phụ huynh. | App ID · App Secret · OA ID · Refresh Token · Template ID cho 2 loại tin | Chưa cấu hình mẫu tin thì hệ thống bỏ qua gửi (ghi chú "Chưa cấu hình mẫu tin Zalo"). |
| Chấm bài AI (OpenAI) | Trang Chấm điểm Phiếu gọi OpenAI sinh đáp án từ đề và chấm bài viết tay trong ảnh. | Bật · API key (sk-…) · Model | Mỗi lượt chấm tính phí theo tài khoản OpenAI của trung tâm; model cần đọc được ảnh. Nút "Tải danh sách model" liệt kê model 6 tháng gần nhất. |


> LƯU Ý: Các secret (SePay webhook secret, MISA Client Secret, Zalo tokens, OpenAI key) không bao giờ hiện lại đầy đủ và không ghi vào nhật ký. Ô nhập để trống = giữ nguyên giá trị cũ.


# 5. Quản lý người dùng


## 5.1. Học viên


Trang **Học viên** (`/hoc-vien`) là danh bạ gốc của trung tâm. Mỗi học viên một hồ sơ duy nhất — học nhiều lớp vẫn là cùng một hồ sơ.
- **Thêm học viên**: nút + Thêm học viên → nhập Họ tên (bắt buộc), Mã HV (bỏ trống để tự sinh), SĐT 1, SĐT 2, Trường đang học, Địa chỉ, Tình trạng.
- **SĐT 1 (parentPhone1)** là số nhận tin Zalo học phí — nhập sai sẽ gửi nhầm hoặc không gửi được.
- **Tình trạng**: Chưa xếp lớp / Đang học / Nghỉ học. Hệ thống tự đổi khi thao tác lớp: vào lớp → Đang học; về Lớp chờ → Chưa xếp lớp.
- **Tìm kiếm** không cần gõ dấu: "the anh" vẫn tìm được "Thế Anh". Lọc thêm theo Tình trạng / Chi nhánh / Lớp.
- **Xuất Excel** xuất danh sách đang lọc.
- Bấm tên học viên → trang chi tiết 2 tab: **Thông tin học viên** và **Lịch sử hoạt động**.

> LƯU Ý: Nút Xoá ở danh sách học viên là xoá hồ sơ — khác với Xoá khỏi lớp (đưa về Lớp chờ) trong trang lớp. Chỉ xoá hồ sơ khi nhập trùng/nhập nhầm; học viên nghỉ học thì dùng Xoá khỏi lớp để giữ chứng từ.


## 5.2. Giáo viên


Trang **Giáo viên** (`/giao-vien`): thêm/sửa/xoá hồ sơ, xem lớp đang phụ trách. Hồ sơ gồm mã GV, họ tên, SĐT, email, địa chỉ. **Phân công lớp không làm ở đây** — gán GV trong form lớp (ô Giáo viên chủ nhiệm). Tên đăng nhập = họ tên viết liền không dấu.

## 5.3. Kế toán


Trang **Kế toán** (`/ke-toan-vien`): tạo nhân sự kế toán. Tên đăng nhập in ngay dưới họ tên trong bảng. Mật khẩu mặc định `123456789` — nhân viên đổi ở nút chìa khoá sau lần đăng nhập đầu tiên.

## 5.4. Trợ giảng


Trang **Trợ giảng** (`/tro-giang`): tạo nhân sự trợ giảng — tài khoản chỉ thấy Báo cáo học vụ để nhập điểm và nhận xét, không điểm danh được.

# 6. Quản lý lớp học


## 6.1. Tạo và sửa lớp


Trang **Lớp học** (`/lop-hoc`) → + Thêm lớp. Các trường quyết định vận hành:

| Trường | Ý nghĩa & tác động |
|---|---|
| Tên lớp / Mã lớp | Mã bỏ trống sẽ tự sinh. Mã lớp đi vào nội dung phiếu thu và mã hàng MISA. |
| Loại lớp | Từ Cấu hình → Loại lớp; quyết định gói buổi khả dụng. |
| Trạng thái | Nháp / Đang học / Tạm dừng / Kết thúc. Chỉ lớp Đang học mới sinh lịch và tính phí bình thường. |
| Chi nhánh | Gắn lớp vào cơ sở — quyết định lọc báo cáo, thu chi, doanh số. |
| Giáo viên chủ nhiệm | GV được gán sẽ thấy lớp trong "Lớp của tôi" và điểm danh được. |
| Hình thức thu | Thu theo khoá (mặc định, gói 24/48 buổi…) hoặc Thu theo tháng. Chỉ chuyển lớp được giữa hai lớp cùng hình thức thu. |
| Giá / buổi | Đơn giá một buổi — mọi công thức học phí nhân với số này. |
| Lịch tuần | Chọn Thứ + Tiết → Thêm. Lịch tuần là nguồn sinh toàn bộ buổi học — không nhập tay từng buổi. |
| Học viên trong lớp | Tick chọn học viên — tương đương xếp lớp ngay khi tạo. |


> LƯU Ý: Lớp chưa khai giảng (ngày bắt đầu khóa ở tương lai) chưa hiện buổi nào trên điểm danh/lịch dạy. Mở tab Thông tin lớp để chốt ngày bắt đầu và số buổi khóa.


## 6.2. Ba tab trong trang lớp


| Tab | Nội dung | Ai dùng |
|---|---|---|
| Thông tin | Sửa thông tin lớp + lịch tuần (admin); khối Cấu hình lịch nghỉ/lịch khóa + Thông báo học phí (admin). GV/TG chỉ xem. | Admin chỉnh; GV đọc |
| Danh sách HV | Roster + nút + Thêm học sinh, nút Chuyển lớp, nút 🗑 xoá khỏi lớp từng bạn. | Admin thao tác; kế toán xem |
| Điểm danh | Bảng điểm danh/nhập điểm của từng buổi — cùng màn hình cho GV và admin. | GV nhập; TG nhập điểm; admin giám sát |


## 6.3. Cấu hình lịch nghỉ / lịch khóa (tab Thông tin, cột phải)


Khối này là **nơi duy nhất** học vụ khai báo nghỉ lễ và khung khóa. Tuỳ hình thức thu:
- **Lớp thu tháng**: chọn Tháng/năm → tick trước các buổi nghỉ lễ/học vụ → Lưu lịch nghỉ. Buổi được tick không tính học phí và khoá trong Điểm danh.
- **Lớp thu khoá — Khoá 1**: chọn ngày bắt đầu + số buổi trong khoá → hệ thống sinh toàn bộ lịch khoá theo lịch tuần → tick buổi nghỉ lễ → Lưu cấu hình khoá. Buổi nghỉ được tick không tính phí, khoá tự kéo dài bù.
- **Lớp thu khoá — Khoá 2 trở đi**: tự nối tiếp ngay sau khoá trước (cùng số buổi); chỉ chỉnh được ngày nghỉ.
- **Học liệu**: nhập Tiền học liệu + mô tả theo **từng tháng** (lớp tháng) hoặc **từng khoá** (lớp khoá). Có tiền thì phiếu báo và bill học phí cộng thêm đúng khoản này. Khoá sau để trống sẽ kế thừa học liệu khoá 1.

Dòng tổng kết trên bảng cấu hình luôn hiện: tổng số buổi · số buổi nghỉ · số buổi miễn phí · số buổi tính phí · thành tiền — đối chiếu trước khi bấm Lưu.

> QUY TẮC: Buổi nghỉ do học vụ cấu hình được khoá hoàn toàn: giáo viên không bỏ nghỉ được trong Điểm danh, API từ chối mọi yêu cầu sửa (kể cả request tự tạo). Muốn mở lại phải sửa tại đây.


## 6.4. Thông báo học phí của lớp


Trong tab Thông tin lớp (admin): chọn **Tháng học phí** (lớp tháng) hoặc **Khoá + số buổi tính phí** (lớp khoá) → **Tải phiếu** để xuất phiếu báo cho toàn bộ học viên trong lớp — mỗi em một phiếu, học phí riêng theo lịch thật của em đó.

# 7. Lịch dạy & buổi học


## 7.1. Cơ chế sinh buổi

- Buổi học **không nhập tay từng buổi**: hệ thống nhân lịch tuần của lớp với dải ngày từ mốc 01/09/2026 tới cuối năm 2027.
- Buổi đã được lưu (điểm danh, tick nghỉ, buổi bù, buổi thêm…) "chiếm" đúng suất lịch của nó theo khoá `lớp|ngày|giờ` — đổi giờ/ngày lịch tuần không làm mất dữ liệu đã lưu.
- Buổi ngoài lịch (học thêm, dạy bù) vẫn hiện trên lịch với nhãn riêng — không chiếm suất tuần nào.
- Trạng thái buổi: Đã xếp lịch (sắp tới) / Hoàn thành / Đã huỷ.

## 7.2. Trang Lịch dạy


Trang **Lịch dạy** (`/lich-dạy`) xếp mọi buổi của trung tâm lên một lịch — xem theo ngày/tuần/tháng, lọc theo giáo viên/lớp. Vai trò giáo viên có trang riêng chỉ gồm lớp mình (`/gv/lich-day`).
- Ô trống trên lịch có dấu **+** (chỉ admin thấy) → mở form **Xếp lịch dạy bù** đúng khung giờ đã bấm.
- Buổi nghỉ học vụ do admin cấu hình **không hiện** trên lịch dạy (đã bị khóa khỏi lịch).
- Thẻ buổi hiện giờ, lớp, phòng, GV; buổi bù mang nhãn **Buổi bù**, buổi thêm mang nhãn **Buổi thêm**.

# 8. Điểm danh & nhập điểm buổi học


## 8.1. Quy trình chuẩn một buổi (giáo viên)

1. Vào **Lớp của tôi** → chọn lớp → tab **Điểm danh** → chọn đúng buổi trong ô chọn buổi (hoặc vào thẳng từ Task của tôi / Lịch dạy).
2. Cột **Điểm danh**: chọn Có mặt / Vắng phép / Vắng không phép cho từng học viên.
3. Tick **Clip quay ở nhà** và **Phiếu bài tập** cho từng bạn đã làm.
4. Nhập điểm **Từ vựng** và các cột điểm riêng nếu có; ghi chú từng bạn ở cột Ghi chú.
5. Bấm **Lưu** — server lưu và tính lại số dư buổi/credit liên quan ngay lập tức.

## 8.2. Trạng thái điểm danh


| Trạng thái | Nhãn | Ảnh hưởng |
|---|---|---|
| PRESENT | Có mặt | Tính đã học; điểm và tick bài tập nhập bình thường. |
| EXCUSED | Vắng phép | Buổi đã tính phí; ô điểm/bài tập bị khoá. |
| ABSENT | Vắng không phép | Như vắng phép; nếu sau đổi thành Có mặt, hệ thống ghi Đi muộn (firstStatus). |


Một học viên để trống = **Chưa điểm danh** — báo cáo và chấm công phân biệt rõ với đã điểm danh.

## 8.3. Cột điểm tùy biến

- Giáo viên bấm nút **+** ở cuối hàng tiêu đề để tạo cột điểm riêng (BTVN, luyện tập ở lớp, nghe…).
- Tối đa **12 cột** mỗi buổi; kéo biểu tượng ⠿ để đổi vị trí; × để xoá cột.
- Cột này cũng là "bài kiểm tra của buổi" trong trang Chấm điểm Phiếu.
- Điểm nhận giá trị 0–1000; ô chữ (nhận xét nhanh) tối đa 200 ký tự.

## 8.4. Phân quyền trong bảng điểm danh


| Việc | Giáo viên | Trợ giảng | Admin |
|---|---|---|---|
| Điểm danh / tick nghỉ buổi | ✔ lớp mình | ✖ (giữ nguyên của GV) | ✔ |
| Tick Clip quay ở nhà / Phiếu bài tập | ✔ | ✖ | ✔ |
| Nhập điểm Từ vựng, cột điểm, ghi chú | ✔ | ✔ | ✔ |
| Tạo/xoá/kéo cột điểm tùy biến | ✔ | ✔ | ✔ |
| Bật/tắt "Học không tính phí" | ✖ (checkbox khoá) | ✖ | ✔ |
| Tạo/sửa buổi nghỉ học vụ | ✖ (server chặn 403) | ✖ | ✔ (ở Cấu hình lớp) |
| Gán liên kết dạy bù (makeupOf) | ✖ | ✖ | ✔ |


> THÔNG TIN: Trợ giảng chỉ nhập được buổi giáo viên đã điểm danh (bản ghi buổi phải tồn tại). Khi trợ giảng lưu, server tự giữ nguyên cột điểm danh/clip/phiếu của giáo viên — kể cả khi form gửi lên dữ liệu khác.


## 8.5. Thao tác bàn phím & giao diện mobile

- Di chuyển giữa các ô/dòng bằng phím mũi tên như bảng tính.
- Mobile (<768px): cột **STT + Học viên** ghim trái khi kéo ngang; cụm chọn buổi + Nghỉ học / Không tính phí + **Lưu** và hàng tên cột **đứng yên** khi cuộn dọc; cột Mã được ẩn để nhường chỗ.

# 9. Ba loại "nghỉ" — khác nhau hoàn toàn


Đây là điểm dễ nhầm nhất của hệ thống. Ba trạng thái khác nhau, hậu quả học phí khác nhau:

|  | Nghỉ lễ / học vụ (admin) | Nghỉ học (GV tick) | Học không tính phí |
|---|---|---|---|
| Ai tạo | Admin ở Cấu hình lịch nghỉ của lớp | GV tick Nghỉ học trong Điểm danh | Admin bật trong Điểm danh (GV không đổi được) |
| Buổi có diễn ra | Không | Không | Có — điểm danh & nhập điểm bình thường |
| Tính học phí | Không tính | Vẫn tính (trừ quy tắc credit dưới đây) | Không tính |
| Danh sách chờ dạy bù | Không vào | Vào — chờ xếp bù | Không vào |
| Khóa 24 buổi | Khóa kéo dài bù | Khóa kéo dài bù | Khóa kéo dài bù |
| Khoá trong Điểm danh | Khoá hoàn toàn (server chặn sửa) | Chỉ nhập được Clip + Phiếu bài tập | Nhập bình thường |


> QUY TẮC: Không bao giờ dùng nhầm: buổi lớp vẫn học nhưng miễn phí → dùng Học không tính phí; buổi GV nghỉ → Nghỉ học; nghỉ lễ toàn trung tâm → tick trong Cấu hình lịch nghỉ.


## 9.1. Buổi GV nghỉ & credit học phí (lớp thu tháng)


Với lớp thu tháng, buổi GV tick nghỉ vẫn trừ 1 buổi tồn của học viên trong tháng đó, nhưng hệ thống ghi nhận **credit** và tự trừ vào phiếu tháng sau (áp dụng từ mốc **tháng 10/2026** — các nghỉ trước mốc này đã xử lý thủ công nên không tự trừ nữa).

> THÔNG TIN: Với lớp thu khoá, buổi GV nghỉ không đụng số dư: khoá tự kéo dài một suất lịch để dạy bù.


# 10. Xếp lịch dạy bù


## 10.1. Điều kiện một buổi vào danh sách chờ dạy bù

- Buổi do **giáo viên** tick Nghỉ học (offSource = GV) — nghỉ lễ học vụ không cần bù.
- Thuộc lớp đang hoạt động (không phải nháp).
- Ngày buổi **từ đầu tháng hiện tại trở đi** — nghỉ tháng trước không hiện trong danh sách (vẫn nằm trong dữ liệu).
- Không phải buổi "Học không tính phí".
- Chưa có buổi bù hợp lệ (buổi bù còn hiệu lực, không nghỉ, không huỷ) — đã bù xong tự biến mất khỏi list.

## 10.2. Quy trình xếp bù (admin)

1. Vào **Lịch dạy** → bấm dấu **+** ở ô khung giờ muốn dạy bù → form Xếp lịch dạy bù mở ra.
2. Chỉnh Ngày / Giờ bắt đầu / Giờ kết thúc nếu cần (mặc định theo ô đã bấm); lọc theo giáo viên nếu danh sách dài.
3. Chọn đúng buổi nghỉ trong danh sách → bấm **Xếp lịch dạy bù**.

> QUY TẮC: Buổi bù chiếm đúng vị trí khóa của buổi nghỉ — khoá không giãn thêm, học phí tính như buổi thường, buổi bù mang nhãn "Dạy bù" trên lịch và trong bảng cấu hình.


## 10.3. Buổi thêm (isExtra)


Buổi học thêm ngoài lịch tuần (luyện thêm, học bù tự do không neo buổi nghỉ) hiện nhãn **Buổi thêm** — hiển thị trong lịch khoá nhưng **không tính vào phí khoá** và không chiếm số buổi.

# 11. Syllabus & nội dung giảng dạy

- Trang **Syllabus** (`/syllabus`) liệt kê các chương trình: mỗi syllabus gồm nhiều **Unit**, mỗi Unit có các **Day** (buổi học), mỗi Day có bài học kèm kỹ năng (Listening/Speaking/Reading/Writing), ngôn ngữ mục tiêu và giáo án từng bước.
- Gán syllabus cho lớp ở tab Thông tin lớp → tab **Syllabus** của lớp hiện đúng giáo án (GV xem trực tiếp trong trang lớp của mình).
- Trợ giảng không tải syllabus.

# 12. Dashboard & Task của giáo viên

- **Dashboard GV** (`/gv`): số lớp phụ trách + tổng học viên; tab Task hiện nhật ký hoạt động.
- **Task của tôi** (`/gv/task`): mọi buổi từ 01/09 đến hôm nay chưa điểm danh — lọc Chưa hoàn thành / Đã hoàn thành / Tất cả; bấm nút để vào đúng buổi.
- **Báo cáo học vụ** (`/gv/bao-cao-hoc-vu`): thống kê theo buổi của lớp mình — điểm danh, clip, điểm từ vựng TB, cột điểm thêm; nút **Nhập điểm** vào buổi.
- **Trợ giảng** đăng nhập rơi thẳng vào Báo cáo học vụ của toàn trung tâm.

# 13. Hai mô hình thu học phí


## 13.1. Thu theo tháng (MONTHLY)


Học phí tháng = **số buổi lịch trong tháng tính phí được** × giá/buổi + **học liệu tháng** (nếu có) − **credit buổi GV nghỉ kỳ trước** (từ mốc 10/2026).
- Số buổi tính phí loại trừ: buổi nghỉ học vụ đã cấu hình, buổi "Học không tính phí", buổi đã huỷ.
- Buổi GV nghỉ vẫn là một suất lịch và vẫn tính phí trong tháng — phần credit chuyển sang trừ phiếu tháng sau.
- Phiếu tháng sau có thể được **lập sẵn (thu trước)**; phiếu kỳ sau không che khuất phiếu kỳ đang thu.

## 13.2. Thu theo khoá (COURSE)


Một khoá = **N buổi tính phí** (mặc định 24, hoặc theo gói của loại lớp) × giá/buổi + học liệu khoá. Khoá 2 tự nối tiếp sau khoá 1.
- Buổi GV nghỉ / nghỉ học vụ / không tính phí / huỷ → suất đó bị bỏ qua và **khoá kéo dài** để bù (trừ nghỉ học vụ rơi đúng khe hở cắt cố ý vẫn đếm số "Buổi N").
- Buổi dạy bù được gán `makeupOf` chiếm đúng vị trí của buổi nghỉ → khoá không giãn.
- Buổi thêm (isExtra) hiện trong lịch khoá nhưng không chiếm số buổi tính phí.
- **Mỗi khoá là một phiếu riêng.** Qua ngày sau buổi cuối của khoá cũ, khoá mới tự phát sinh phiếu cho cả lớp; khoá chưa bắt đầu không lập phiếu.
- **Công nợ = tổng phần chưa đóng của các khoá đã bắt đầu.** Nợ khoá cũ nằm ở phiếu khoá cũ, không gộp vào phiếu khoá mới. Phiếu khoá sau lập sớm theo cách cũ mà đã gửi yêu cầu / đã thu một phần vẫn tính là nợ.
- **Số buổi tồn = tổng buổi đã đóng của mọi khoá − buổi đã học.** Sang khoá mới chưa đóng thì tồn 0 rồi âm dần; còn nợ khoá cũ thì âm thêm số buổi khoá cũ; đóng khoá nào cộng đủ số buổi khoá đó. Mỗi khoá tính tối đa đúng số buổi của khoá.
- **Popup Thu học phí:** chọn khoá để thu. Chỉ thu được khoá đã bắt đầu còn nợ; khoá đã đóng đủ, đã thu trước khi dùng hệ thống hoặc chưa bắt đầu bị khoá nút thu (khoá chưa bắt đầu chỉ xem/in phiếu báo). Mặc định chọn khoá cũ nhất còn nợ. Backend kiểm tra lại cùng quy tắc nên không thu trùng được.
- **Phiếu báo** của một khoá cộng dồn nợ các khoá trước còn chưa đóng (vd khoá 3 khi khoá 1, 2 chưa đóng = khoá 3 + nợ khoá 1 + nợ khoá 2) — chỉ để báo, mỗi khoá vẫn thu theo phiếu riêng.
- **Sao kê / mã HP{lớp}{HV}:** khoản chuyển khớp đúng một khoá thì trả khoá cũ nhất trước; chuyển một lần cho nhiều khoá thì tự chia.
- Lớp có khoá bắt đầu trước 01/09/2026 mà học viên không có phiếu khoá đó → coi như đã thu ngoài hệ thống.

> LƯU Ý: Đổi hình thức thu của một lớp đang chạy là thao tác nhạy cảm — phiếu đã phát hành không tự viết lại. Khuyến nghị chốt hình thức thu ngay từ đầu và chỉ đổi khi khoá/kỳ hiện tại đã quyết toán xong.


## 13.3. Vòng đời phiếu phải thu (receivable)


| Trạng thái | Nghĩa |
|---|---|
| DRAFT | Bản nháp chưa gửi yêu cầu |
| OPEN | Đã tạo, chưa đủ tiền |
| PARTIALLY_PAID | Đã thu một phần |
| PAID / OVERPAID | Đủ / trả thừa (phần thừa thành credit) |
| CANCELLED / REFUNDED | Đã huỷ / đã hoàn |

- Mỗi phiếu gắn một **mã thanh toán** dạng `HP` + 6–10 ký tự — in trên QR và yêu cầu phụ huynh ghi vào nội dung CK.
- Bấm **Gửi yêu cầu thanh toán** sẽ **đóng băng (frozenAt)** phiếu: phiếu đã chốt không bị đồng bộ tự động hủy.
- Phiếu có `appliedCredits` = đã trừ tiền bảo lưu — cột Phải thu hiển thị kèm dòng "trừ bảo lưu …".
- Phiếu chuyển lớp có `billKey` dạng `transfer|lớp đích|lớp nguồn|kỳ neo` — được bảo vệ khỏi đồng bộ thường.

# 14. Thu học phí — ba đường tiền về


## 14.1. Tự động qua SePay (khuyến nghị)


Phụ huynh quét QR VietQR → chuyển khoản ghi nội dung chứa **mã thanh toán**. Webhook SePay gọi vào hệ thống:
1. Xác thực chữ ký webhook (bí mật ở Cấu hình → Tích hợp → SePay); trùng `providerTransactionId` bị bỏ qua.
2. Bóc mã `HP…` trong nội dung → tìm payment order còn ACTIVE.
3. Đủ tiền → phiếu PAID, kích hoạt buổi học ngay (dùng đúng công thức thu như đường thu tay), ghi sổ thu, xếp tin Zalo "đã thanh toán", tạo hoá đơn PENDING cho MISA phát hành sau.
4. Thiếu/thừa → tuỳ cờ autoPartial / autoOverpayment: không cho phép thì giao dịch sang **Giao dịch lệch** chờ kế toán.

## 14.2. Thu tay (tiền mặt / CK ngoài SePay)


Trang **Quản lý học phí** (`/ke-toan/hoc-phi`) → nút **Thu học phí** trên dòng học viên → hộp thoại hiện bảng tách từng kỳ chưa đóng + khoản nợ lớp trước + credit → chọn hình thức → Lưu. Hệ thống phát hành **phiếu thu `PT-YYYYMM-…`**, ghi sổ thu chi và cập nhật số buổi tồn ngay.

## 14.3. Sao kê ngân hàng tải tay


Nút **Cập nhật học phí** trên trang Quản lý học phí → tải file sao kê BIDV → từng dòng chạy đúng bộ máy khớp mã như webhook (`provider = BANK_IMPORT`). Dùng khi SePay chưa kịp bắn hoặc tài khoản chưa nối.

## 14.4. Giao dịch lệch (`/ke-toan/can-duyet`)


Mọi giao dịch không khớp sạch nằm ở hàng đợi này — **không bao giờ xoá cứng**, chỉ xử lý:

| Lý do | Nghĩa | Cách xử lý |
|---|---|---|
| Thiếu mã | Nội dung CK không chứa mã HP… | Chọn đúng mã thanh toán còn ACTIVE → Gán mã |
| Sai mã | Mã không thuộc phiếu nào | Gán mã đúng, hoặc Bỏ qua nếu không phải học phí |
| Thiếu tiền | Chuyển ít hơn phải thu | Gán mã → thành thu một phần (PARTIALLY_PAID) |
| Trả thừa | Chuyển nhiều hơn phải thu | Gán mã → phần dư thành credit của học viên |
| Đã thu | Mã đã dùng / phiếu đã PAID | Kiểm tra trùng rồi Bỏ qua |
| Không hợp lệ / AMOUNT_MISMATCH / TUITION_EXEMPT | Số phân bổ lệch báo giá hoặc học viên vừa miễn phí | Kế toán kiểm tra tay — tiền đã về, nghiệp vụ cần duyệt |


## 14.5. Phiếu thu & hoàn tác

- Mỗi lần thu sinh **phiếu thu** (biên lai) kèm số, kỳ, lớp, số buổi credit đã dùng, tiền học liệu.
- **Xoá phiếu thu** = hoàn tác nghiệp vụ thu: payment → VOIDED, phiếu mở lại, biên lai bỏ, giao dịch ngân hàng REVERSED, hoá đơn liên quan CANCELLED, credit đã tạo từ phiếu đó gỡ, số buổi tồn tính lại từ đầu tháng 9.
- Trang khoản phải thu có **đường link thanh toán công khai** `/thanh-toan/<id>/<token>` — gửi cho phụ huynh là thấy QR đúng số tiền còn lại, không cần đăng nhập.

# 15. Chuyển lớp, nghỉ học & bảo lưu học phí


## 15.1. Chuyển lớp


Tab Danh sách HV → **Chuyển lớp** trên dòng học viên → chọn lớp đích. Ràng buộc của hệ thống:
- Chỉ chuyển giữa **hai lớp cùng hình thức thu** (tháng↔tháng, khoá↔khoá). Riêng đưa về/ra khỏi **Lớp chờ** không giới hạn vì lớp chờ không thu phí.
- Lớp đích phải chưa kết thúc, học viên chưa có trong lớp đích, lớp đích < 200 học viên.
- Mốc vào lớp đặt về **đầu kỳ đang chạy** — học viên được tính học ở lớp đích cả kỳ như các bạn cùng lớp.

**Cơ chế tiền — hệ thống tự làm:**
1. Phiếu kỳ đang chạy của **lớp nguồn giữ nguyên, vẫn thu đủ** — chốt `frozenAt` để luật "mồ côi" không hủy khi học viên rời roster.
2. Phiếu kỳ **sau** của lớp nguồn (lập sẵn mà không còn học) và phiếu chuyển lớp cũ còn treo → **bị hủy**.
3. Chênh lệch giá tính ra một phiếu `transfer|…` neo vào **kỳ sau** (tháng sau / khoá sau): số **dương** = thu thêm (lớp đích đắt hơn), số **âm** = khấu trừ cho phụ huynh — gộp vào báo giá phiếu kỳ neo, không phát hành QR riêng.
4. Số dư buổi của lớp đích (khoá) được seed theo số dư phổ biến của các bạn cùng lớp.

> THÔNG TIN: Nhật ký ghi một dòng tóm tắt chuyển lớp: "… chuyển NGUỒN→ĐÍCH: đã học X buổi × giá · còn Y buổi × giá · phiếu NGUỒN …đ → +/−Z đ <kỳ neo>" — tra cứu trong Nhật ký hệ thống.


## 15.2. Xoá khỏi lớp → Lớp chờ (bảo lưu)

1. Tab Danh sách HV → nút 🗑 → xác nhận. Học viên chuyển về **Lớp chờ** (`class-waiting`), trạng thái **Chưa xếp lớp**.
2. Phiếu thu, công nợ, lịch sử điểm danh **giữ nguyên tuyệt đối** — vẫn hiện trên báo cáo chuyên cần với đánh dấu "đã rời <ngày>"; các buổi tương lai của học viên đó hiển thị đóng băng.
3. Các phiếu còn nợ của kỳ đã/đang chạy được **đóng băng** — công nợ đã chốt, phụ huynh vẫn phải trả.
4. Nếu đã trả vượt phần đã học → hệ thống tạo **credit bảo lưu** (`PRESERVED`) = đã đóng − giá trị buổi đã học.

## 15.3. Học viên quay lại học


Khi học viên được xếp lại vào lớp (thêm vào lớp hoặc chuyển từ Lớp chờ): credit bảo lưu còn dư sẽ được **tự động trừ vào phiếu kỳ tới** — phiếu mới hiện "đã trừ bảo lưu …" và thu đúng phần chênh. Nếu credit đã dùng hết hoặc không còn số dư, credit tự đóng.

# 16. Thu chi, đối soát & dòng tiền


## 16.1. Quản lý thu chi (`/ke-toan/thu-chi`)

- Sổ thu chi hàng ngày: phiếu **thủ công** (Tạo phiếu thu - chi) + mọi khoản **thu học phí** tự ghi vào (nguồn "Học phí", gắn biên lai).
- Lọc: khoảng ngày · Thu/Chi · Tiền mặt/Chuyển khoản · Chi nhánh.
- Nút **Phiếu thu/Phiếu chi** trên từng dòng in chứng từ; thùng rác xoá phiếu thủ công.

## 16.2. Đối soát thu chi (`/ke-toan/doi-soat`)


Gộp thu/chi theo **từng ngày**: tổng thu, tổng chi, chênh lệch — đối chiếu với sổ quỹ/sao kê thật. Chỉ phục vụ đối soát số liệu, không có duyệt.

## 16.3. Dự thu - Dự chi (`/ke-toan/du-thu-du-chi`)


Kế hoạch dòng tiền chỉ-đọc: các khoản sắp phải thu (phiếu chưa đóng) và phải chi, sắp theo Quá hạn → Sắp đến hạn → Trong hạn → Đã hoàn tất. Ba thẻ tổng: phải thu tháng này · phải trả tháng này · khoản thu quá hạn.

# 17. Hoá đơn điện tử & tin Zalo


## 17.1. Quản lý doanh số (`/ke-toan/hoa-don`)

- Bảng doanh số theo học viên & phiếu thu — lọc chi nhánh / lớp / tháng / phạm vi (Tất cả · Khớp doanh số · Giảm doanh số — các dòng điều chỉnh giảm hiện đỏ riêng).
- Trạng thái hoá đơn trên từng dòng: Chưa xuất → Đang phát hành → Đã phát hành (kèm số HĐ). Cột cuối **tải hoá đơn**.
- Nút **Export** xuất Excel đúng mẫu import "Bán hàng" 34 cột của MISA — import thẳng vào MISA khi cần.
- MISA lấy dữ liệu qua API; hóa đơn PENDING do **hàng chờ** phát hành (không nằm trong request webhook).

## 17.2. Nhật ký Zalo (`/ke-toan/tin-zalo`)


Mọi tin gửi qua Zalo OA/ZBS tới SĐT chính của phụ huynh: tin **yêu cầu thanh toán** (khi kế toán bấm gửi) và tin **thông báo đã thanh toán/hoá đơn** (tự động sau khi tiền khớp). Mỗi dòng có trạng thái Chờ/Đã gửi/Đã nhận/Lỗi + số lần thử + lỗi gần nhất; tin lỗi có nút **Gửi lại**.

> LƯU Ý: Tin Zalo đi tới parentPhone1 — kiểm tra số điện thoại chính trong hồ sơ học viên trước khi bấm gửi yêu cầu.


# 18. Chấm công & lương giáo viên


## 18.1. Báo cáo chấm công (`/ke-toan/cham-cong`)

- **Giờ dạy lý thuyết** = toàn bộ buổi hiện trên lịch dạy của tháng (buổi nghỉ học vụ do admin cấu hình không hiện trên lịch dạy nên đã bị loại).
- **Giờ nghỉ** = buổi GV tick nghỉ hoặc đã hủy. **Buổi học không tính phí vẫn tính giờ** cho giáo viên.
- **Chấm công thực tế** = giờ các buổi đã chạy tới thời điểm xem (qua giờ kết thúc) — số chạy realtime.
- Bấm tên GV → nhật ký từng buổi: ngày, lớp, giờ, phòng, điểm danh, nhãn nghỉ (GV nghỉ/Nghỉ học vụ/Đã hủy).

## 18.2. Báo cáo lương (`/ke-toan/luong`)


Lương = **giờ dạy thực tế × (lương hợp đồng ÷ 208)** — 208 giờ = 26 công chuẩn × 8 giờ. Hồ sơ lương từng GV gồm loại hợp đồng và khoản biến động tháng:

| Loại hợp đồng | Khấu trừ |
|---|---|
| HĐ lao động (LABOR) | Trừ BH NLD 10,5% lương HĐ + giảm trừ 15,5tr bản thân + 6,2tr/người phụ thuộc → phần còn lại tính thuế lũy tiến 7 bậc (5%→35%). |
| HĐ dịch vụ / thời vụ (SERVICE) | Khấu trừ 10% khi tổng thu nhập ≥ 2 triệu; dưới 2 triệu không khấu trừ. |

- Biến động tháng nhập tay trong hồ sơ lương: **Thưởng, Phụ cấp, Tạm ứng**.
- Thực nhận = giờ×đơn giá + thưởng + phụ cấp − BH − thuế − tạm ứng.
- Bấm vào dòng lương → chi tiết từng buổi được tính giờ (buổi đã chạy, không nghỉ, không huỷ).

# 19. Báo cáo đào tạo


## 19.1. Báo cáo chuyên cần (`/bao-cao/chuyen-can`)


Ma trận **học viên × buổi học** của một lớp: mỗi lần lưu điểm danh hệ thống tự thêm một cột ngày. Cột **Chuyên cần** là tỷ lệ có mặt. Học viên đã rời lớp vẫn hiện kèm nhãn "(đã rời dd/mm)" và các ô sau ngày rời hiển thị đóng băng — lịch sử không bị mất.

## 19.2. Báo cáo học vụ (`/bao-cao/hoc-vu`)

- Bảng theo **từng buổi đã báo cáo**: lớp, GV, số buổi, điểm danh (có mặt/phép/vắng), số clip ở nhà đã làm, điểm từ vựng TB, các cột điểm thêm, ghi chú.
- Lọc theo từ khoá, lớp, giáo viên, khoảng ngày. Bấm **Xem báo cáo** → popup chi tiết có thể **xuất PDF**.
- Giáo viên có bản riêng ở `/gv/bao-cao-hoc-vu` (chỉ lớp mình); cột không có dữ liệu trong khoảng lọc tự ẩn.
- Trợ giảng cũng dùng màn hình này để vào buổi nhập điểm.

## 19.3. Báo cáo định kỳ (`/bao-cao/dinh-ky`)


Báo cáo từng học viên theo **tháng**: chọn lớp đang học + tháng báo cáo → danh sách học viên với trạng thái Chưa báo cáo / Bản nháp / Đã hoàn thành → bấm **Xem** để mở form báo cáo của em đó. Admin và GV lưu báo cáo; báo cáo ghi kèm người và thời điểm cập nhật cuối.

## 19.4. Chấm điểm Phiếu (`/bao-cao/cham-phieu`) — API thật


Chấm phiếu bài tập bằng **OpenAI** (bật ở Cấu hình → Tích hợp → Chấm bài AI): các "bài kiểm tra của buổi" chính là cột Từ vựng + các cột điểm tùy biến GV đã tạo. AI sinh đáp án từ đề và chấm bài làm; kết quả vào phiếu để GV/TS duyệt.

## 19.5. Chấm điểm Video (`/bao-cao/cham-video`) — đang chạy demo


> LƯU Ý: Trang Chấm điểm Video hiện là bản demo phía client (dữ liệu minh hoạ, chưa nối API): mô phỏng luồng video từ group Zalo → AI nhận diện từ, tách lỗi → GV duyệt nhận xét → gửi phụ huynh qua Zalo OA. Chưa dùng cho vận hành thật.


# 20. Cổng học viên (/portal)

- **Overview**: lớp đang học, chương trình, % tiến độ (hoạt động đã làm / tổng), số sao thưởng, buổi tiếp theo (nút Mở buổi học), thông tin lớp–GV–phòng–lịch, khu đổi sao lấy quà.
- **Cây học tập bên trái**: theo Khoá → Unit → Day; mỗi Day gồm các hoạt động/game ôn tập (flashcard, nghe, ghép, sắp câu, quiz…) — làm xong nhận sao.
- **Trang Học phí**: hiện QR VietQR của khoản phải thu + trạng thái ĐÃ/CHƯA THANH TOÁN — hệ thống tự xác nhận khi ngân hàng báo tiền về.

# 21. Nhật ký hệ thống & kiểm soát


Trang **Nhật ký** (`/nhat-ky`, chỉ admin): ghi mọi thao tác thêm/sửa/xoá + đăng nhập, kèm người thực hiện, thời điểm, thực thể và tóm tắt thay đổi. **Chỉ đọc** — không sửa/xoá. Lọc theo hành động, thực thể, ngày.

> QUY TẮC: Mật khẩu và bí mật tích hợp không bao giờ được ghi vào nhật ký. Webhook SePay bị từ chối cũng có vết riêng trong log để điều tra.


## 21.1. Các quy tắc bất biến cần nhớ

1. Chứng từ đã phát hành (phiếu đã gửi yêu cầu / đã thu / đã PAID) **không bị viết lại** bởi đồng bộ tự động — chỉ thao tác chủ động (xoá phiếu thu, huỷ, hoàn tác) mới thay đổi, và luôn để lại vết.
2. Phiếu còn nợ của học viên đã rời lớp được **đóng băng** — vẫn đòi được, không mất.
3. Phiếu kỳ tương lai của người đã rời/chuyển → tự **huỷ** để không thu nhầm.
4. Buổi nghỉ học vụ do admin cấu hình **khoá cứng** — không ai sửa được ngoài màn cấu hình.
5. Nghỉ GV vẫn tính phí kỳ đó; phần hoàn lại nằm ở **credit kỳ sau** (từ 10/2026) hoặc ở buổi dạy bù.
6. Học không tính phí ≠ nghỉ: lớp vẫn học, vẫn điểm danh, chỉ không tính tiền.
7. Giao dịch lệch **không xoá cứng** — chỉ gán mã hoặc bỏ qua.

# 22. Sổ tay xử lý tình huống (SOP)


## 22.1. Giáo viên báo nghỉ buổi dạy

8. GV vào tab Điểm danh của buổi đó → tick **Nghỉ học** → Lưu.
9. Buổi tự vào danh sách chờ dạy bù (nếu từ đầu tháng này trở đi).
10. Admin vào **Lịch dạy** → bấm **+** ở ô giờ trống → chọn đúng buổi nghỉ → Xếp lịch dạy bù.
11. Lớp thu tháng: credit tự trừ vào phiếu tháng sau. Lớp thu khoá: khoá kéo dài — trừ khi đã xếp buổi bù.

## 22.2. Nghỉ lễ / nghỉ học vụ toàn trung tâm

12. Admin vào **từng lớp** → tab Thông tin → khối Cấu hình lịch nghỉ/lịch khóa.
13. Lớp tháng: chọn tháng → tick các buổi nghỉ → **Lưu lịch nghỉ**. Lớp khoá: tick trên lịch khoá → **Lưu cấu hình khoá**.
14. Buổi được tick: không tính phí, khoá tự kéo dài bù, khoá hoàn toàn trong Điểm danh.

## 22.3. Buổi học vẫn diễn ra nhưng miễn phí (lớp bù, lớp trải nghiệm)


Admin mở buổi trong Điểm danh → bật **Học không tính phí** → Lưu. Lớp điểm danh/nhập điểm bình thường; buổi không tính vào học phí; lớp thu khoá tự kéo dài một buổi bù cuối khoá.

## 22.4. Học viên chuyển lớp giữa chừng


Dùng **Chuyển lớp** — không xoá rồi thêm lại tay (mất liên kết công nợ). Hệ thống tự đóng băng phiếu kỳ đang chạy của lớp nguồn, huỷ phiếu kỳ sau, và lập phiếu chênh lệch neo vào kỳ sau. Kiểm tra lại dòng "Chênh lệch chuyển lớp …" trong Khoản phải thu.

## 22.5. Học viên nghỉ học giữa chừng


Nút 🗑 trong Danh sách HV → học viên về Lớp chờ, công nợ kỳ đã chạy đóng băng vẫn thu được, phần đóng thừa thành **credit bảo lưu**. Khi quay lại: thêm vào lớp mới — credit tự trừ vào phiếu đầu tiên.

## 22.6. Phụ huynh đóng tiền mà hệ thống chưa nhận

1. Kiểm tra **Giao dịch SePay**: giao dịch có mã HP… đúng chưa; trạng thái Đã gạch/Giao dịch lệch.
2. Vào **Giao dịch lệch** → gán đúng mã thanh toán (hoặc bỏ qua nếu không phải học phí).
3. Nếu phụ huynh quên ghi nội dung: xử lý tay bằng **Thu học phí** (hình thức Chuyển khoản) rồi đối soát sao kê.
4. Trường hợp đã dùng đường thu tay: giao dịch ngân hàng về sau đánh dấu trùng/bỏ qua — không ghi đúp.

## 22.7. Thu nhầm / cần huỷ một phiếu thu


Xoá phiếu thu tương ứng: payment VOIDED, phiếu mở lại, biên lai rút, giao dịch REVERSED, hoá đơn CANCELLED, số buổi tồn tính lại — toàn bộ trong một thao tác hoàn tác.

## 22.8. Cuối tháng chốt sổ

1. Rà soát **Quản lý học phí**: lọc Công nợ → gửi/nhắc lại yêu cầu thanh toán cho nhóm còn nợ.
2. Kiểm tra **Giao dịch lệch** còn dòng nào chưa xử lý.
3. **Đối soát thu chi** từng ngày với sao kê/sổ quỹ.
4. **Quản lý doanh số**: đối chiếu trạng thái hoá đơn, Export MISA nếu cần.
5. **Báo cáo chấm công** → **Báo cáo lương**: nhập thưởng/phụ cấp/tạm ứng từng GV → chốt bảng lương.
6. **Báo cáo định kỳ**: kiểm tra lớp nào chưa hoàn tất báo cáo tháng.

# 23. Checklist vận hành theo nhịp


## 23.1. Hằng ngày

- GV: điểm danh + tick clip/phiếu + nhập điểm từ vựng từng buổi — bấm Lưu trước khi rời lớp.
- Học vụ/Admin: rà soát Task chưa điểm danh của các lớp; xếp dạy bù cho buổi nghỉ mới phát sinh.
- Kế toán: xem Giao dịch lệch mới; ghi thu chi phát sinh ngoài học phí.

## 23.2. Hằng tuần

- Đối chiếu công nợ tuần: danh sách Công nợ ↔ phiếu đã gửi ↔ tin Zalo đã đi.
- Kiểm tra lịch tuần tới: lớp đủ lịch chưa, có buổi nghỉ học vụ cần khai báo trước không.
- Rà soát sĩ số lớp: học viên chờ ở Lớp chờ có cần xếp lớp không.

## 23.3. Hằng tháng

- Chốt học phí tháng mới (lớp tháng) / khoá mới (lớp khoá): kiểm tra phiếu đã lập sẵn, gửi yêu cầu thanh toán.
- Nhập học liệu tháng/khoá trước khi phát hành phiếu.
- Chốt chấm công → tính lương → xuất hoá đơn/doanh số → đối soát tổng.
- Hoàn tất báo cáo định kỳ từng học viên cho tháng vừa qua.

# Phụ lục


## A. Bản đồ đường dẫn


| Đường dẫn | Trang | Vai trò |
|---|---|---|
| /dashboard | Dashboard tổng quan | Admin |
| /syllabus | Chương trình học | Admin |
| /lop-hoc · /lop-hoc/{id}/thong-tin·hoc-vien·diem-danh | Lớp học & chi tiết lớp | Admin (kế toán xem) |
| /lich-day | Lịch dạy toàn trung tâm + xếp dạy bù | Admin (GV xem lớp mình ở /gv/lich-day) |
| /hoc-vien · /hoc-vien/{id} | Học viên & hồ sơ chi tiết | Admin |
| /giao-vien · /ke-toan-vien · /tro-giang | Nhân sự | Admin |
| /ke-toan/hoc-phi | Quản lý học phí (công nợ theo học viên) | Admin · Kế toán |
| /ke-toan/hoc-phi/{id} | Trang thanh toán một khoản (QR + mã) | Admin · Kế toán |
| /ke-toan/hoa-don | Quản lý doanh số + Export MISA | Admin · Kế toán |
| /ke-toan/tin-zalo | Nhật ký tin Zalo | Admin · Kế toán |
| /ke-toan/sepay | Giao dịch ngân hàng qua SePay | Admin · Kế toán |
| /ke-toan/can-duyet | Giao dịch lệch — gán mã/bỏ qua | Admin · Kế toán |
| /ke-toan/thu-chi | Sổ thu chi | Admin · Kế toán |
| /ke-toan/doi-soat | Đối soát thu chi theo ngày | Admin · Kế toán |
| /ke-toan/du-thu-du-chi | Kế hoạch dòng tiền (chỉ đọc; hiện ẩn khỏi menu) | Admin · Kế toán |
| /ke-toan/cham-cong | Báo cáo chấm công GV | Admin · Kế toán |
| /ke-toan/luong | Báo cáo lương | Admin · Kế toán |
| /bao-cao/chuyen-can · hoc-vu · dinh-ky · cham-phieu · cham-video | Báo cáo đào tạo | Admin |
| /nhat-ky | Nhật ký hệ thống (chỉ đọc) | Admin |
| /cai-dat/… | Cấu hình trung tâm/chi nhánh/loại lớp/tiết/học phí/tài khoản/tích hợp | Admin (kế toán chỉ xem tài khoản) |
| /tai-lieu | Tài liệu sử dụng trong app | Admin · Kế toán |
| /gv · /gv/lich-day · /gv/lop-hoc · /gv/bao-cao-hoc-vu · /gv/task | Khu giáo viên | GV (TG chỉ có báo cáo học vụ) |
| /portal | Cổng học viên | Học viên |
| /thanh-toan/{id}/{token} | Trang thanh toán công khai (không cần đăng nhập) | Phụ huynh |


## B. Bảng trạng thái tham chiếu


| Đối tượng | Các trạng thái |
|---|---|
| Lớp | Nháp (DRAFT) · Đang học (ACTIVE) · Tạm dừng (PAUSED) · Kết thúc (FINISHED) |
| Buổi học | Đã xếp lịch (SCHEDULED) · Hoàn thành (COMPLETED) · Đã huỷ (CANCELLED) |
| Điểm danh học viên | Có mặt (PRESENT) · Vắng phép (EXCUSED) · Vắng không phép (ABSENT) · trống = chưa điểm danh |
| Học viên | Chưa xếp lớp (UNASSIGNED) · Đang học (STUDYING) · Nghỉ học (STOPPED) |
| Phiếu phải thu | DRAFT · OPEN · PARTIALLY_PAID · PAID · OVERPAID · CANCELLED · REFUNDED |
| Giao dịch ngân hàng | RECEIVED · MATCHED · UNMATCHED · ALLOCATED · DUPLICATE · IGNORED · REVERSED · NEEDS_REVIEW |
| Payment ledger | PENDING · COMPLETED · PARTIAL · OVERPAID · REFUNDED · VOIDED |
| Hoá đơn | PENDING · PROCESSING · ISSUED · FAILED · CANCELLED · ADJUSTED · REPLACED |
| Tin Zalo | QUEUED · SENT · DELIVERED · FAILED |


## C. Hằng số nghiệp vụ đang áp dụng


| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| Mốc sinh lịch | 01/09/2026 | Buổi học tồn tại từ ngày này trở đi |
| Số buổi khoá mặc định | 24 | Khi lớp không chọn gói khác |
| Mốc credit buổi GV nghỉ | 10/2026 | Nghỉ trước mốc đã xử lý tay, không tự trừ |
| Mốc hiển thị lịch sử tài chính | 01/10/2026 | Bản ghi trước mốc ẩn khỏi giao diện (dữ liệu còn) |
| Mã thanh toán | HP + 6–10 ký tự | Bóc từ nội dung chuyển khoản |
| Số phiếu thu | PT-YYYYMM-NNNNNN | Tự tăng theo tháng |
| Cột điểm tùy biến / buổi | tối đa 12 | Kéo ⠿ đổi vị trí |
| Giờ công chuẩn | 208 giờ/tháng | 26 công × 8 giờ — mẫu số tính lương |
| BH NLD (HĐLĐ) | 10,5% lương HĐ | BHXH 8% + BHYT 1,5% + BHTN 1% |
| Giảm trừ gia cảnh | 15,5tr + 6,2tr/NPT | Chỉ HĐ lao động |
| Khấu trừ HĐ dịch vụ | 10% khi ≥ 2 triệu | Thu nhập dưới 2 triệu không trừ |
| Sĩ số lớp tối đa | 200 | Chặn ở API chuyển/thêm |
| Log webhook SePay giữ | 200 dòng mới nhất | Trang Tích hợp hiện log gần nhất |


## D. Thuật ngữ


| Thuật ngữ | Giải thích |
|---|---|
| Lớp chờ | Lớp đặc biệt (class-waiting) chứa học viên chưa/đã rời lớp — không sinh lịch, không thu phí |
| Credit bảo lưu | Phần tiền đóng thừa khi học viên rời lớp — tự trừ vào phiếu khi quay lại |
| frozenAt | Dấu đóng băng phiếu khi đã gửi yêu cầu thanh toán / chốt công nợ — chống đồng bộ hủy mồ côi |
| billKey | Khoá định danh kỳ bill: month\|lớp\|YYYY-MM, months\|…, course\|lớp\|N, transfer\|đích\|nguồn\|neo |
| makeupOf | Liên kết buổi dạy bù → buổi nghỉ gốc; buổi bù chiếm vị trí khóa của buổi nghỉ |
| noFee | Buổi vẫn học, điểm danh bình thường, không tính học phí — chỉ admin bật/tắt |
| offSource | Nguồn nghỉ: TEACHER (GV tick) ≠ cấu hình học vụ (admin) — hậu quả học phí khác nhau |
| Số dư buổi tồn | Buổi đã trả tiền còn lại có thể học — cột "Còn lại" trong Quản lý học phí |


## E. Giới hạn & điều đã biết

- Trang **Chấm điểm Video** và một số khối **Tuyển sinh / Nhật ký thu hp** trên menu demo đang là placeholder — chưa có nghiệp vụ thật.
- Tab **Phòng học** trong Cấu hình hiện ẩn; phòng vẫn nằm trong dữ liệu lớp.
- Mục **Dự thu - Dự chi** có trang nhưng đang ẩn khỏi menu Kế toán — vào được bằng đường dẫn `/ke-toan/du-thu-du-chi`.
- Học viên đăng nhập portal bằng tài khoản riêng (role STUDENT); phụ huynh không có tài khoản — nhận thông tin qua Zalo + trang thanh toán công khai.
- Mỗi thao tác ghi điểm danh / thu phí đều tính lại số dư ngay — khi sửa dữ liệu cũ, kiểm tra lại cột Còn lại của các bạn liên quan.

*— Hết sổ tay vận hành —*
