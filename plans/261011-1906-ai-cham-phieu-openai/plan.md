---
title: Chấm điểm Phiếu bằng OpenAI thật
status: done
created: 2026-10-11
---

# Chấm điểm Phiếu bằng OpenAI thật

## Outcome
Trang `/bao-cao/cham-phieu` chấm bài thật: giáo viên up file đề, AI sinh đáp án từ đề (sửa được),
up cả thư mục ảnh bài làm, AI đọc từng bài, nhận ra tên học sinh, chấm từng câu, tính điểm, lưu DB.

## Acceptance
1. Cấu hình → Tích hợp có tab "Chấm bài AI (OpenAI)": bật/tắt, nhập key (mã hoá, chỉ hiện 4 ký tự cuối),
   nút "Tải danh sách model" (chỉ model tạo trong 6 tháng gần nhất, dùng được cho chat/vision), chọn model, kiểm tra kết nối.
2. Tạo bài kiểm tra theo lớp + buổi + tên bài; up file đề (docx/pdf/ảnh/txt) → AI sinh đáp án → xem và sửa đáp án.
3. Up nhiều ảnh bài làm (chọn file hoặc cả thư mục) → lưu server, chấm từng bài, nhận diện học sinh theo tên viết tay
   và đối chiếu danh sách lớp; không khớp thì giáo viên chọn tay.
4. Kết quả: điểm /10, đúng/sai từng câu, nhận xét, khung đỏ trên ảnh ở câu sai. F5 không mất dữ liệu.
5. Không lộ key ra client / log. Chỉ ADMIN cấu hình key. Không đổi schema DB (KV có sẵn).

## Non-goals
Ghi điểm vào phiếu điểm danh, chấm Video, chấm Writing/Speaking của portal học sinh.

## Design
- `cloudflare/openai-client.ts`: gọi OpenAI Responses API (fetch), liệt kê model, JSON schema output.
- `cloudflare/docx-text.ts`: lấy chữ từ .docx không cần thư viện (zip + DecompressionStream).
- `cloudflare/grading-engine.ts`: sinh đáp án, chấm bài, khớp học sinh, tính điểm.
- `cloudflare/grading-routes.ts`: API `/api/grading/*`, lưu qua KV (`grading-tests`, `grading-test:{id}`, `grading-file:{id}`).
- `integration-settings.ts`: thêm nhóm `ai` (tương thích bản lưu cũ).
- `public/grading-worksheet.js`: giao diện trang chấm phiếu; `app.js` chỉ gọi vào.

## Validation
Unit test với OpenAI giả (fetch mock) + chạy Chrome với server OpenAI giả cục bộ. Chưa có key thật để test model thật.
