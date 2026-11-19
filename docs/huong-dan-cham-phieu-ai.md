# Chấm điểm Phiếu bằng AI (OpenAI)

Trang **Báo cáo đào tạo → Chấm điểm Phiếu** (`/bao-cao/cham-phieu`) chấm phiếu bài tập viết tay bằng OpenAI.
Mã nguồn: `cloudflare/grading-routes.ts` (API), `cloudflare/grading-engine.ts` (chấm điểm),
`cloudflare/openai-client.ts` (gọi OpenAI), `cloudflare/public/grading-worksheet.js` (giao diện).

## 1. Cấu hình (chỉ ADMIN)

**Cấu hình → Tích hợp → tab "Chấm bài AI (OpenAI)"**

1. Nhập API key, bấm **Lưu**. Key được mã hoá bằng `AUTH_SECRET`, chỉ hiện lại 4 ký tự cuối.
2. Bấm **Tải danh sách model**: chỉ liệt kê model chat của OpenAI phát hành trong **6 tháng gần nhất**.
3. Chọn model (cần đọc được ảnh), bật công tắc, **Lưu**, rồi **Kiểm tra kết nối**.

Mỗi lần sinh đáp án hoặc chấm bài đều tính phí theo tài khoản OpenAI.

## 2. Cấu trúc thư mục chuẩn để chuẩn bị bài

Mỗi **thư mục con trong `bainop` là toàn bộ ảnh bài làm của đúng một học viên**. Đặt tên thư mục là tên học viên
(có dấu hay không dấu đều được) để hệ thống tự gán học viên cho bài.

```
baitap/
├── de-bai/                          ← file đề (một file duy nhất)
│   └── rewrite 5.4 7.10.docx        ← Word, PDF, ảnh hoặc .txt
└── bainop/                          ← thư mục chọn khi bấm "Chọn thư mục"
    ├── Khanh An/                    ← một học viên = một thư mục
    │   ├── 1.jpg                    ← trang 1 (câu 1–22), có ghi tên
    │   └── 2.jpg                    ← trang 2 (câu 23–45)
    ├── Trinh Ha Anh/
    │   ├── 1.jpg
    │   └── 2.jpg
    └── Bao Chau/
        └── 1.jpg                    ← bài chỉ có 1 tờ cũng được
```

Quy tắc:

- Ảnh trong một thư mục được xếp theo **tên file** (`1.jpg` trước `2.jpg`, `10.jpg` sau `9.jpg`) và coi là trang 1, 2, … của bài.
  Nên đánh số theo thứ tự trang.
- Mỗi học viên có thể nộp **nhiều ảnh tuỳ ý** (2, 3, 5… mỗi bạn một số khác nhau), tối đa **12 ảnh**/bài, mỗi ảnh tối đa 8MB (trình duyệt tự nén ảnh về cạnh dài 2000px trước khi tải lên).
- Chấp nhận JPG, PNG, WebP. Ảnh HEIC của iPhone cần đổi sang JPG.
- Chọn thư mục `bainop`, hoặc thư mục cha `baitap`: hệ thống chỉ lấy ảnh và tự nhận ra thư mục con của từng học viên.
- Tên thư mục khớp **đúng một** học viên của lớp (và học viên đó chưa có bài khác) thì được gán luôn. Khớp không rõ
  (hai bạn cùng tên, hoặc tên lạ như `hs-07`) thì để trống; sau khi chấm AI sẽ thử khớp theo **tên viết tay trên bài**,
  còn không được thì chọn tay ở cột "Học viên".

Lưu ý: hệ thống chỉ gom theo thư mục khi có **từ 2 thư mục con trở lên**. Nếu chỉ tải ảnh của một học sinh (2, 3 hay nhiều ảnh), chọn **"Cách chia ảnh" → "Tất cả ảnh là một học viên"**. Học viên nộp thêm trang sau khi đã tải: bấm **+ Ảnh** ở dòng của bạn đó rồi chấm lại.

### Trường hợp không có thư mục con (tất cả ảnh chung một thư mục)

