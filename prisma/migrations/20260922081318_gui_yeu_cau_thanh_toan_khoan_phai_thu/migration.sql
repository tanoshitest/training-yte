-- AlterTable
ALTER TABLE "sepay_receivables" ADD COLUMN     "frozenAt" TEXT,
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "requestedBy" TEXT;
