-- Mã tra cứu nhanh cho syllabus. Nullable + không default nên chỉ cộng thêm,
-- dữ liệu cũ giữ nguyên (docs/DEPLOY.md §9).
ALTER TABLE "syllabuses" ADD COLUMN IF NOT EXISTS "code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "syllabuses_code_key" ON "syllabuses"("code");
