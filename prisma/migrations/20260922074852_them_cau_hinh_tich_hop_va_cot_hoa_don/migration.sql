-- AlterTable
ALTER TABLE "sepay_invoices" ADD COLUMN     "buyerAddress" TEXT,
ADD COLUMN     "buyerEmail" TEXT,
ADD COLUMN     "buyerTaxCode" TEXT,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "providerInvoiceId" TEXT,
ADD COLUMN     "taxAuthorityCode" TEXT,
ADD COLUMN     "xmlUrl" TEXT;

-- CreateTable
CREATE TABLE "integration_settings" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_message_logs" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "receivableId" TEXT,
    "invoiceId" TEXT,
    "studentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMsgId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TEXT NOT NULL,
    "sentAt" TEXT,
    "deliveredAt" TEXT,

    CONSTRAINT "zalo_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zalo_message_logs_position_idx" ON "zalo_message_logs"("position");

-- CreateIndex
CREATE INDEX "zalo_message_logs_studentId_idx" ON "zalo_message_logs"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_message_logs_kind_receivableId_invoiceId_key" ON "zalo_message_logs"("kind", "receivableId", "invoiceId");
