-- CreateEnum
CREATE TYPE "AdmissionStage" AS ENUM ('RECEIVED', 'INFO_COMPLETE', 'ASSESSMENT_PENDING', 'PLACEMENT_READY', 'TUITION_CONSULTED', 'WAITING_PAYMENT', 'ONBOARDING', 'ENROLLED', 'ON_HOLD', 'LOST');

-- CreateEnum
CREATE TYPE "AdmissionPaymentStatus" AS ENUM ('UNPAID', 'DEPOSIT', 'PARTIAL', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RecruitmentTaskKind" AS ENUM ('COMPLETE_PROFILE', 'ASSESSMENT', 'TUITION_CONSULTATION', 'PAYMENT_FOLLOW_UP', 'ONBOARDING', 'CONVERT_STUDENT');

-- CreateEnum
CREATE TYPE "RecruitmentTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "recruitment_cases" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthYear" INTEGER,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "schoolGrade" TEXT,
    "schoolName" TEXT,
    "learningHistory" TEXT,
    "consultationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consultantId" TEXT,
    "branchId" TEXT,
    "stage" "AdmissionStage" NOT NULL DEFAULT 'RECEIVED',
    "assessment" TEXT,
    "placementClassId" TEXT,
    "proposedSchedule" TEXT,
    "registrationPackage" TEXT,
    "tuitionAmount" DECIMAL(12,2),
    "textbookAmount" DECIMAL(12,2),
    "discountAmount" DECIMAL(12,2),
    "discountReason" TEXT,
    "quotedTotal" DECIMAL(12,2),
    "paymentStatus" "AdmissionPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tuitionNote" TEXT,
    "expectedStartDate" TIMESTAMP(3),
    "textbookIssuedAt" TIMESTAMP(3),
    "photoReceivedAt" TIMESTAMP(3),
    "zaloAddedAt" TIMESTAMP(3),
    "attendanceListAddedAt" TIMESTAMP(3),
    "consultantConfirmedAt" TIMESTAMP(3),
    "convertedStudentId" TEXT,
    "lostReason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruitment_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_tasks" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "RecruitmentTaskKind" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RecruitmentTaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruitment_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_activities" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruitment_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_cases_code_key" ON "recruitment_cases"("code");

-- CreateIndex
CREATE INDEX "recruitment_cases_stage_updatedAt_idx" ON "recruitment_cases"("stage", "updatedAt");

-- CreateIndex
CREATE INDEX "recruitment_cases_consultantId_stage_idx" ON "recruitment_cases"("consultantId", "stage");

-- CreateIndex
CREATE INDEX "recruitment_cases_normalizedPhone_idx" ON "recruitment_cases"("normalizedPhone");

-- CreateIndex
CREATE INDEX "recruitment_cases_placementClassId_idx" ON "recruitment_cases"("placementClassId");

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_cases_source_sourceKey_key" ON "recruitment_cases"("source", "sourceKey");

-- CreateIndex
CREATE INDEX "recruitment_tasks_assigneeId_status_dueAt_idx" ON "recruitment_tasks"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "recruitment_tasks_caseId_status_idx" ON "recruitment_tasks"("caseId", "status");

-- CreateIndex
CREATE INDEX "recruitment_activities_caseId_createdAt_idx" ON "recruitment_activities"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "recruitment_cases" ADD CONSTRAINT "recruitment_cases_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_cases" ADD CONSTRAINT "recruitment_cases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_cases" ADD CONSTRAINT "recruitment_cases_placementClassId_fkey" FOREIGN KEY ("placementClassId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_cases" ADD CONSTRAINT "recruitment_cases_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_tasks" ADD CONSTRAINT "recruitment_tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "recruitment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_tasks" ADD CONSTRAINT "recruitment_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_tasks" ADD CONSTRAINT "recruitment_tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_activities" ADD CONSTRAINT "recruitment_activities_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "recruitment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_activities" ADD CONSTRAINT "recruitment_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
