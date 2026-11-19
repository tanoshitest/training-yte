-- AlterTable
ALTER TABLE "zalo_message_logs"
  ADD COLUMN     "templateData" TEXT,
  ADD COLUMN     "studentName" TEXT,
  ADD COLUMN     "studentCode" TEXT,
  ADD COLUMN     "className" TEXT,
  ADD COLUMN     "rawPhone" TEXT,
  ADD COLUMN     "requestedBy" TEXT,
  ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "lastAttemptAt" TEXT,
  ADD COLUMN     "providerSentTime" TEXT,
  ADD COLUMN     "webhookAt" TEXT,
  ADD COLUMN     "webhookPayload" TEXT;
