-- Bảng task giao việc thủ công (`GeneralTask`).
-- Schema đã có model từ commit thêm trang /task, nhưng thiếu migration nên
-- `prisma migrate deploy` trên production không tạo bảng → /task crash
-- (`relation "general_tasks" does not exist`).
--
-- IF NOT EXISTS vì DB local có thể đã được dựng bằng `prisma db push`.

CREATE TABLE IF NOT EXISTS "general_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" "RecruitmentTaskStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "general_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "general_tasks_assigneeId_status_idx"
    ON "general_tasks"("assigneeId", "status");

CREATE INDEX IF NOT EXISTS "general_tasks_creatorId_idx"
    ON "general_tasks"("creatorId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'general_tasks_assigneeId_fkey') THEN
        ALTER TABLE "general_tasks"
            ADD CONSTRAINT "general_tasks_assigneeId_fkey"
            FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'general_tasks_creatorId_fkey') THEN
        ALTER TABLE "general_tasks"
            ADD CONSTRAINT "general_tasks_creatorId_fkey"
            FOREIGN KEY ("creatorId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'general_tasks_completedById_fkey') THEN
        ALTER TABLE "general_tasks"
            ADD CONSTRAINT "general_tasks_completedById_fkey"
            FOREIGN KEY ("completedById") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
