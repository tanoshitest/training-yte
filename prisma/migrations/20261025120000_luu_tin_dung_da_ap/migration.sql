-- Lưu phần tín dụng (tiền thừa / bảo lưu) đã áp vào từng khoản phải thu và lớp
-- nguồn của tín dụng. Thiếu hai cột này, mỗi lần đọc lại tín dụng bị áp lặp.
ALTER TABLE "sepay_receivables" ADD COLUMN "appliedCredits" TEXT;
ALTER TABLE "sepay_credits" ADD COLUMN "sourceClassId" TEXT;
