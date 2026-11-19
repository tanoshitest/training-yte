-- CreateEnum
CREATE TYPE "FinanceReceivableStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERPAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FinancePaymentOrderStatus" AS ENUM ('ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceBankTxStatus" AS ENUM ('RECEIVED', 'MATCHED', 'UNMATCHED', 'ALLOCATED', 'DUPLICATE', 'IGNORED', 'REVERSED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "FinancePaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'PARTIAL', 'OVERPAID', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "FinanceInvoiceStatus" AS ENUM ('PENDING', 'PROCESSING', 'ISSUED', 'FAILED', 'CANCELLED', 'ADJUSTED', 'REPLACED');

-- AlterTable
ALTER TABLE "legacy_attendances" RENAME CONSTRAINT "attendances_pkey" TO "legacy_attendances_pkey";

-- AlterTable
ALTER TABLE "legacy_audit_logs" RENAME CONSTRAINT "audit_logs_pkey" TO "legacy_audit_logs_pkey";

-- AlterTable
ALTER TABLE "legacy_branches" RENAME CONSTRAINT "branches_pkey" TO "legacy_branches_pkey";

-- AlterTable
ALTER TABLE "legacy_centers" RENAME CONSTRAINT "centers_pkey" TO "legacy_centers_pkey";

-- AlterTable
ALTER TABLE "legacy_class_schedules" RENAME CONSTRAINT "class_schedules_pkey" TO "legacy_class_schedules_pkey";

-- AlterTable
ALTER TABLE "legacy_class_syllabuses" RENAME CONSTRAINT "class_syllabuses_pkey" TO "legacy_class_syllabuses_pkey";

-- AlterTable
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_pkey" TO "legacy_classes_pkey";

-- AlterTable
ALTER TABLE "legacy_course_days" RENAME CONSTRAINT "course_days_pkey" TO "legacy_course_days_pkey";

-- AlterTable
ALTER TABLE "legacy_curriculum_sections" RENAME CONSTRAINT "curriculum_sections_pkey" TO "legacy_curriculum_sections_pkey";

-- AlterTable
ALTER TABLE "legacy_enrollments" RENAME CONSTRAINT "enrollments_pkey" TO "legacy_enrollments_pkey";

-- AlterTable
ALTER TABLE "legacy_general_tasks" RENAME CONSTRAINT "general_tasks_pkey" TO "legacy_general_tasks_pkey";

-- AlterTable
ALTER TABLE "legacy_ielts_courses" RENAME CONSTRAINT "ielts_courses_pkey" TO "legacy_ielts_courses_pkey";

-- AlterTable
ALTER TABLE "legacy_lesson_exercises" RENAME CONSTRAINT "lesson_exercises_pkey" TO "legacy_lesson_exercises_pkey";

-- AlterTable
ALTER TABLE "legacy_lesson_periods" RENAME CONSTRAINT "lesson_periods_pkey" TO "legacy_lesson_periods_pkey";

-- AlterTable
ALTER TABLE "legacy_lesson_reports" RENAME CONSTRAINT "lesson_reports_pkey" TO "legacy_lesson_reports_pkey";

-- AlterTable
ALTER TABLE "legacy_lesson_resources" RENAME CONSTRAINT "lesson_resources_pkey" TO "legacy_lesson_resources_pkey";

-- AlterTable
ALTER TABLE "legacy_lesson_sessions" RENAME CONSTRAINT "lesson_sessions_pkey" TO "legacy_lesson_sessions_pkey";

-- AlterTable
ALTER TABLE "legacy_levels" RENAME CONSTRAINT "levels_pkey" TO "legacy_levels_pkey";

-- AlterTable
ALTER TABLE "legacy_normal_packages" RENAME CONSTRAINT "normal_packages_pkey" TO "legacy_normal_packages_pkey";

-- AlterTable
ALTER TABLE "legacy_recruitment_activities" RENAME CONSTRAINT "recruitment_activities_pkey" TO "legacy_recruitment_activities_pkey";

-- AlterTable
ALTER TABLE "legacy_recruitment_cases" RENAME CONSTRAINT "recruitment_cases_pkey" TO "legacy_recruitment_cases_pkey";

-- AlterTable
ALTER TABLE "legacy_recruitment_tasks" RENAME CONSTRAINT "recruitment_tasks_pkey" TO "legacy_recruitment_tasks_pkey";

-- AlterTable
ALTER TABLE "legacy_rooms" RENAME CONSTRAINT "rooms_pkey" TO "legacy_rooms_pkey";

-- AlterTable
ALTER TABLE "legacy_student_advances" RENAME CONSTRAINT "student_advances_pkey" TO "legacy_student_advances_pkey";

-- AlterTable
ALTER TABLE "legacy_student_tuitions" RENAME CONSTRAINT "student_tuitions_pkey" TO "legacy_student_tuitions_pkey";

-- AlterTable
ALTER TABLE "legacy_students" RENAME CONSTRAINT "students_pkey" TO "legacy_students_pkey";

-- AlterTable
ALTER TABLE "legacy_sub_levels" RENAME CONSTRAINT "sub_levels_pkey" TO "legacy_sub_levels_pkey";

-- AlterTable
ALTER TABLE "legacy_syllabus_lessons" RENAME CONSTRAINT "syllabus_lessons_pkey" TO "legacy_syllabus_lessons_pkey";

-- AlterTable
ALTER TABLE "legacy_syllabus_stages" RENAME CONSTRAINT "syllabus_stages_pkey" TO "legacy_syllabus_stages_pkey";

-- AlterTable
ALTER TABLE "legacy_syllabuses" RENAME CONSTRAINT "syllabuses_pkey" TO "legacy_syllabuses_pkey";

-- AlterTable
ALTER TABLE "legacy_teachers" RENAME CONSTRAINT "teachers_pkey" TO "legacy_teachers_pkey";

-- AlterTable
ALTER TABLE "legacy_tuition_entries" RENAME CONSTRAINT "tuition_entries_pkey" TO "legacy_tuition_entries_pkey";

-- AlterTable
ALTER TABLE "legacy_tuition_payments" RENAME CONSTRAINT "tuition_payments_pkey" TO "legacy_tuition_payments_pkey";

-- AlterTable
ALTER TABLE "legacy_tuition_reminders" RENAME CONSTRAINT "tuition_reminders_pkey" TO "legacy_tuition_reminders_pkey";

-- AlterTable
ALTER TABLE "legacy_users" RENAME CONSTRAINT "users_pkey" TO "legacy_users_pkey";

-- AlterTable
ALTER TABLE "vps_app_state" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "legacy_finance_receivables" (
    "id" TEXT NOT NULL,
    "receivableCode" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tuitionId" TEXT,
    "billingPeriod" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" "FinanceReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legacy_finance_receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_payment_orders" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "bankAccountId" TEXT,
    "qrPayload" TEXT,
    "qrUrl" TEXT,
    "expiredAt" TIMESTAMP(3),
    "status" "FinancePaymentOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_finance_payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_bank_transactions" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "gateway" TEXT,
    "accountNumber" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "transferType" TEXT NOT NULL,
    "transferAmount" DECIMAL(12,2) NOT NULL,
    "content" TEXT NOT NULL,
    "referenceCode" TEXT,
    "rawPayload" JSONB,
    "status" "FinanceBankTxStatus" NOT NULL DEFAULT 'RECEIVED',
    "reviewReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_finance_bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_ledger_payments" (
    "id" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FinancePaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_finance_ledger_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_finance_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',

    CONSTRAINT "legacy_finance_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_electronic_invoices" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerInvoiceId" TEXT,
    "invoiceNumber" TEXT,
    "invoiceSeries" TEXT,
    "invoiceTemplate" TEXT,
    "taxAuthorityCode" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerTaxCode" TEXT,
    "buyerAddress" TEXT,
    "buyerEmail" TEXT,
    "lookupCode" TEXT,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "issuedAt" TIMESTAMP(3),
    "status" "FinanceInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legacy_finance_electronic_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_webhook_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requestId" TEXT,
    "headers" JSONB,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "responseCode" INTEGER NOT NULL,
    "processingStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_finance_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_finance_student_credits" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourcePaymentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remainingAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_finance_student_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_blocks" (
    "key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_blocks_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "parentZalo" TEXT NOT NULL,
    "parentPhone1" TEXT NOT NULL,
    "parentPhone2" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "loginEmail" TEXT NOT NULL,
    "loginPassword" TEXT NOT NULL,
    "tuitionExempt" BOOLEAN NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_session_balances" (
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,

    CONSTRAINT "student_session_balances_pkey" PRIMARY KEY ("studentId","classId")
);

-- CreateTable
CREATE TABLE "student_tuition_credits" (
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,

    CONSTRAINT "student_tuition_credits_pkey" PRIMARY KEY ("studentId","classId")
);

-- CreateTable
CREATE TABLE "student_tuition_paid_through" (
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "month" TEXT NOT NULL,

    CONSTRAINT "student_tuition_paid_through_pkey" PRIMARY KEY ("studentId","classId")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assigned_classes" (
    "teacherId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "className" TEXT NOT NULL,

    CONSTRAINT "teacher_assigned_classes_pkey" PRIMARY KEY ("teacherId","className")
);

-- CreateTable
CREATE TABLE "accountants" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "accountants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistants" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "assistants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "center_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "center_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_types" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "class_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tuition_packages" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "classTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,

    CONSTRAINT "tuition_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_periods" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "lesson_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classTypeId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "syllabusId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "tuitionPackageId" TEXT NOT NULL,
    "billingMode" TEXT NOT NULL,
    "sessionPrice" DECIMAL(15,0) NOT NULL,
    "courseSessions" INTEGER NOT NULL,
    "courseStartDate" TEXT,
    "billingEnabled" BOOLEAN NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_students" (
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "class_students_pkey" PRIMARY KEY ("classId","studentId")
);

-- CreateTable
CREATE TABLE "class_schedules" (
    "classId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "periodId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "effectiveFrom" TEXT,
    "effectiveTo" TEXT,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("classId","position")
);

-- CreateTable
CREATE TABLE "class_material_fees" (
    "classId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "class_material_fees_pkey" PRIMARY KEY ("classId","periodKey")
);

-- CreateTable
CREATE TABLE "lesson_sessions" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isExtra" BOOLEAN NOT NULL,
    "recurrenceKey" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "isOff" BOOLEAN NOT NULL,
    "offSource" TEXT,
    "hasHomework" BOOLEAN NOT NULL,

    CONSTRAINT "lesson_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_assessment_columns" (
    "sessionId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "session_assessment_columns_pkey" PRIMARY KEY ("sessionId","columnId")
);

-- CreateTable
CREATE TABLE "session_attendance_columns" (
    "sessionId" TEXT NOT NULL,
    "columnKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "session_attendance_columns_pkey" PRIMARY KEY ("sessionId","columnKey")
);

-- CreateTable
CREATE TABLE "attendances" (
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT,
    "firstStatus" TEXT,
    "late" BOOLEAN NOT NULL,
    "lessonRating" TEXT,
    "homeworkRating" TEXT,
    "pronunciationVideoDone" BOOLEAN NOT NULL,
    "worksheetDone" BOOLEAN NOT NULL,
    "vocabularyScore" TEXT,
    "note" TEXT NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("sessionId","studentId")
);

-- CreateTable
CREATE TABLE "attendance_scores" (
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "attendance_scores_pkey" PRIMARY KEY ("sessionId","studentId","columnId")
);

-- CreateTable
CREATE TABLE "periodic_reports" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "listening" DOUBLE PRECISION,
    "speaking" DOUBLE PRECISION,
    "reading" DOUBLE PRECISION,
    "writing" DOUBLE PRECISION,
    "comment" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "periodic_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tuition_debts" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "totalAmount" DECIMAL(15,0) NOT NULL,
    "paidAmount" DECIMAL(15,0) NOT NULL,
    "remainingSessions" INTEGER NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "tuition_debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_entries" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "method" TEXT NOT NULL,
    "branchId" TEXT,
    "studentName" TEXT,
    "tuitionId" TEXT,
    "receiptId" TEXT,

    CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recon_days" (
    "date" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "tuitionIn" DECIMAL(15,0) NOT NULL,
    "manualIn" DECIMAL(15,0) NOT NULL,
    "manualOut" DECIMAL(15,0) NOT NULL,
    "net" DECIMAL(15,0) NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "recon_days_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "recon_entries" (
    "entryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "date" TEXT NOT NULL,
    "approvedAt" TEXT,
    "approvedBy" TEXT,

    CONSTRAINT "recon_entries_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "payroll_rows" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherCode" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "baseSalary" DECIMAL(15,0) NOT NULL,
    "commission" DECIMAL(15,0) NOT NULL,
    "tax" DECIMAL(15,0) NOT NULL,
    "net" DECIMAL(15,0) NOT NULL,

    CONSTRAINT "payroll_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_forecasts" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    "settledAt" TEXT,

    CONSTRAINT "finance_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashbook_skipped_receipts" (
    "receiptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "cashbook_skipped_receipts_pkey" PRIMARY KEY ("receiptId")
);

-- CreateTable
CREATE TABLE "sepay_settings" (
    "id" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "qrImageDataUrl" TEXT,
    "autoMatchExact" BOOLEAN NOT NULL,
    "autoPartial" BOOLEAN NOT NULL,
    "autoOverpayment" BOOLEAN NOT NULL,
    "autoInvoiceExact" BOOLEAN NOT NULL,
    "autoInvoicePartial" BOOLEAN NOT NULL,
    "autoInvoiceOverpayment" BOOLEAN NOT NULL,

    CONSTRAINT "sepay_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_receivables" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "receivableCode" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "amountDue" DECIMAL(15,0) NOT NULL,
    "amountPaid" DECIMAL(15,0) NOT NULL,
    "balanceDue" DECIMAL(15,0) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentOrderId" TEXT NOT NULL,
    "classId" TEXT,
    "billKey" TEXT,

    CONSTRAINT "sepay_receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_payment_orders" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "receivableId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "qrUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "sepay_payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_bank_transactions" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "transferType" TEXT NOT NULL,
    "transferAmount" DECIMAL(15,0) NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reviewReason" TEXT,
    "receivedAt" TEXT NOT NULL,
    "processedAt" TEXT,

    CONSTRAINT "sepay_bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_payments" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "allocatedAmount" DECIMAL(15,0) NOT NULL,
    "excessAmount" DECIMAL(15,0) NOT NULL,
    "status" TEXT NOT NULL,
    "paidAt" TEXT NOT NULL,
    "method" TEXT,
    "note" TEXT,

    CONSTRAINT "sepay_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_receipts" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "issuedAt" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "classId" TEXT,
    "className" TEXT,
    "billingPeriod" TEXT,
    "billingMode" TEXT,
    "studentName" TEXT,
    "studentCode" TEXT,
    "creditSessionsUsed" INTEGER,
    "materialsAmount" DECIMAL(15,0),
    "paidThroughBefore" TEXT,

    CONSTRAINT "sepay_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_invoices" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceSeries" TEXT,
    "amount" DECIMAL(15,0) NOT NULL,
    "buyerName" TEXT NOT NULL,
    "lookupCode" TEXT,
    "status" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "lastError" TEXT,
    "createdAt" TEXT NOT NULL,
    "issuedAt" TEXT,

    CONSTRAINT "sepay_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_credits" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourcePaymentId" TEXT NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "remainingAmount" DECIMAL(15,0) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "sepay_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sepay_webhook_logs" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processingStatus" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "sepay_webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legacy_finance_receivables_receivableCode_key" ON "legacy_finance_receivables"("receivableCode");

-- CreateIndex
CREATE INDEX "legacy_finance_receivables_studentId_status_idx" ON "legacy_finance_receivables"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_finance_payment_orders_paymentCode_key" ON "legacy_finance_payment_orders"("paymentCode");

-- CreateIndex
CREATE INDEX "legacy_finance_payment_orders_studentId_idx" ON "legacy_finance_payment_orders"("studentId");

-- CreateIndex
CREATE INDEX "legacy_finance_bank_transactions_status_receivedAt_idx" ON "legacy_finance_bank_transactions"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_finance_bank_transactions_provider_providerTransacti_key" ON "legacy_finance_bank_transactions"("provider", "providerTransactionId");

-- CreateIndex
CREATE INDEX "legacy_finance_ledger_payments_studentId_paidAt_idx" ON "legacy_finance_ledger_payments"("studentId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_finance_receipts_receiptNumber_key" ON "legacy_finance_receipts"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_finance_receipts_paymentId_key" ON "legacy_finance_receipts"("paymentId");

-- CreateIndex
CREATE INDEX "legacy_finance_electronic_invoices_status_createdAt_idx" ON "legacy_finance_electronic_invoices"("status", "createdAt");

-- CreateIndex
CREATE INDEX "legacy_finance_webhook_logs_createdAt_idx" ON "legacy_finance_webhook_logs"("createdAt");

-- CreateIndex
CREATE INDEX "legacy_finance_student_credits_studentId_status_idx" ON "legacy_finance_student_credits"("studentId", "status");

-- CreateIndex
CREATE INDEX "students_position_idx" ON "students"("position");

-- CreateIndex
CREATE INDEX "students_code_idx" ON "students"("code");

-- CreateIndex
CREATE INDEX "teachers_position_idx" ON "teachers"("position");

-- CreateIndex
CREATE INDEX "accountants_position_idx" ON "accountants"("position");

-- CreateIndex
CREATE INDEX "assistants_position_idx" ON "assistants"("position");

-- CreateIndex
CREATE INDEX "branches_position_idx" ON "branches"("position");

-- CreateIndex
CREATE INDEX "class_types_position_idx" ON "class_types"("position");

-- CreateIndex
CREATE INDEX "tuition_packages_position_idx" ON "tuition_packages"("position");

-- CreateIndex
CREATE INDEX "lesson_periods_position_idx" ON "lesson_periods"("position");

-- CreateIndex
CREATE INDEX "rooms_position_idx" ON "rooms"("position");

-- CreateIndex
CREATE INDEX "classes_position_idx" ON "classes"("position");

-- CreateIndex
CREATE INDEX "classes_code_idx" ON "classes"("code");

-- CreateIndex
CREATE INDEX "class_students_studentId_idx" ON "class_students"("studentId");

-- CreateIndex
CREATE INDEX "lesson_sessions_position_idx" ON "lesson_sessions"("position");

-- CreateIndex
CREATE INDEX "lesson_sessions_classId_date_idx" ON "lesson_sessions"("classId", "date");

-- CreateIndex
CREATE INDEX "attendances_studentId_idx" ON "attendances"("studentId");

-- CreateIndex
CREATE INDEX "periodic_reports_position_idx" ON "periodic_reports"("position");

-- CreateIndex
CREATE INDEX "periodic_reports_classId_studentId_idx" ON "periodic_reports"("classId", "studentId");

-- CreateIndex
CREATE INDEX "audit_logs_position_idx" ON "audit_logs"("position");

-- CreateIndex
CREATE INDEX "tuition_debts_position_idx" ON "tuition_debts"("position");

-- CreateIndex
CREATE INDEX "cash_entries_position_idx" ON "cash_entries"("position");

-- CreateIndex
CREATE INDEX "cash_entries_date_idx" ON "cash_entries"("date");

-- CreateIndex
CREATE INDEX "recon_days_position_idx" ON "recon_days"("position");

-- CreateIndex
CREATE INDEX "recon_entries_position_idx" ON "recon_entries"("position");

-- CreateIndex
CREATE INDEX "payroll_rows_position_idx" ON "payroll_rows"("position");

-- CreateIndex
CREATE INDEX "finance_forecasts_position_idx" ON "finance_forecasts"("position");

-- CreateIndex
CREATE INDEX "cashbook_skipped_receipts_position_idx" ON "cashbook_skipped_receipts"("position");

-- CreateIndex
CREATE INDEX "sepay_receivables_position_idx" ON "sepay_receivables"("position");

-- CreateIndex
CREATE INDEX "sepay_receivables_studentId_idx" ON "sepay_receivables"("studentId");

-- CreateIndex
CREATE INDEX "sepay_payment_orders_position_idx" ON "sepay_payment_orders"("position");

-- CreateIndex
CREATE INDEX "sepay_payment_orders_paymentCode_idx" ON "sepay_payment_orders"("paymentCode");

-- CreateIndex
CREATE INDEX "sepay_bank_transactions_position_idx" ON "sepay_bank_transactions"("position");

-- CreateIndex
CREATE INDEX "sepay_payments_position_idx" ON "sepay_payments"("position");

-- CreateIndex
CREATE INDEX "sepay_payments_receivableId_idx" ON "sepay_payments"("receivableId");

-- CreateIndex
CREATE INDEX "sepay_receipts_position_idx" ON "sepay_receipts"("position");

-- CreateIndex
CREATE INDEX "sepay_receipts_paymentId_idx" ON "sepay_receipts"("paymentId");

-- CreateIndex
CREATE INDEX "sepay_invoices_position_idx" ON "sepay_invoices"("position");

-- CreateIndex
CREATE INDEX "sepay_credits_position_idx" ON "sepay_credits"("position");

-- CreateIndex
CREATE INDEX "sepay_webhook_logs_position_idx" ON "sepay_webhook_logs"("position");

-- RenameForeignKey
ALTER TABLE "legacy_attendances" RENAME CONSTRAINT "attendances_sessionId_fkey" TO "legacy_attendances_sessionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_attendances" RENAME CONSTRAINT "attendances_studentId_fkey" TO "legacy_attendances_studentId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_audit_logs" RENAME CONSTRAINT "audit_logs_rolledBackById_fkey" TO "legacy_audit_logs_rolledBackById_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_audit_logs" RENAME CONSTRAINT "audit_logs_userId_fkey" TO "legacy_audit_logs_userId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_class_schedules" RENAME CONSTRAINT "class_schedules_classId_fkey" TO "legacy_class_schedules_classId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_class_schedules" RENAME CONSTRAINT "class_schedules_periodId_fkey" TO "legacy_class_schedules_periodId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_class_syllabuses" RENAME CONSTRAINT "class_syllabuses_classId_fkey" TO "legacy_class_syllabuses_classId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_class_syllabuses" RENAME CONSTRAINT "class_syllabuses_syllabusId_fkey" TO "legacy_class_syllabuses_syllabusId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_branchId_fkey" TO "legacy_classes_branchId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_ieltsCourseId_fkey" TO "legacy_classes_ieltsCourseId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_levelId_fkey" TO "legacy_classes_levelId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_packageId_fkey" TO "legacy_classes_packageId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_roomId_fkey" TO "legacy_classes_roomId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_subLevelId_fkey" TO "legacy_classes_subLevelId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_classes" RENAME CONSTRAINT "classes_teacherId_fkey" TO "legacy_classes_teacherId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_course_days" RENAME CONSTRAINT "course_days_sectionId_fkey" TO "legacy_course_days_sectionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_course_days" RENAME CONSTRAINT "course_days_syllabusId_fkey" TO "legacy_course_days_syllabusId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_course_days" RENAME CONSTRAINT "course_days_unitId_fkey" TO "legacy_course_days_unitId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_curriculum_sections" RENAME CONSTRAINT "curriculum_sections_syllabusId_fkey" TO "legacy_curriculum_sections_syllabusId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_enrollments" RENAME CONSTRAINT "enrollments_classId_fkey" TO "legacy_enrollments_classId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_enrollments" RENAME CONSTRAINT "enrollments_studentId_fkey" TO "legacy_enrollments_studentId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_general_tasks" RENAME CONSTRAINT "general_tasks_assigneeId_fkey" TO "legacy_general_tasks_assigneeId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_general_tasks" RENAME CONSTRAINT "general_tasks_completedById_fkey" TO "legacy_general_tasks_completedById_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_general_tasks" RENAME CONSTRAINT "general_tasks_creatorId_fkey" TO "legacy_general_tasks_creatorId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_exercises" RENAME CONSTRAINT "lesson_exercises_lessonId_fkey" TO "legacy_lesson_exercises_lessonId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_reports" RENAME CONSTRAINT "lesson_reports_sessionId_fkey" TO "legacy_lesson_reports_sessionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_resources" RENAME CONSTRAINT "lesson_resources_courseDayId_fkey" TO "legacy_lesson_resources_courseDayId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_resources" RENAME CONSTRAINT "lesson_resources_lessonId_fkey" TO "legacy_lesson_resources_lessonId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_resources" RENAME CONSTRAINT "lesson_resources_sectionId_fkey" TO "legacy_lesson_resources_sectionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_resources" RENAME CONSTRAINT "lesson_resources_syllabusId_fkey" TO "legacy_lesson_resources_syllabusId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_resources" RENAME CONSTRAINT "lesson_resources_unitId_fkey" TO "legacy_lesson_resources_unitId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_sessions" RENAME CONSTRAINT "lesson_sessions_academicStaffId_fkey" TO "legacy_lesson_sessions_academicStaffId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_sessions" RENAME CONSTRAINT "lesson_sessions_classId_fkey" TO "legacy_lesson_sessions_classId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_sessions" RENAME CONSTRAINT "lesson_sessions_makeupForId_fkey" TO "legacy_lesson_sessions_makeupForId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_sessions" RENAME CONSTRAINT "lesson_sessions_roomId_fkey" TO "legacy_lesson_sessions_roomId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_sessions" RENAME CONSTRAINT "lesson_sessions_syllabusLessonId_fkey" TO "legacy_lesson_sessions_syllabusLessonId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_lesson_sessions" RENAME CONSTRAINT "lesson_sessions_teacherId_fkey" TO "legacy_lesson_sessions_teacherId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_normal_packages" RENAME CONSTRAINT "normal_packages_levelId_fkey" TO "legacy_normal_packages_levelId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_normal_packages" RENAME CONSTRAINT "normal_packages_subLevelId_fkey" TO "legacy_normal_packages_subLevelId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_activities" RENAME CONSTRAINT "recruitment_activities_caseId_fkey" TO "legacy_recruitment_activities_caseId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_activities" RENAME CONSTRAINT "recruitment_activities_userId_fkey" TO "legacy_recruitment_activities_userId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_cases" RENAME CONSTRAINT "recruitment_cases_branchId_fkey" TO "legacy_recruitment_cases_branchId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_cases" RENAME CONSTRAINT "recruitment_cases_consultantId_fkey" TO "legacy_recruitment_cases_consultantId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_cases" RENAME CONSTRAINT "recruitment_cases_convertedStudentId_fkey" TO "legacy_recruitment_cases_convertedStudentId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_cases" RENAME CONSTRAINT "recruitment_cases_placementClassId_fkey" TO "legacy_recruitment_cases_placementClassId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_tasks" RENAME CONSTRAINT "recruitment_tasks_assigneeId_fkey" TO "legacy_recruitment_tasks_assigneeId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_tasks" RENAME CONSTRAINT "recruitment_tasks_caseId_fkey" TO "legacy_recruitment_tasks_caseId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_recruitment_tasks" RENAME CONSTRAINT "recruitment_tasks_completedById_fkey" TO "legacy_recruitment_tasks_completedById_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_rooms" RENAME CONSTRAINT "rooms_branchId_fkey" TO "legacy_rooms_branchId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_student_advances" RENAME CONSTRAINT "student_advances_studentId_fkey" TO "legacy_student_advances_studentId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_student_tuitions" RENAME CONSTRAINT "student_tuitions_enrollmentId_fkey" TO "legacy_student_tuitions_enrollmentId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_student_tuitions" RENAME CONSTRAINT "student_tuitions_ieltsCourseId_fkey" TO "legacy_student_tuitions_ieltsCourseId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_student_tuitions" RENAME CONSTRAINT "student_tuitions_packageId_fkey" TO "legacy_student_tuitions_packageId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_student_tuitions" RENAME CONSTRAINT "student_tuitions_studentId_fkey" TO "legacy_student_tuitions_studentId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_students" RENAME CONSTRAINT "students_userId_fkey" TO "legacy_students_userId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_sub_levels" RENAME CONSTRAINT "sub_levels_levelId_fkey" TO "legacy_sub_levels_levelId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_syllabus_lessons" RENAME CONSTRAINT "syllabus_lessons_courseDayId_fkey" TO "legacy_syllabus_lessons_courseDayId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_syllabus_lessons" RENAME CONSTRAINT "syllabus_lessons_stageId_fkey" TO "legacy_syllabus_lessons_stageId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_syllabus_stages" RENAME CONSTRAINT "syllabus_stages_sectionId_fkey" TO "legacy_syllabus_stages_sectionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_syllabus_stages" RENAME CONSTRAINT "syllabus_stages_syllabusId_fkey" TO "legacy_syllabus_stages_syllabusId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_syllabuses" RENAME CONSTRAINT "syllabuses_levelId_fkey" TO "legacy_syllabuses_levelId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_teachers" RENAME CONSTRAINT "teachers_userId_fkey" TO "legacy_teachers_userId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_tuition_entries" RENAME CONSTRAINT "tuition_entries_sessionId_fkey" TO "legacy_tuition_entries_sessionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_tuition_entries" RENAME CONSTRAINT "tuition_entries_tuitionId_fkey" TO "legacy_tuition_entries_tuitionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_tuition_payments" RENAME CONSTRAINT "tuition_payments_tuitionId_fkey" TO "legacy_tuition_payments_tuitionId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_tuition_reminders" RENAME CONSTRAINT "tuition_reminders_enrollmentId_fkey" TO "legacy_tuition_reminders_enrollmentId_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_tuition_reminders" RENAME CONSTRAINT "tuition_reminders_remindedById_fkey" TO "legacy_tuition_reminders_remindedById_fkey";

-- RenameForeignKey
ALTER TABLE "legacy_tuition_reminders" RENAME CONSTRAINT "tuition_reminders_studentId_fkey" TO "legacy_tuition_reminders_studentId_fkey";

-- AddForeignKey
ALTER TABLE "legacy_finance_payment_orders" ADD CONSTRAINT "legacy_finance_payment_orders_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "legacy_finance_receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_finance_ledger_payments" ADD CONSTRAINT "legacy_finance_ledger_payments_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "legacy_finance_bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_finance_payment_allocations" ADD CONSTRAINT "legacy_finance_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "legacy_finance_ledger_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_finance_payment_allocations" ADD CONSTRAINT "legacy_finance_payment_allocations_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "legacy_finance_receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_finance_receipts" ADD CONSTRAINT "legacy_finance_receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "legacy_finance_ledger_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_finance_electronic_invoices" ADD CONSTRAINT "legacy_finance_electronic_invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "legacy_finance_ledger_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_finance_electronic_invoices" ADD CONSTRAINT "legacy_finance_electronic_invoices_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "legacy_finance_receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_session_balances" ADD CONSTRAINT "student_session_balances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_tuition_credits" ADD CONSTRAINT "student_tuition_credits_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_tuition_paid_through" ADD CONSTRAINT "student_tuition_paid_through_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assigned_classes" ADD CONSTRAINT "teacher_assigned_classes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_material_fees" ADD CONSTRAINT "class_material_fees_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_assessment_columns" ADD CONSTRAINT "session_assessment_columns_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lesson_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attendance_columns" ADD CONSTRAINT "session_attendance_columns_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lesson_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lesson_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_scores" ADD CONSTRAINT "attendance_scores_sessionId_studentId_fkey" FOREIGN KEY ("sessionId", "studentId") REFERENCES "attendances"("sessionId", "studentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "attendances_sessionId_studentId_key" RENAME TO "legacy_attendances_sessionId_studentId_key";

-- RenameIndex
ALTER INDEX "audit_logs_createdAt_idx" RENAME TO "legacy_audit_logs_createdAt_idx";

-- RenameIndex
ALTER INDEX "audit_logs_entity_entityId_idx" RENAME TO "legacy_audit_logs_entity_entityId_idx";

-- RenameIndex
ALTER INDEX "audit_logs_userId_createdAt_idx" RENAME TO "legacy_audit_logs_userId_createdAt_idx";

-- RenameIndex
ALTER INDEX "branches_name_key" RENAME TO "legacy_branches_name_key";

-- RenameIndex
ALTER INDEX "class_schedules_classId_weekday_startTime_key" RENAME TO "legacy_class_schedules_classId_weekday_startTime_key";

-- RenameIndex
ALTER INDEX "class_syllabuses_classId_order_idx" RENAME TO "legacy_class_syllabuses_classId_order_idx";

-- RenameIndex
ALTER INDEX "class_syllabuses_classId_syllabusId_key" RENAME TO "legacy_class_syllabuses_classId_syllabusId_key";

-- RenameIndex
ALTER INDEX "classes_branchId_idx" RENAME TO "legacy_classes_branchId_idx";

-- RenameIndex
ALTER INDEX "classes_code_key" RENAME TO "legacy_classes_code_key";

-- RenameIndex
ALTER INDEX "classes_status_idx" RENAME TO "legacy_classes_status_idx";

-- RenameIndex
ALTER INDEX "classes_teacherId_idx" RENAME TO "legacy_classes_teacherId_idx";

-- RenameIndex
ALTER INDEX "classes_type_idx" RENAME TO "legacy_classes_type_idx";

-- RenameIndex
ALTER INDEX "course_days_sectionId_sortOrder_idx" RENAME TO "legacy_course_days_sectionId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "course_days_syllabusId_courseDayNumber_key" RENAME TO "legacy_course_days_syllabusId_courseDayNumber_key";

-- RenameIndex
ALTER INDEX "course_days_syllabusId_sortOrder_key" RENAME TO "legacy_course_days_syllabusId_sortOrder_key";

-- RenameIndex
ALTER INDEX "course_days_unitId_unitDayNumber_idx" RENAME TO "legacy_course_days_unitId_unitDayNumber_idx";

-- RenameIndex
ALTER INDEX "curriculum_sections_syllabusId_sortOrder_key" RENAME TO "legacy_curriculum_sections_syllabusId_sortOrder_key";

-- RenameIndex
ALTER INDEX "curriculum_sections_syllabusId_type_idx" RENAME TO "legacy_curriculum_sections_syllabusId_type_idx";

-- RenameIndex
ALTER INDEX "enrollments_classId_status_idx" RENAME TO "legacy_enrollments_classId_status_idx";

-- RenameIndex
ALTER INDEX "enrollments_studentId_classId_key" RENAME TO "legacy_enrollments_studentId_classId_key";

-- RenameIndex
ALTER INDEX "general_tasks_assigneeId_status_idx" RENAME TO "legacy_general_tasks_assigneeId_status_idx";

-- RenameIndex
ALTER INDEX "general_tasks_creatorId_idx" RENAME TO "legacy_general_tasks_creatorId_idx";

-- RenameIndex
ALTER INDEX "ielts_courses_name_key" RENAME TO "legacy_ielts_courses_name_key";

-- RenameIndex
ALTER INDEX "lesson_exercises_lessonId_sortOrder_idx" RENAME TO "legacy_lesson_exercises_lessonId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "lesson_periods_name_key" RENAME TO "legacy_lesson_periods_name_key";

-- RenameIndex
ALTER INDEX "lesson_reports_sessionId_key" RENAME TO "legacy_lesson_reports_sessionId_key";

-- RenameIndex
ALTER INDEX "lesson_resources_courseDayId_sortOrder_idx" RENAME TO "legacy_lesson_resources_courseDayId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "lesson_resources_lessonId_url_key" RENAME TO "legacy_lesson_resources_lessonId_url_key";

-- RenameIndex
ALTER INDEX "lesson_resources_sectionId_sortOrder_idx" RENAME TO "legacy_lesson_resources_sectionId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "lesson_resources_syllabusId_sortOrder_idx" RENAME TO "legacy_lesson_resources_syllabusId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "lesson_resources_unitId_sortOrder_idx" RENAME TO "legacy_lesson_resources_unitId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "lesson_sessions_academicStaffId_date_idx" RENAME TO "legacy_lesson_sessions_academicStaffId_date_idx";

-- RenameIndex
ALTER INDEX "lesson_sessions_classId_sequence_key" RENAME TO "legacy_lesson_sessions_classId_sequence_key";

-- RenameIndex
ALTER INDEX "lesson_sessions_date_status_idx" RENAME TO "legacy_lesson_sessions_date_status_idx";

-- RenameIndex
ALTER INDEX "lesson_sessions_makeupForId_key" RENAME TO "legacy_lesson_sessions_makeupForId_key";

-- RenameIndex
ALTER INDEX "lesson_sessions_teacherId_date_idx" RENAME TO "legacy_lesson_sessions_teacherId_date_idx";

-- RenameIndex
ALTER INDEX "levels_name_key" RENAME TO "legacy_levels_name_key";

-- RenameIndex
ALTER INDEX "normal_packages_subLevelId_totalSessions_key" RENAME TO "legacy_normal_packages_subLevelId_totalSessions_key";

-- RenameIndex
ALTER INDEX "recruitment_activities_caseId_createdAt_idx" RENAME TO "legacy_recruitment_activities_caseId_createdAt_idx";

-- RenameIndex
ALTER INDEX "recruitment_cases_code_key" RENAME TO "legacy_recruitment_cases_code_key";

-- RenameIndex
ALTER INDEX "recruitment_cases_consultantId_stage_idx" RENAME TO "legacy_recruitment_cases_consultantId_stage_idx";

-- RenameIndex
ALTER INDEX "recruitment_cases_normalizedPhone_idx" RENAME TO "legacy_recruitment_cases_normalizedPhone_idx";

-- RenameIndex
ALTER INDEX "recruitment_cases_placementClassId_idx" RENAME TO "legacy_recruitment_cases_placementClassId_idx";

-- RenameIndex
ALTER INDEX "recruitment_cases_source_sourceKey_key" RENAME TO "legacy_recruitment_cases_source_sourceKey_key";

-- RenameIndex
ALTER INDEX "recruitment_cases_stage_updatedAt_idx" RENAME TO "legacy_recruitment_cases_stage_updatedAt_idx";

-- RenameIndex
ALTER INDEX "recruitment_tasks_assigneeId_status_dueAt_idx" RENAME TO "legacy_recruitment_tasks_assigneeId_status_dueAt_idx";

-- RenameIndex
ALTER INDEX "recruitment_tasks_caseId_status_idx" RENAME TO "legacy_recruitment_tasks_caseId_status_idx";

-- RenameIndex
ALTER INDEX "rooms_branchId_idx" RENAME TO "legacy_rooms_branchId_idx";

-- RenameIndex
ALTER INDEX "rooms_name_key" RENAME TO "legacy_rooms_name_key";

-- RenameIndex
ALTER INDEX "student_advances_studentId_idx" RENAME TO "legacy_student_advances_studentId_idx";

-- RenameIndex
ALTER INDEX "student_tuitions_enrollmentId_key" RENAME TO "legacy_student_tuitions_enrollmentId_key";

-- RenameIndex
ALTER INDEX "student_tuitions_studentId_idx" RENAME TO "legacy_student_tuitions_studentId_idx";

-- RenameIndex
ALTER INDEX "students_code_key" RENAME TO "legacy_students_code_key";

-- RenameIndex
ALTER INDEX "students_status_idx" RENAME TO "legacy_students_status_idx";

-- RenameIndex
ALTER INDEX "students_userId_key" RENAME TO "legacy_students_userId_key";

-- RenameIndex
ALTER INDEX "sub_levels_levelId_idx" RENAME TO "legacy_sub_levels_levelId_idx";

-- RenameIndex
ALTER INDEX "sub_levels_levelId_name_key" RENAME TO "legacy_sub_levels_levelId_name_key";

-- RenameIndex
ALTER INDEX "syllabus_lessons_courseDayId_idx" RENAME TO "legacy_syllabus_lessons_courseDayId_idx";

-- RenameIndex
ALTER INDEX "syllabus_lessons_courseDayId_order_key" RENAME TO "legacy_syllabus_lessons_courseDayId_order_key";

-- RenameIndex
ALTER INDEX "syllabus_stages_sectionId_key" RENAME TO "legacy_syllabus_stages_sectionId_key";

-- RenameIndex
ALTER INDEX "syllabus_stages_syllabusId_order_key" RENAME TO "legacy_syllabus_stages_syllabusId_order_key";

-- RenameIndex
ALTER INDEX "syllabuses_code_key" RENAME TO "legacy_syllabuses_code_key";

-- RenameIndex
ALTER INDEX "syllabuses_status_idx" RENAME TO "legacy_syllabuses_status_idx";

-- RenameIndex
ALTER INDEX "teachers_code_key" RENAME TO "legacy_teachers_code_key";

-- RenameIndex
ALTER INDEX "teachers_userId_key" RENAME TO "legacy_teachers_userId_key";

-- RenameIndex
ALTER INDEX "tuition_entries_tuitionId_idx" RENAME TO "legacy_tuition_entries_tuitionId_idx";

-- RenameIndex
ALTER INDEX "tuition_payments_paidAt_idx" RENAME TO "legacy_tuition_payments_paidAt_idx";

-- RenameIndex
ALTER INDEX "tuition_payments_paidAt_revenueKind_idx" RENAME TO "legacy_tuition_payments_paidAt_revenueKind_idx";

-- RenameIndex
ALTER INDEX "tuition_payments_tuitionId_idx" RENAME TO "legacy_tuition_payments_tuitionId_idx";

-- RenameIndex
ALTER INDEX "tuition_reminders_enrollmentId_milestone_cycleKey_key" RENAME TO "legacy_tuition_reminders_enrollmentId_milestone_cycleKey_key";

-- RenameIndex
ALTER INDEX "tuition_reminders_studentId_remindedAt_idx" RENAME TO "legacy_tuition_reminders_studentId_remindedAt_idx";

-- RenameIndex
ALTER INDEX "users_email_key" RENAME TO "legacy_users_email_key";

-- RenameIndex
ALTER INDEX "users_role_idx" RENAME TO "legacy_users_role_idx";