Ví dụ `bainop/` chứa các ảnh Zalo đặt tên theo giờ gửi. Chọn **"Cách chia ảnh"** bằng số tờ mỗi học sinh nộp
(bài 2 tờ thì đặt 2): hệ thống sắp ảnh theo tên file rồi cứ N ảnh liên tiếp là một học sinh. Cách này chỉ đúng khi mọi
học sinh nộp đủ N ảnh và ảnh không bị lẫn thứ tự — nên dùng thư mục con cho chắc.

## 3. Quy trình

1. **Tạo bài kiểm tra**: chọn lớp, buổi, tên bài. Tên bài là một cột điểm của buổi (`Từ vựng` hoặc cột tuỳ biến đã thêm
   ở phiếu điểm danh) — dùng cho bước ghi điểm ở cuối.
   Giáo viên chỉ thấy và chấm được lớp mình phụ trách; admin và trợ giảng học vụ thấy tất cả.
2. **Tải file đề** → **Sinh đáp án bằng AI**. Kiểm tra và sửa đáp án ngay trên trang (mỗi dòng trong ô đáp án là một cách
   viết được chấp nhận) rồi **Lưu đáp án**. Đổi file đề sẽ xoá đáp án cũ.
3. **Chọn thư mục** (hoặc **Chọn ảnh**) → **Chấm**. AI chấm từng câu.
   **Điểm = số câu đúng / tổng số câu của đề** (ví dụ 38/45; không quy ra thang 10).
   Bấm **Xem** để xem ảnh và từng câu: bài làm của học viên, câu đã sửa lại cho đúng, đáp án, giải thích sai ở đâu,
   cùng phần **góp ý chung** (điểm tốt, lỗi lặp lại, nên ôn gì).
   AI đọc nhầm chữ viết tay thì bấm **Đổi thành đúng/sai** ở câu đó, điểm tự tính lại (chấm lại bằng AI sẽ ghi đè).
   Nút **Tải PDF báo cáo** (hoặc nút **PDF** ở từng dòng) tải phiếu kết quả của học viên: điểm, góp ý và các câu sai kèm cách sửa, để in gửi học viên.
   Nút **Tải PDF cả lớp (.zip)** tải một file zip, mỗi học viên đã chấm một PDF.
   **Sắp xếp thư mục bài nộp** (cũng có hướng dẫn ngay trên trang, mục "Cách sắp xếp thư mục bài nộp"):
   - Khuyên dùng: mỗi học viên một thư mục con, đặt tên theo tên học viên (ví dụ `bainop/Nguyen Van A/1.jpg, 2.jpg`), số ảnh mỗi bạn tuỳ ý, tối đa 12. Chọn thư mục ngoài cùng; tên thư mục dùng để tự gán học viên.
   - Ảnh để chung một thư mục: chọn **Cách chia ảnh** = số ảnh mỗi học viên; ảnh xếp theo tên file rồi cắt đều, nên đặt tên file theo thứ tự (01, 02, …).
   - Chỉ một học viên: chọn thư mục ảnh của bạn đó với **Cách chia ảnh** = "Tất cả ảnh là một học viên".
4. Sửa cột **Học viên** nếu gán chưa đúng. Học viên đã gán bằng thư mục hoặc chọn tay sẽ không bị AI ghi đè khi chấm lại.
5. **Ghi điểm vào phiếu điểm danh**: ghi điểm dạng số câu đúng/tổng câu (ví dụ 38/45) của các bài đã chấm và đã gán học viên vào cột điểm cùng tên với bài
   kiểm tra của buổi đó. Hệ thống hỏi xác nhận, báo số ô đã có điểm sẽ bị ghi đè, và bỏ qua học viên chưa được điểm danh
   buổi này (hãy điểm danh trước).

## 4. Giới hạn cần biết

- Chất lượng đọc chữ viết tay và việc nhận xét phụ thuộc model; giáo viên nên xem lại bài trước khi ghi điểm.
- Lưu trữ: ảnh và đề lưu base64 trong kho `vps_app_state` (khoá `grading-*`), không đổi schema. Xoá bài kiểm tra sẽ xoá cả
  ảnh và file đề của bài.
- Chạy thử với OpenAI giả: đặt biến môi trường `OPENAI_BASE_URL` (ví dụ `http://localhost:4010/v1`). Không đặt ở production.
