import { bumpDataGeneration, currentDataGeneration, trackKvWrites } from "./data-generation";
import { cloneSyllabus, initialDocument, SyllabusCatalog, SyllabusDocumentObject } from "./syllabus-storage";
import type { ActivityAttemptInput } from "./activity-types";
import type { MutationInput, MutationResult, SyllabusDocument, SyllabusMeta } from "./syllabus-types";
import { defaultSettings, type DemoSettings } from "./settings-types";
import { defaultAccountants, defaultAssistants, defaultStudents, defaultTeachers, type DemoAccountant, type DemoAssistant, type DemoStudent, type DemoTeacher, type StudentStatus } from "./people-types";
import {
  defaultAuditLogs,
  defaultClasses,
  defaultLessonSessions,
  type DemoAuditAction,
  type DemoAuditLog,
  type DemoClass,
  type DemoClassStatus,
  type DemoMaterialFee,
  type DemoAttendanceStatus,
  type DemoHomeworkRating,
  type DemoLessonRating,
  type DemoLessonSession,
  type DemoPeriodicReport,
  type DemoSessionStatus,
} from "./operations-types";
import { auditCategoryOf, auditDetails, auditHasMeaningfulChange, buildAuditNames, type AuditCategory, type AuditDetail, type AuditNames } from "./audit-diff";
import { defaultFinance, defaultPayrollPolicy, hydrateFinance, hydratePayrollConfig, rebuildRecon, rebuildReconEntries, syncTuitionCashbook, type DemoFinance, type DemoCashEntry, type DemoFinanceForecast, type DemoPayrollConfig, type DemoPayrollContract, type DemoPayrollMonthInputs, type DemoPayrollPolicy, type DemoPayrollTaxBracket, type DemoReconDay, type DemoReconEntry, type DemoTuitionDebt } from "./finance-types";
import { activateSessionsForPayment, collectTuitionAmount, monthKey, monthlyCarryReceivables, type CollectAmountStep, applyAttendanceSessionBalances, backfillTeacherOffRemaining, clampPaidThroughToReceipts, clearCourseTeacherCredits, clearMonthlyTeacherCredits, collectManualTuition, classBillingMode, classCourseIndexOfDate, classCourseSessions, classCourseSessionsForCourse, classCurrentCourseIndex, classSessionPrice, classTuitionCharge, courseIndexOfBillKey, courseRemainingSessions, courseRequestBundle, receivableRequestAmount, studentCourseCollectStates, billPaymentCode, ensureReceivableForCharge, freezeLeftClassReceivables, parkLeftClassReceivables, attachParkedCarry, restoreLeftClassReceivables, unfreezeCourseReceivablesForJoinChange, creditCourseExcessForJoinChange, initializeTuitionStatusByBillingMode, isTransferBillKey, rebuildCourseSessionBalances, rebuildSeptemberSessionBalances, refreshTuitionExemptSessionBalances, reverseTuitionReceipt, studentClassJoinDate, syncTuitionReceivables, transferBillKey, transferCarryBreakdown, tuitionCollectionCharge } from "./tuition-billing";
import { academicReportDownloadName, buildAcademicReportPdf } from "./academic-report-pdf";
import { buildCashbookReportPdf, cashbookReportDownloadName, cleanCashbookReportInput } from "./cashbook-report-pdf";
import { buildTimesheetReportPdf, cleanTimesheetReportInput, timesheetReportDownloadName } from "./timesheet-report-pdf";
import { buildDailyReportPdf, cleanDailyReportInput, dailyReportDownloadName } from "./tuition-daily-report-pdf";
import { buildCalendarPrintPdf, calendarPrintDownloadName, cleanCalendarPrintInput } from "./calendar-print-pdf";
import { buildSupportReportPdf, cleanSupportReportInput, supportReportDownloadName } from "./support-report-pdf";
import { buildPayrollSlipPdf, cleanPayrollSlipInput, payrollSlipDownloadName } from "./payroll-slip-pdf";
import { buildPeriodicReportPdf, periodicReportDownloadName } from "./periodic-report-pdf";
import { PDFDocument } from "pdf-lib";
import { buildTuitionNoticePdf, buildTuitionReceiptPdf, receiptDownloadName, tuitionNoticeDownloadName } from "./receipt-pdf";
import { vietQrSvg } from "./vietqr";
import {
  applyMatch,
  applySepayAccount,
  decodeQrImageDataUrl,
  createReceivable,
  mergeSepayLedger,
  contentNamedStudentIds,
  extractPaymentCode,
  friendlyPaymentOrderCode,
  guardContentStudent,
  processBankTransaction,
  refreshOrderQr,
  type MatchApplyResult,
  type SepayBankTransaction,
  type SepayInvoice,
  type SepayLedger,
  type SepayReceivable,
  type SepayWebhookLog,
} from "./sepay-engine";
import { verifyWebhookRequest } from "./sepay-webhook-auth";
import { handleReadonlyApi, READONLY_PREFIX } from "./readonly-api";
import { handleOpsApi, OPS_PREFIX } from "./ops-api";
import { extractStatementRows, processBankStatement, remapStatementColumns, statementRowsFromJson, type BankImportRowOutcome, type BankStatementRow } from "./bank-statement";
import * as XLSX from "xlsx";
import { verifyZaloWebhookRequest } from "./zalo-webhook-auth";
import {
  defaultIntegrationSettings,
  maskIntegrationSettings,
  mergeIntegrationSettings,
  type IntegrationSettings,
  type IntegrationSettingsPatch,
} from "./integration-settings";
import { findReceivableByToken, generatePublicToken, isPublicPaymentRateLimited } from "./payment-link";
import { normalizeMisaInvoiceFields } from "./misa-invoice-fields";
import { readEffectiveIntegrationSettings, readFinanceSnapshot, persistFinanceIfUnchanged, readZaloMessageLogs, persistZaloMessageLogsIfUnchanged, rotateZaloRefreshToken } from "./finance-storage";
import { processInvoiceOutbox } from "./invoice-outbox";
import { enqueueZaloMessage, processZaloOutbox, type EnqueueZaloMessageResult } from "./zalo-outbox";
import { prepareInvoiceDraft } from "./misa-invoice-draft";
import { createZaloClient } from "./zalo-zbs-client";
import { createMisaClient } from "./misa-invoice-client";
import { handleMisaInvoiceApi } from "./misa-invoice-routes";
import { handleGradingApi } from "./grading-routes";
import { parseStudentSheet, planStudentImport } from "./student-import";
import { CALENDAR_EVENTS_KEY, CALENDAR_EVENT_LABELS, cleanCalendarEvents, validateCalendarEventInput } from "./calendar-events";
import { removeMyTamFromT2 } from "./t2-production-correction";
import { t7ScheduleEffectiveFrom, t7t8SeptemberMakeupSessions } from "./t7-t8-schedule-correction";
import { clearStudentLoginFails, findStudentByLogin, hashStudentPassword, recordStudentLoginFail, resolveStudentPassword, studentApiAllowed, studentBootstrapView, studentLoginLocked, verifyStudentPassword } from "./student-auth";
import { handleReadAloudCheck } from "./read-aloud";
import { handlePortalMediaUpload, type PortalMediaStore } from "./portal-media";
import { S43_WITHDRAWN_STUDENT_ID, purgeWithdrawnStudent, s43RosterInfoCorrection, s43RosterSwapCorrection } from "./s43-roster-info-correction";
import { s12S13RosterSwapCorrection } from "./s12-s13-roster-correction";
import { s45RosterInfoCorrection } from "./s45-roster-info-correction";
import { S1_CLASS_ID, S1_TUAN_DUNG_STUDENT_ID } from "./thanh-sen-production-correction";
import { T19_CLASS_ID, T19_DANG_KHOI_STUDENT_ID } from "./t19-production-correction";
import { T24_CLASS_ID, T24_BAO_MINH_STUDENT_ID } from "./t24-production-correction";

interface KvNamespace {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  /** VPS PostgreSQL adapter: compare-and-swap nguyên tử, tránh hai request ghi đè nhau. */
  compareAndPut?(key: string, expected: string, value: string): Promise<boolean>;
}

interface CatalogStub {
  list(): Promise<SyllabusMeta[]>;
  create(input: Partial<SyllabusMeta>): Promise<SyllabusMeta>;
  upsert(meta: SyllabusMeta): Promise<void>;
  remove(id: string): Promise<void>;
}

interface DocumentStub {
  getOrInit(seed?: SyllabusDocument): Promise<SyllabusDocument | null>;
  replace(document: SyllabusDocument): Promise<SyllabusDocument>;
  clear(): Promise<void>;
  mutate(input: MutationInput): Promise<MutationResult>;
}

interface DoNamespace<T> { getByName(name: string): T }

export interface DemoEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  STEPS_LMS_DATA: KvNamespace;
  SYLLABUS_CATALOG: DoNamespace<CatalogStub>;
  SYLLABUS_DOCUMENT: DoNamespace<DocumentStub>;
  AUTH_SECRET: string;
  OPENAI_BASE_URL?: string;
  DEMO_PASSWORD: string;
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
  SEED_ADMIN_NAME?: string;
  ACCOUNTANT_DEFAULT_PASSWORD?: string;
  ALLOW_DEMO_LOGIN?: string;
  SEPAY_WEBHOOK_SECRET?: string;
  /** Token Bearer cho API chỉ đọc /api/v1/readonly (trợ lý AI ngoài). Trống = API tắt. */
  LMS_READONLY_API_TOKEN?: string;
  /** Token Bearer cho API thao tác /api/v1/ops (trợ lý nhập sao kê, 2 bước). Trống = tắt. */
  LMS_OPS_API_TOKEN?: string;
  /** Domain công khai thật (chưa chốt — Q8/Q9 của plan), dùng dựng link tuyệt đối gửi qua Zalo. */
  PUBLIC_BASE_URL?: string;
  /** Lưu học liệu Portal ra đĩa VPS (cloudflare/portal-media.ts). Không có trên Cloudflare demo. */
  MEDIA?: PortalMediaStore;
}

type DemoRole = "ADMIN" | "TEACHER" | "STUDENT" | "ACCOUNTANT" | "ASSISTANT";

function canManageFinance(role: DemoRole) {
  return role === "ADMIN" || role === "ACCOUNTANT";
}

/** Trường hồ sơ kế toán / hành chính được sửa (PATCH /api/students). */
const STUDENT_PROFILE_EDIT_KEYS = ["fullName", "code", "dateOfBirth", "status", "phone", "parentZalo", "parentPhone1", "parentPhone2", "parentName", "nationalId", "address", "note", "school", "loginEmail", "loginPassword"] as const;

function canManageRoster(role: DemoRole) {
  return role === "ADMIN";
}

/** Superadmin: tài khoản quản trị gốc (không phải Audit) — quản lý tài khoản, cấu hình, gỡ đối soát. */
function isSuperAdmin(session: Pick<SessionPayload, "role" | "auditor">) {
  return session.role === "ADMIN" && !session.auditor;
}

const AUDITS_KEY = "audits:steps-demo";
const RECON_LOCKS_KEY = "recon-locks:steps-demo";
/** Nhóm nhân sự trên Quản lý người dùng (anh Mori 12/11/2026): Kế toán / Hành chính — chỉ là nhóm hiển thị,
 *  quyền đăng nhập vẫn theo loại tài khoản (kế toán / Audit). `defaultPasswordTeacherIds`: giáo viên chuyển từ
 *  kế toán sang (Stephen) vẫn đăng nhập bằng mật khẩu mặc định 123456789. */
const STAFF_SETTINGS_KEY = "staff-settings:steps-demo";
/** Tài khoản nhân sự có toàn quyền admin dù thuộc nhóm Hành chính (Trương Đức Nhật — giám đốc). */
const FULL_ADMIN_STAFF_IDS: ReadonlySet<string> = new Set(["accountant-d92ed31c-dfda-4183-a0a0-3f300ec92fe4"]);
/** Nhân sự nhóm Hành chính mặc định (khớp STAFF_DEFAULT_HC_NAMES ở app.js); đổi nhóm lưu ở staff-settings. */
const STAFF_DEFAULT_HC_NAMES = ["Nguyễn Thị Bích Liễu", "Lê Hà", "Trương Đức Nhật", "Trần Thị Phú"];
const staffNameKey = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/\s+/g, " ").trim().toLowerCase();
/** Phiên của nhân sự nhóm Hành chính (tài khoản kế toán hoặc Audit). */
async function sessionIsOfficeHc(env: DemoEnv, session: Pick<SessionPayload, "role" | "name" | "auditor">) {
  if (session.role !== "ACCOUNTANT" && !(session.role === "ADMIN" && session.auditor)) return false;
  const people: Array<{ id: string; fullName: string }> = session.role === "ACCOUNTANT"
    ? cleanAccountants((await env.STEPS_LMS_DATA.get<DemoAccountant[]>("accountants:steps-demo", "json")) ?? [])
    : cleanAudits(await env.STEPS_LMS_DATA.get(AUDITS_KEY, "json"));
  const person = people.find((row) => staffNameKey(row.fullName) === staffNameKey(session.name));
  if (!person) return false;
  const stored = cleanStaffSettings(await env.STEPS_LMS_DATA.get(STAFF_SETTINGS_KEY, "json")).groups[person.id];
  if (stored) return stored === "HC";
  return STAFF_DEFAULT_HC_NAMES.some((name) => staffNameKey(name) === staffNameKey(person.fullName));
}
/** Stephen: chuyển từ kế toán sang giáo viên (giữ nguyên id), anh Mori chọn giữ mật khẩu 123456789. */
const DEFAULT_PASSWORD_TEACHER_IDS = new Set(["accountant-fdfc72b7-9fed-4186-9dda-98838d37688b"]);
/** `assistantTeacherIds`: giáo viên được tick "Quyền trợ giảng" trên hồ sơ (nhập điểm mọi lớp như trợ giảng). */
type StaffSettings = { groups: Record<string, "KT" | "HC">; defaultPasswordTeacherIds: string[]; assistantTeacherIds: string[] };
function cleanStaffSettings(value: unknown): StaffSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<StaffSettings>;
  const groups: Record<string, "KT" | "HC"> = {};
  for (const [id, group] of Object.entries(raw.groups || {})) if (group === "KT" || group === "HC") groups[String(id).slice(0, 120)] = group;
  const ids = Array.isArray(raw.defaultPasswordTeacherIds) ? raw.defaultPasswordTeacherIds.map((id) => String(id).slice(0, 120)).filter(Boolean).slice(0, 50) : [];
  const assistantTeacherIds = Array.isArray(raw.assistantTeacherIds) ? [...new Set(raw.assistantTeacherIds.map((id) => String(id).slice(0, 120)).filter(Boolean))].slice(0, 500) : [];
  return { groups, defaultPasswordTeacherIds: ids, assistantTeacherIds };
}
/** Gắn cờ assistantAccess (lưu ở staff-settings) vào danh sách giáo viên trả cho client. */
async function withTeacherAssistantFlags(env: DemoEnv, teachers: DemoTeacher[]) {
  const ids = new Set(cleanStaffSettings(await env.STEPS_LMS_DATA.get(STAFF_SETTINGS_KEY, "json")).assistantTeacherIds);
  return teachers.map((row) => {
    const { assistantAccess: _drop, ...rest } = row;
    return ids.has(row.id) ? { ...rest, assistantAccess: true } : rest;
  });
}
/** Mật khẩu riêng của tài khoản quản trị (SEED_ADMIN_EMAIL), băm PBKDF2. Trống = dùng SEED_ADMIN_PASSWORD.
 *  Chỉ áp cho admin; giáo viên/trợ giảng vẫn đăng nhập bằng mật khẩu chung cũ. Quên mật khẩu: xoá khoá này trên VPS. */
const ADMIN_PASSWORD_KEY = "admin-password:steps-demo";
async function adminPasswordOk(env: DemoEnv, password: string) {
  const stored = await env.STEPS_LMS_DATA.get<{ hash?: string }>(ADMIN_PASSWORD_KEY, "json");
  if (stored?.hash) return verifyStudentPassword(password, stored.hash);
  const fallback = env.SEED_ADMIN_PASSWORD ?? env.DEMO_PASSWORD;
  return Boolean(fallback) && password === fallback;
}
/** Lượt nhập sao kê ngân hàng (cho task "Cập nhật sao kê" của kế toán) — nhật ký riêng, không bị
 *  đẩy ra như nhật ký chung 1000 dòng. Chỉ ghi thêm, không đổi dữ liệu thu chi. */
const STATEMENT_IMPORTS_KEY = "statement-imports:steps-demo";
type StatementImport = { at: string; date: string; email: string; name: string; file: string; applied: number; rows: number };
function cleanStatementImports(value: unknown): StatementImport[] {
  return (Array.isArray(value) ? value : []).flatMap((row) => row && typeof row === "object" && /^\d{4}-\d{2}-\d{2}$/.test(String((row as StatementImport).date))
    ? [{ at: String((row as StatementImport).at || ""), date: String((row as StatementImport).date), email: String((row as StatementImport).email || ""), name: String((row as StatementImport).name || ""), file: String((row as StatementImport).file || ""), applied: Number((row as StatementImport).applied) || 0, rows: Number((row as StatementImport).rows) || 0 }]
    : []).slice(0, 2000);
}
async function recordStatementImport(env: DemoEnv, actor: Pick<SessionPayload, "email" | "name">, file: string, applied: number, rows: number) {
  const now = new Date();
  const date = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const current = cleanStatementImports(await env.STEPS_LMS_DATA.get(STATEMENT_IMPORTS_KEY, "json"));
  await env.STEPS_LMS_DATA.put(STATEMENT_IMPORTS_KEY, JSON.stringify([{ at: now.toISOString(), date, email: actor.email, name: actor.name, file, applied, rows }, ...current].slice(0, 2000)));
}

type DemoAudit = { id: string; code: string; fullName: string; phone: string; address: string; email: string };
type ReconLock = { date: string; lockedAt: string; lockedBy: string; lockedByName: string };

function cleanAudits(value: unknown): DemoAudit[] {
  const text = (input: unknown) => typeof input === "string" ? input.trim().slice(0, 300) : "";
  return (Array.isArray(value) ? value.slice(0, 200) : []).map((row) => row as Partial<DemoAudit>).map((row, index) => ({ id: text(row.id) || `audit-${crypto.randomUUID()}`, code: text(row.code) || `AU${String(index + 1).padStart(4, "0")}`, fullName: text(row.fullName), phone: text(row.phone), address: text(row.address), email: text(row.email) })).filter((row) => row.fullName);
}

function cleanReconLocks(value: unknown): ReconLock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: any) => (row && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ""))
    ? [{ date: String(row.date), lockedAt: String(row.lockedAt || ""), lockedBy: String(row.lockedBy || ""), lockedByName: String(row.lockedByName || "") }]
    : []));
}

async function readReconLockDates(env: DemoEnv) {
  return new Set(cleanReconLocks(await env.STEPS_LMS_DATA.get(RECON_LOCKS_KEY, "json")).map((row) => row.date));
}

/**
 * Ngày đã đối soát bị khoá phần tiền: mọi dòng sổ thu chi thêm / xoá / sửa có ngày
 * thuộc ngày đã khoá đều bị từ chối (thu học phí, phiếu tay, sao kê, xoá phiếu…).
 * So sổ trước/sau nên bắt được mọi đường ghi tiền của người dùng.
 */
function lockedCashbookTouch(before: DemoCashEntry[], after: DemoCashEntry[], locked: Set<string>): string | null {
  if (!locked.size) return null;
  const prev = new Map(before.map((row) => [row.id, row]));
  const next = new Map(after.map((row) => [row.id, row]));
  for (const row of after) {
    const old = prev.get(row.id);
    if (!old) { if (locked.has(row.date)) return row.date; continue; }
    if (JSON.stringify(old) !== JSON.stringify(row)) {
      if (locked.has(row.date)) return row.date;
      if (locked.has(old.date)) return old.date;
    }
  }
  for (const row of before) if (!next.has(row.id) && locked.has(row.date)) return row.date;
  return null;
}

/** Ngày hiện tại theo giờ Việt Nam (UTC+7) — khoá trong ngày hết hạn lúc 0h giờ VN. */
function vnToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Ngày trước đó của một ngày "YYYY-MM-DD". */
function previousVnDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Hôm nay (giờ VN) đã bấm Đối soát xong → khoá toàn bộ thao tác thu chi, thu học phí đến 0h. */
async function todayLockedError(env: DemoEnv) {
  const today = vnToday();
  if (!(await readReconLockDates(env)).has(today)) return null;
  const [y, m, d] = today.split("-");
  return `Hôm nay ${d}/${m}/${y} đã đối soát xong — khoá toàn bộ thao tác thu chi, thu học phí đến 0h đêm nay (giờ Việt Nam). Cần sửa gấp thì liên hệ superadmin gỡ đối soát.`;
}

function lockedDayError(date: string) {
  const [y, m, d] = date.split("-");
  return `Ngày ${d}/${m}/${y} đã đối soát xong — không thêm / sửa / xoá thu chi, học phí của ngày này. Liên hệ superadmin gỡ đối soát nếu cần sửa.`;
}

/** Soạn học liệu Portal (chương trình, buổi, hoạt động, tải ảnh/âm thanh/video/PDF): quản trị,
 * Audit, giáo viên, kế toán và hành chính (tài khoản kế toán) — anh Mori 17/11/2026.
 * Xoá cả chương trình vẫn chỉ quản trị cao nhất. Trợ giảng (ASSISTANT) và học viên không soạn. */
function canEditPortalContent(role: DemoRole) {
  return role === "ADMIN" || role === "TEACHER" || role === "ACCOUNTANT";
}

type SessionPayload = {
  email: string;
  name: string;
  role: DemoRole;
  studentId: string;
  teacherId?: string;
  /** Tài khoản Audit: quyền như admin nhưng không quản lý tài khoản / cấu hình,
   * không gỡ đối soát. Superadmin = admin không có cờ này. */
  auditor?: boolean;
  exp: number;
};

type DemoUser = Omit<SessionPayload, "exp">;

const SESSION_COOKIE = "steps_demo_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_BALANCE_MIGRATION_KEY = "migration:session-balance-2026-09";
const S28_NEW_COURSE_START = "2026-09-10";
const S28_COURSE_MIGRATION_KEY = "migration:s28-course-start-2026-09-10";
const S12_COURSE_START_DATE = "2026-07-17";
const S12_EXTRA_SESSION_DATE = "2026-07-12";
const S12_COURSE_FIX_MIGRATION_KEY = "migration:s12-course-start-2026-10-10";
const S12_EXTRA_SESSION_MIGRATION_KEY = "migration:s12-extra-session-2026-10-10";
const S13_NEW_COURSE_START = "2026-07-11";
const S13_SCHEDULE_SPLIT_DATE = "2026-09-01";
const S13_SCHEDULE_MIGRATION_KEY = "migration:s13-schedule-split-2026-10-09-v2";
const S15_COURSE_START = "2026-08-11";
const S17_S28_SCHEDULE_MIGRATION_KEY = "migration:s17-s45-schedule-fix-2026-10-12-v3";
const S8_SAT_TIME_MIGRATION_KEY = "migration:s8-sat-0900-2026-10-10-v2";
const S15_EXTRA_SLOT_DATE = "2026-09-06";
const S15_SCHEDULE_MIGRATION_KEY = "migration:s15-schedule-fix-2026-10-11-v4";
const TUITION_STATUS_MIGRATION_KEY = "migration:tuition-status-by-billing-mode-2026-09-12";
const TEACHER_OFF_REMAINING_MIGRATION_KEY = "migration:teacher-off-remaining-2026-09-14";
const COURSE_REMAINING_MIGRATION_KEY = "migration:course-remaining-2026-09-15";
const COURSE_TEACHER_CREDIT_MIGRATION_KEY = "migration:course-teacher-credit-2026-10-02";
const MONTHLY_OFF_CREDIT_MIGRATION_KEY = "migration:monthly-off-credit-cutoff-2026-10-03";
const T2_ROSTER_CORRECTION_MIGRATION_KEY = "migration:t2-remove-my-tam-2026-10-03";
const AUTO_BILLING_MIGRATION_KEY = "migration:auto-billing-all-classes-2026-10-03";
const T7_SCHEDULE_MIGRATION_KEY = "migration:t7-schedule-effective-2026-10-05";
const T7_T8_MAKEUP_MIGRATION_KEY = "migration:t7-t8-september-makeup-2026-10-05";
const S43_ROSTER_INFO_MIGRATION_KEY = "migration:s43-roster-info-2026-10-05";
const S45_ROSTER_INFO_MIGRATION_KEY = "migration:s45-roster-info-2026-10-08-v2";
const S43_WITHDRAWN_MIGRATION_KEY = "migration:s43-withdrawn-ducnam-2026-10-05";
const S43_ROSTER_SWAP_MIGRATION_KEY = "migration:s43-roster-swap-2026-10-08";
const S12_S13_ROSTER_SWAP_MIGRATION_KEY = "migration:s12-s13-roster-swap-2026-10-12-v3";
const T19_PAID_MIGRATION_KEY = "migration:t19-dang-khoi-paid-2026-10-05";
const T24_PAID_MIGRATION_KEY = "migration:t24-bao-minh-paid-2026-10-04";
const T24_UNPAID_MIGRATION_KEY = "migration:t24-bao-minh-unpaid-2026-10-04";
const S28_THANH_NHAN_STUDENT_ID = "student-import-0379";
const S28_THANH_NHAN_RECV_MIGRATION_KEY = "migration:s28-thanh-nhan-recv-1560000-2026-10-05";
const S1_TUAN_DUNG_RECV_MIGRATION_KEY = "migration:s1-tuan-dung-october-bill-2026-10-07";
const S28_NHAT_MINH_STUDENT_ID = "student-import-0376";
const S28_NHAT_MINH_C2_MIGRATION_KEY = "migration:s28-nhat-minh-course2-cancel-2026-10-08";
const TRANSFER_ANCHOR_MIGRATION_KEY = "migration:transfer-course-anchor-2026-10-13";
const S19_COURSE_SESSIONS_MIGRATION_KEY = "migration:s19-course-sessions-2026-10-14";
const S19_COURSE_SIZES_MIGRATION_KEY = "migration:s19-course-sizes-2026-10-16";
const S29_COURSE_START_MIGRATION_KEY = "migration:s29-course-start-2026-10-15";
const S36_SCHEDULE_MIGRATION_KEY = "migration:s36-schedule-2026-10-15";
const S41_SCHEDULE_MIGRATION_KEY = "migration:s41-schedule-v2-2026-10-15";
const S35_SCHEDULE_MIGRATION_KEY = "migration:s35-schedule-2026-10-15";
const DEBT_4CLASSES_MIGRATION_KEY = "migration:debt-4classes-2026-10-16";
const DEBT_8CLASSES_MIGRATION_KEY = "migration:debt-8classes-v2-2026-10-16";
const S29_CLASS_ID = "class-import-s29";
const S29_COURSE_START = "2026-07-14";
const S29_NOFEE_DATE = "2026-10-02";
const S22_COURSE1_RECV_MIGRATION_KEY = "migration:s22-course1-receivables-2026-10-12";

/** 6 hóa đơn ISSUED phát hành thử ngoài T1–T5 — reset về CANCELLED để xuất lại trên web. */
const ISSUED_INVOICE_RESET_MIGRATION_KEY = "migration:issued-invoice-reset-non-t1t5-2026-10-05";
const ISSUED_INVOICE_RESET_IDS = new Set([
  "inv-da78c0ba-f78b-42e2-844b-2afef1f1ce63", // 00000317 — T11 Bùi Lê Trí Nguyên
  "inv-f425d0aa-9360-41b2-a08a-3b046395889f", // 00000319 — T11 Bùi Lê Trí Tài
  "inv-076d115c-b0a2-4156-a746-07c60c421e38", // 00000320 — T10 Huy Long
  "inv-3ed62429-251b-4821-9f5d-5d3206b234bb", // 00000322 — T23 Phan Vĩnh Long
  "inv-b859bd46-f34a-4914-844f-e35619473090", // 00000324 — T22 Nguyễn Đức Phúc
  "inv-baec7a19-e439-498e-aa15-44d744666979", // 00000380 — T14 Phương Dung
]);

/** 3 hóa đơn ISSUED phát hành thử ở chi nhánh Thành Sen — reset để toàn hệ thống chỉ còn 97 tờ T1–T5 (xuất ngoài). */
const ISSUED_INVOICE_RESET_TS_MIGRATION_KEY = "migration:issued-invoice-reset-thanh-sen-2026-10-05";
const ISSUED_INVOICE_RESET_TS_IDS = new Set([
  "inv-a4647846-dd80-403e-adea-d4b3ee0613da", // 00000318 — S6 Phan Cẩm Tú
  "inv-f79fc9b7-73d7-4d0b-b483-305aab9630cf", // 00000381 — S28 Lê Thị Ly Na
  "inv-4e1e2a95-24ea-44c1-846c-7cc4af67909e", // 00000382 — S28 Hồ Đăng Khôi
]);

function isS28Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  const name = String(cls.name || "").toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s28" || code === "s28" || /s28-?5\.3-?2016/.test(name);
}

function isS12Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  const name = String(cls.name || "").toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s12" || code === "s12" || /s12-?4\.1-?2017/.test(name);
}

function isS13Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  const name = String(cls.name || "").toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s13" || code === "s13" || /s13-?4\.2-?2017/.test(name);
}

function isS15Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s15" || code === "s15";
}

function isS19Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s19" || code === "s19";
}

function isS29Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s29" || code === "s29";
}

function isS36Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s36" || code === "s36";
}

function isS41Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s41" || code === "s41";
}

function isS35Class(cls: Pick<DemoClass, "id" | "code" | "name">) {
  const id = String(cls.id || "").toLowerCase();
  const code = String(cls.code || "").trim().toLowerCase().replace(/\s+/g, "");
  return id === "class-import-s35" || code === "s35";
}

function staffLoginUsername(fullName: string) {
  return fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "d")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

const demoUsers: Record<string, DemoUser> = {
  "admin@steps.edu.vn": {
    email: "admin@steps.edu.vn",
    name: "Quản trị STEPS",
    role: "ADMIN",
    studentId: "student-demo",
  },
  "teacher@steps.edu.vn": {
    email: "teacher@steps.edu.vn",
    name: "Trịnh Thị Xuân Quỳnh",
    role: "TEACHER",
    studentId: "student-demo",
    teacherId: "teacher-quynh",
  },
  "accountant@steps.edu.vn": {
    email: "accountant@steps.edu.vn",
    name: "Kế toán STEPS",
    role: "ACCOUNTANT",
    studentId: "student-demo",
  },
  "student@steps.edu.vn": {
    email: "student@steps.edu.vn",
    name: "Nguyễn Minh Anh",
    role: "STUDENT",
    studentId: "student-demo",
  },
};

const securityHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(repairLegacyEncoding(data)), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...securityHeaders,
      ...headers,
    },
  });
}

const LEGACY_TEXT_FIXES = new Map<string, string>([
  ["L?p ti�u chu?n", "Lớp tiêu chuẩn"],
  ["L?p 1 k�m 1", "Lớp 1 kèm 1"],
  ["L?p ki?m th?", "Lớp kiểm thử"],
  ["STEPS - Chi nh�nh 1", "STEPS - Chi nhánh 1"],
  ["STEPS - Chi nh�nh 2", "STEPS - Chi nhánh 2"],
  ["Chi nh�nh ki?m th?", "Chi nhánh kiểm thử"],
  ["Nguy?n Minh Anh", "Nguyễn Minh Anh"],
  ["Tr?n Gia H�n", "Trần Gia Hân"],
  ["H?c vi�n CRUD", "Học viên CRUD"],
]);

function repairLegacyEncoding(value: unknown): unknown {
  if (typeof value === "string") return (LEGACY_TEXT_FIXES.get(value) || value).normalize("NFC");
  if (Array.isArray(value)) return value.map(repairLegacyEncoding);
  if (!value || typeof value !== "object") return value;
  // Mật khẩu học viên (đã băm) không bao giờ rời máy chủ.
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, key === "loginPassword" ? "" : repairLegacyEncoding(item)]));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodePayload(payload: SessionPayload) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as SessionPayload;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createSession(payload: SessionPayload, secret: string) {
  const encoded = encodePayload(payload);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(encoded));
  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

function sessionSetCookieHeader(url: URL, sessionToken: string, maxAgeSeconds: number) {
  return `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly;${url.protocol === "https:" ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function readSession(request: Request, secret: string): Promise<SessionPayload | null> {
  const cookie = request.headers.get("Cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (!token || !secret) return null;
  const [payloadValue, signatureValue] = token.split(".");
  if (!payloadValue || !signatureValue) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlToBytes(signatureValue),
      new TextEncoder().encode(payloadValue),
    );
    if (!valid) return null;
    const payload = decodePayload(payloadValue);
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// Phiên đăng nhập hết hạn tuyệt đối theo SESSION_TTL_SECONDS kể từ lúc đăng
// nhập, không tự gia hạn khi đang thao tác — khiến người dùng bị văng ra dù
// vẫn đang dùng dở. Gia hạn kiểu "sliding window": khi phiên đã đi quá nửa
// vòng đời, mỗi request có phiên hợp lệ sẽ được cấp lại cookie hạn đủ
// SESSION_TTL_SECONDS mới, để người dùng còn hoạt động thì không bao giờ bị
// văng; ai ngưng thao tác thì phiên vẫn hết hạn như cũ.
async function renewSessionIfNeeded(request: Request, env: DemoEnv, url: URL, response: Response): Promise<Response> {
  if (response.headers.has("Set-Cookie")) return response;
  const session = await readSession(request, env.AUTH_SECRET);
  if (!session) return response;
  const remainingMs = session.exp - Date.now();
  if (remainingMs > (SESSION_TTL_SECONDS * 1000) / 2) return response;

  const renewedToken = await createSession({ ...session, exp: Date.now() + SESSION_TTL_SECONDS * 1000 }, env.AUTH_SECRET);
  const headers = new Headers(response.headers);
  headers.set("Set-Cookie", sessionSetCookieHeader(url, renewedToken, SESSION_TTL_SECONDS));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function cleanSettings(input: DemoSettings): DemoSettings {
  const defaults = defaultSettings();
  const shortText = (value: unknown, fallback = "") => typeof value === "string" ? value.trim().slice(0, 300) : fallback;
  const rows = <T>(value: unknown) => Array.isArray(value) ? value.slice(0, 100) as T[] : [];
  const branches = rows<DemoSettings["branches"][number]>(input?.branches).map((item) => ({ id: shortText(item.id, `branch-${crypto.randomUUID()}`), name: shortText(item.name) })).filter((item) => item.name);
  const classTypes = rows<DemoSettings["classTypes"][number]>(input?.classTypes).map((item) => ({ id: shortText(item.id, `class-type-${crypto.randomUUID()}`), name: shortText(item.name), description: shortText(item.description) })).filter((item) => item.name);
  const classTypeIds = new Set(classTypes.map((item) => item.id));
  const tuitionPackages = rows<DemoSettings["tuitionPackages"][number]>(input?.tuitionPackages).map((item) => ({ id: shortText(item.id, `tuition-${crypto.randomUUID()}`), classTypeId: shortText(item.classTypeId), name: shortText(item.name), sessions: Math.max(1, Math.min(1000, Math.round(Number(item.sessions) || 0))), amount: Math.max(0, Math.round(Number(item.amount) || 0)) })).filter((item) => item.name && classTypeIds.has(item.classTypeId));
  const lessonPeriods = rows<DemoSettings["lessonPeriods"][number]>(input?.lessonPeriods).map((item) => ({ id: shortText(item.id, `period-${crypto.randomUUID()}`), name: shortText(item.name), startTime: shortText(item.startTime), endTime: shortText(item.endTime) })).filter((item) => item.name && /^\d{2}:\d{2}$/.test(item.startTime) && /^\d{2}:\d{2}$/.test(item.endTime) && item.startTime < item.endTime);
  const branchIds = new Set(branches.map((item) => item.id));
  const rooms = rows<DemoSettings["rooms"][number]>(input?.rooms).map((item) => ({ id: shortText(item.id, `room-${crypto.randomUUID()}`), name: shortText(item.name), capacity: Math.max(1, Math.min(500, Math.round(Number(item.capacity) || 0))), branchId: shortText(item.branchId) })).filter((item) => item.name && branchIds.has(item.branchId));
  return {
    center: {
      name: shortText(input?.center?.name, defaults.center.name),
      phone: shortText(input?.center?.phone),
      email: shortText(input?.center?.email),
      logoUrl: shortText(input?.center?.logoUrl),
      address: shortText(input?.center?.address),
    },
    branches,
    classTypes,
    tuitionPackages,
    lessonPeriods,
    rooms,
  };
}

function mergeSettings(value: DemoSettings | null): DemoSettings {
  const defaults = defaultSettings();
  if (!value) return defaults;
  return {
    center: { ...defaults.center, ...(value.center ?? {}) },
    branches: Array.isArray(value.branches) ? value.branches : defaults.branches,
    classTypes: Array.isArray(value.classTypes) ? value.classTypes : defaults.classTypes,
    tuitionPackages: Array.isArray(value.tuitionPackages) ? value.tuitionPackages : defaults.tuitionPackages,
    lessonPeriods: Array.isArray(value.lessonPeriods) ? value.lessonPeriods : defaults.lessonPeriods,
    rooms: Array.isArray(value.rooms) ? value.rooms : defaults.rooms,
  };
}

function cleanStudents(value: unknown): DemoStudent[] {
  const statuses: StudentStatus[] = ["UNASSIGNED", "STUDYING", "STOPPED"];
  // Trạng thái cũ PAUSED (Tạm nghỉ) / RESERVED (Bảo lưu) gộp về STOPPED (Nghỉ học).
  const normalizeStatus = (input: unknown): StudentStatus => {
    if (input === "PAUSED" || input === "RESERVED") return "STOPPED";
    return statuses.includes(input as StudentStatus) ? input as StudentStatus : "UNASSIGNED";
  };
  const text = (input: unknown) => typeof input === "string" ? input.trim().slice(0, 300) : "";
  const balances = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input as Record<string, unknown>).slice(0, 50).map(([key, value]) => [text(key), Math.round(Number(value) || 0)]).filter(([key]) => key));
  };
  const paidThrough = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input as Record<string, unknown>).slice(0, 50).map(([key, value]) => [text(key), text(value).slice(0, 7)]).filter(([key, month]) => key && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)));
  };
  const joinedAt = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input as Record<string, unknown>).slice(0, 50).map(([key, value]) => [text(key), text(value).slice(0, 10)]).filter(([key, date]) => key && /^\d{4}-\d{2}-\d{2}$/.test(date)));
  };
  return (Array.isArray(value) ? value.slice(0, 2000) : [])
    .map((row) => row as Partial<DemoStudent>)
    .map((row, index) => {
      const legacyPhone = text(row.phone);
      const legacyParentZalo = text(row.parentZalo);
      const parentPhone1 = text(row.parentPhone1) || legacyPhone || legacyParentZalo;
      const parentPhone2 = text(row.parentPhone2) || (legacyPhone && legacyParentZalo && legacyPhone !== legacyParentZalo ? legacyParentZalo : "");
      return {
        id: text(row.id) || `student-${crypto.randomUUID()}`,
        code: text(row.code) || `HV${String(index + 1).padStart(4, "0")}`,
        fullName: text(row.fullName),
        phone: parentPhone1,
        address: text(row.address),
        school: text(row.school),
        parentZalo: parentPhone2 || parentPhone1,
        parentPhone1,
        parentPhone2,
        status: normalizeStatus(row.status),
        dateOfBirth: text(row.dateOfBirth).slice(0, 10),
        parentName: text(row.parentName),
        nationalId: text(row.nationalId).slice(0, 30),
        note: text(row.note),
        loginEmail: text(row.loginEmail),
        loginPassword: text(row.loginPassword),
        tuitionExempt: row.tuitionExempt === true,
        sessionBalances: balances(row.sessionBalances),
        tuitionCredits: balances(row.tuitionCredits),
        tuitionPaidThrough: paidThrough(row.tuitionPaidThrough),
        classJoinedAt: joinedAt(row.classJoinedAt),
      };
    })
    .filter((row) => row.fullName);
}

function cleanTeachers(value: unknown): DemoTeacher[] {
  const text = (input: unknown) => typeof input === "string" ? input.trim().slice(0, 300) : "";
  return (Array.isArray(value) ? value.slice(0, 1000) : []).map((row) => row as Partial<DemoTeacher>).map((row, index) => ({ id: text(row.id) || `teacher-${crypto.randomUUID()}`, code: text(row.code) || `GV${String(index + 1).padStart(4, "0")}`, fullName: text(row.fullName), phone: text(row.phone), address: text(row.address), email: text(row.email), assignedClasses: (Array.isArray(row.assignedClasses) ? row.assignedClasses : []).map(text).filter(Boolean).slice(0, 50), ...(row.assistantAccess === true ? { assistantAccess: true } : {}) })).filter((row) => row.fullName && row.email);
}

/** Phòng ban "Trợ giảng" trên hồ sơ lương (không phân biệt dấu/hoa thường). */
function isAssistantDepartment(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim() === "tro giang";
}

/** Giáo viên được tick "Quyền trợ giảng" trên hồ sơ, hoặc có phòng ban "Trợ giảng" trong hồ sơ lương
 *  → được nhập điểm mọi lớp như quyền trợ giảng. */
async function teacherIsAssistantStaff(env: DemoEnv, teacherId?: string) {
  if (!teacherId) return false;
  if (cleanStaffSettings(await env.STEPS_LMS_DATA.get(STAFF_SETTINGS_KEY, "json")).assistantTeacherIds.includes(teacherId)) return true;
  const config = await env.STEPS_LMS_DATA.get<DemoPayrollConfig>("payroll-config:steps-demo", "json");
  return isAssistantDepartment(config?.teachers?.[teacherId]?.department);
}

/** Hồ sơ lương giáo viên + khoản nhập tay theo tháng — kho JSON `payroll-config:steps-demo`. */
function cleanPayrollConfig(value: unknown): DemoPayrollConfig {
  const money = (input: unknown) => Math.max(0, Math.min(2_000_000_000, Math.round(Number(input) || 0)));
  // Ghi đè phụ cấp để trống nghĩa là dùng chính sách, không phải 0 đồng.
  const optionalMoney = (input: unknown) => input === undefined || input === null || input === "" ? undefined : money(input);
  const rate = (input: unknown, max = 1) => Math.max(0, Math.min(max, Number(input) || 0));
  const optionalCoefficient = (input: unknown) => input === undefined || input === null || input === "" ? undefined : Math.max(0, Math.min(10, Number(input) || 0));
  const text = (input: unknown, max = 300) => typeof input === "string" ? input.trim().slice(0, max) : "";
  const date = (input: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(input, 10)) ? text(input, 10) : "";
  const teachers: Record<string, DemoPayrollContract> = {};
  const months: Record<string, Record<string, DemoPayrollMonthInputs>> = {};
  const raw = (value && typeof value === "object" ? value : {}) as DemoPayrollConfig;
  const kinds = new Set(["TT", "BTG", "NN", "CSH", "DV"]);
  for (const [teacherId, row] of Object.entries(raw.teachers || {}).slice(0, 2000)) {
    const id = String(teacherId).slice(0, 120);
    if (!id || !row || typeof row !== "object") continue;
    const contractType = row.contractType === "LABOR" ? "LABOR" : "SERVICE";
    teachers[id] = {
      department: text(row.department, 120),
      contractType,
      dependents: Math.max(0, Math.min(20, Math.round(Number(row.dependents) || 0))),
      contractKind: kinds.has(String(row.contractKind)) ? row.contractKind : undefined,
      payMode: row.payMode === "MONTHLY" ? "MONTHLY" : row.payMode === "HOURLY" ? "HOURLY" : undefined,
      status: row.status === "DRAFT" || row.status === "EXPIRED" ? row.status : row.status === "ACTIVE" ? "ACTIVE" : undefined,
      contractNo: text(row.contractNo, 60),
      signedDate: date(row.signedDate),
      startDate: date(row.startDate),
      endDate: date(row.endDate),
      jobTitle: text(row.jobTitle, 120),
      workLocation: text(row.workLocation, 200),
      insuranceSalary: money(row.insuranceSalary),
      salaryCoefficient: optionalCoefficient(row.salaryCoefficient),
      mealAllowance: optionalMoney(row.mealAllowance),
      mealAllowancePerDay: optionalMoney(row.mealAllowancePerDay),
      committedHours: Number.isFinite(Number(row.committedHours)) && Number(row.committedHours) > 0 ? Math.min(744, Math.round(Number(row.committedHours) * 100) / 100) : undefined,
      phoneAllowance: optionalMoney(row.phoneAllowance),
      fuelAllowance: optionalMoney(row.fuelAllowance),
      uniformAllowance: optionalMoney(row.uniformAllowance),
      nationalId: text(row.nationalId, 20),
      dateOfBirth: date(row.dateOfBirth),
      taxCode: text(row.taxCode, 20),
      socialInsuranceNo: text(row.socialInsuranceNo, 20),
      bankAccount: text(row.bankAccount, 40),
      bankName: text(row.bankName, 120),
      note: text(row.note, 500),
    };
  }
  for (const [month, perTeacher] of Object.entries(raw.months || {}).slice(0, 240)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !perTeacher || typeof perTeacher !== "object") continue;
    const rows: Record<string, DemoPayrollMonthInputs> = {};
    for (const [teacherId, row] of Object.entries(perTeacher).slice(0, 2000)) {
      const id = String(teacherId).slice(0, 120);
      if (!id || !row || typeof row !== "object") continue;
      const paidDays = Math.round(Number(row.paidDays));
      const paidLeaveDays = Math.round(Number(row.paidLeaveDays));
      const unpaidLeaveDays = Math.round(Number(row.unpaidLeaveDays));
      // Giờ công chốt tay giữ 2 số lẻ (buổi trợ giảng hay lẻ 1,5 giờ).
      const hours = row.hours === undefined || row.hours === null || row.hours === "" ? NaN : Math.round(Number(row.hours) * 100) / 100;
      rows[id] = {
        allowance: money(row.allowance),
        advance: money(row.advance),
        paidLeaveDays: Number.isFinite(paidLeaveDays) ? Math.max(0, Math.min(31, paidLeaveDays)) : undefined,
        unpaidLeaveDays: Number.isFinite(unpaidLeaveDays) ? Math.max(0, Math.min(31, unpaidLeaveDays)) : undefined,
        paidDays: Number.isFinite(paidDays) ? Math.max(0, Math.min(31, paidDays)) : undefined,
        hours: Number.isFinite(hours) ? Math.max(0, Math.min(744, hours)) : undefined,
        note: text(row.note, 500),
      };
    }
    months[month] = rows;
  }
  const policy = defaultPayrollPolicy();
  const rawPolicy = (raw.policy && typeof raw.policy === "object" ? raw.policy : {}) as DemoPayrollPolicy;
  const effectiveFrom = date(rawPolicy.effectiveFrom);
  if (effectiveFrom) policy.effectiveFrom = effectiveFrom;
  policy.standardDays = Math.max(1, Math.min(31, Math.round(Number(rawPolicy.standardDays) || policy.standardDays)));
  policy.attendanceDeadlineHours = Math.max(1, Math.min(720, Math.round(Number(rawPolicy.attendanceDeadlineHours) || policy.attendanceDeadlineHours)));
  for (const key of ["personalDeduction", "dependentDeduction", "serviceTaxThreshold", "mealAllowance", "mealAllowancePerDay", "phoneAllowance", "fuelAllowance", "uniformAllowance", "standardHourlyRate"] as const) {
    policy[key] = money(rawPolicy[key] ?? policy[key]);
  }
  policy.employeeInsuranceRate = rate(rawPolicy.employeeInsuranceRate ?? policy.employeeInsuranceRate);
  policy.employerInsuranceRate = rate(rawPolicy.employerInsuranceRate ?? policy.employerInsuranceRate);
  policy.foreignEmployeeInsuranceRate = rate(rawPolicy.foreignEmployeeInsuranceRate ?? policy.foreignEmployeeInsuranceRate);
  policy.foreignEmployerInsuranceRate = rate(rawPolicy.foreignEmployerInsuranceRate ?? policy.foreignEmployerInsuranceRate);
  policy.serviceTaxRate = rate(rawPolicy.serviceTaxRate ?? policy.serviceTaxRate);
  if (Array.isArray(rawPolicy.taxBrackets) && rawPolicy.taxBrackets.length) {
    const brackets: DemoPayrollTaxBracket[] = rawPolicy.taxBrackets
      .filter((row) => row && typeof row === "object" && Number.isFinite(Number(row.rate)))
      .slice(0, 10)
      .map((row) => ({
        upTo: row.upTo === null || row.upTo === undefined ? null : money(row.upTo),
        rate: rate(row.rate),
      }));
    if (brackets.length) policy.taxBrackets = brackets;
  }
  return { teachers, months, policy };
}

function cleanAccountants(value: unknown): DemoAccountant[] {
  const text = (input: unknown) => typeof input === "string" ? input.trim().slice(0, 300) : "";
  return (Array.isArray(value) ? value.slice(0, 500) : []).map((row) => row as Partial<DemoAccountant>).map((row, index) => ({ id: text(row.id) || `accountant-${crypto.randomUUID()}`, code: text(row.code) || `KT${String(index + 1).padStart(4, "0")}`, fullName: text(row.fullName), phone: text(row.phone), address: text(row.address), email: text(row.email) })).filter((row) => row.fullName);
}

function cleanAssistants(value: unknown): DemoAssistant[] {
  const text = (input: unknown) => typeof input === "string" ? input.trim().slice(0, 300) : "";
  return (Array.isArray(value) ? value.slice(0, 500) : []).map((row) => row as Partial<DemoAssistant>).map((row, index) => ({ id: text(row.id) || `assistant-${crypto.randomUUID()}`, code: text(row.code) || `TG${String(index + 1).padStart(4, "0")}`, fullName: text(row.fullName), phone: text(row.phone), address: text(row.address), email: text(row.email) })).filter((row) => row.fullName);
}

function inferredSessionPrice(row: Partial<DemoClass>) {
  const entered = Math.round(Number(row.sessionPrice) || 0);
  if (entered > 0) return entered;
  const pkg = defaultSettings().tuitionPackages.find((item) => item.id === String(row.tuitionPackageId || ""));
  if (pkg?.sessions) return Math.round(pkg.amount / pkg.sessions);
  return 200000;
}

/** Học liệu theo tháng, hoặc khóa "course" cho lớp thu khóa: chỉ giữ kỳ có tiền. */
function cleanMaterialFees(value: unknown): Record<string, DemoMaterialFee> {
  const fees: Record<string, DemoMaterialFee> = {};
  if (!value || typeof value !== "object") return fees;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 120)) {
    const validKey = /^course(\|\d{1,3})?$/.test(key) || /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
    if (!validKey || !raw || typeof raw !== "object") continue;
    const row = raw as Partial<DemoMaterialFee>;
    const amount = Math.max(0, Math.min(500_000_000, Math.round(Number(row.amount) || 0)));
    // Khoản "course|k" của khóa sau giữ cả khi bằng 0: đó là cách chặn kế thừa học liệu khóa 1.
    if (!amount && !/^course\|\d{1,3}$/.test(key)) continue;
    fees[key] = { amount, description: typeof row.description === "string" ? row.description.trim().slice(0, 200) : "" };
  }
  return fees;
}

function cleanClasses(value: unknown): DemoClass[] {
  const statuses: DemoClassStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "FINISHED"];
  const text = (input: unknown) => typeof input === "string" ? input.trim().slice(0, 300) : "";
  const isTime = (input: string) => /^\d{2}:\d{2}$/.test(input);
  return (Array.isArray(value) ? value.slice(0, 500) : [])
    .map((row) => row as Partial<DemoClass>)
    .map((row, index): DemoClass => ({
      id: text(row.id) || `class-${crypto.randomUUID()}`,
      code: text(row.code) || `LOP${String(index + 1).padStart(4, "0")}`,
      name: text(row.name),
      classTypeId: text(row.classTypeId),
      branchId: text(row.branchId),
      teacherId: text(row.teacherId),
      roomId: text(row.roomId),
      syllabusId: text(row.syllabusId),
      status: statuses.includes(row.status as DemoClassStatus) ? row.status as DemoClassStatus : "DRAFT",
      studentIds: [...new Set((Array.isArray(row.studentIds) ? row.studentIds : []).map(text).filter(Boolean))].slice(0, 200),
      tuitionPackageId: text(row.tuitionPackageId),
      billingMode: row.billingMode === "MONTHLY" ? "MONTHLY" : "COURSE",
      sessionPrice: Math.max(0, Math.round(Number(row.sessionPrice) || inferredSessionPrice(row))),
      courseSessions: Math.max(1, Math.min(1000, classCourseSessions(row))),
      courseStartDate: /^\d{4}-\d{2}-\d{2}$/.test(text(row.courseStartDate)) ? text(row.courseStartDate) : undefined,
      billingEnabled: row.billingEnabled !== false,
      materialFees: cleanMaterialFees(row.materialFees),
      schedules: (Array.isArray(row.schedules) ? row.schedules : []).slice(0, 14).map((slot) => ({
        weekday: Math.max(0, Math.min(6, Math.round(Number(slot.weekday) || 0))),
        periodId: text(slot.periodId),
        startTime: text(slot.startTime),
        endTime: text(slot.endTime),
        effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(text(slot.effectiveFrom)) ? text(slot.effectiveFrom) : undefined,
        effectiveTo: /^\d{4}-\d{2}-\d{2}$/.test(text(slot.effectiveTo)) ? text(slot.effectiveTo) : undefined,
      })).filter((slot) => slot.periodId && isTime(slot.startTime) && isTime(slot.endTime) && slot.startTime < slot.endTime),
      note: text(row.note),
    }))
    .filter((row) => row.name && row.code);
}

function cleanLessonSessions(value: unknown): DemoLessonSession[] {
  const statuses: DemoSessionStatus[] = ["SCHEDULED", "COMPLETED", "CANCELLED"];
  const text = (input: unknown) => typeof input === "string" ? input.trim().slice(0, 300) : "";
  const score = (input: unknown) => {
    if (input === "" || input === null || input === undefined) return null;
    const parsed = Number(input);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1000
      ? Math.round(parsed * 100) / 100
      : null;
  };
  const assessmentText = (input: unknown) => {
    if (input === "" || input === null || input === undefined) return null;
    const value = String(input).trim().slice(0, 200);
    return value || null;
  };
  return (Array.isArray(value) ? value.slice(0, 3000) : [])
    .map((row) => row as Partial<DemoLessonSession>)
    .map((row) => {
      const assessmentColumns = (Array.isArray(row.assessmentColumns) ? row.assessmentColumns : [])
        .slice(0, 12)
        .map((column) => ({ id: text(column?.id).slice(0, 80), name: text(column?.name).slice(0, 50) }))
        .filter((column, index, columns) => column.id && column.name && columns.findIndex((item) => item.id === column.id) === index);
      const allowedColumnKeys = new Set([
        "status",
        "clip",
        "worksheet",
        "vocabulary",
        "note",
        ...assessmentColumns.map((column) => `assessment:${column.id}`),
      ]);
      const attendanceColumnOrder = (Array.isArray(row.attendanceColumnOrder) ? row.attendanceColumnOrder : [])
        .map((key) => text(key).slice(0, 100))
        .filter((key, index, keys) => allowedColumnKeys.has(key) && keys.indexOf(key) === index)
        .slice(0, 16);
      return {
        id: text(row.id) || `session-${crypto.randomUUID()}`,
        classId: text(row.classId),
        date: text(row.date),
        startTime: text(row.startTime),
        endTime: text(row.endTime),
        teacherId: text(row.teacherId),
        roomId: text(row.roomId),
        status: statuses.includes(row.status as DemoSessionStatus) ? row.status as DemoSessionStatus : "SCHEDULED",
        isExtra: Boolean(row.isExtra),
        recurrenceKey: text(row.recurrenceKey),
        note: text(row.note),
        isOff: Boolean(row.isOff),
        offSource: row.offSource === "TEACHER" ? "TEACHER" as const : row.offSource === "ADMIN" ? "ADMIN" as const : undefined,
        noFee: Boolean(row.noFee),
        makeupOf: row.makeupOf ? String(row.makeupOf) : undefined,
        attendanceSubmittedAt: /^\d{4}-\d{2}-\d{2}T/.test(text(row.attendanceSubmittedAt)) ? text(row.attendanceSubmittedAt) : undefined,
        hasHomework: Boolean(row.hasHomework),
        assessmentColumns,
        attendanceColumnOrder,
        attendance: (Array.isArray(row.attendance) ? row.attendance : []).slice(0, 200).map((item) => ({
          studentId: text(item.studentId),
          status: ["PRESENT", "ABSENT", "EXCUSED"].includes(String(item.status)) ? item.status as DemoAttendanceStatus : null,
          firstStatus: ["PRESENT", "ABSENT", "EXCUSED"].includes(String(item.firstStatus)) ? item.firstStatus as DemoAttendanceStatus : null,
          late: Boolean(item.late),
          lessonRating: ["A_PLUS", "A", "A_MINUS", "B"].includes(String(item.lessonRating)) ? item.lessonRating as DemoLessonRating : null,
          homeworkRating: ["FULL_100", "EIGHTY_80", "BELOW_50", "ZERO_0"].includes(String(item.homeworkRating)) ? item.homeworkRating as DemoHomeworkRating : null,
          pronunciationVideoDone: Boolean(item.pronunciationVideoDone),
          worksheetDone: Boolean(item.worksheetDone),
          vocabularyScore: assessmentText(item.vocabularyScore),
          assessmentScores: Object.fromEntries(
            Object.entries(item.assessmentScores && typeof item.assessmentScores === "object" ? item.assessmentScores : {})
              .slice(0, 12)
              .map(([key, value]) => [text(key).slice(0, 80), assessmentText(value)] as const)
              .filter(([key, value]) => key && value !== null),
          ),
          note: text(item.note).slice(0, 300),
        })).filter((item) => item.studentId),
      };
    })
    .filter((row) => row.classId && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && /^\d{2}:\d{2}$/.test(row.startTime) && /^\d{2}:\d{2}$/.test(row.endTime) && row.startTime < row.endTime);
}

function cleanFinanceForecasts(value: unknown): DemoFinanceForecast[] {
  const text = (input: unknown, max = 300) => typeof input === "string" ? input.trim().slice(0, max) : "";
  const date = (input: unknown) => {
    const value = text(input, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  };
  return (Array.isArray(value) ? value.slice(0, 2000) : [])
    .map((row) => row as Partial<DemoFinanceForecast>)
    .map((row): DemoFinanceForecast => ({
      id: text(row.id, 80) || `forecast-${crypto.randomUUID()}`,
      kind: row.kind === "OUT" ? "OUT" : "IN",
      category: text(row.category, 80),
      description: text(row.description, 500),
      amount: Math.max(0, Math.min(1_000_000_000_000, Math.round(Number(row.amount) || 0))),
      dueDate: date(row.dueDate),
      status: row.status === "SETTLED" ? "SETTLED" : "PLANNED",
      branchId: text(row.branchId, 80) || undefined,
      createdAt: text(row.createdAt, 40) || undefined,
      updatedAt: text(row.updatedAt, 40) || undefined,
      settledAt: text(row.settledAt, 40) || undefined,
    }))
    .filter((row) => row.category && row.description && row.amount > 0 && row.dueDate);
}

function cleanPeriodicReports(value: unknown): DemoPeriodicReport[] {
  const text = (input: unknown, max = 300) => typeof input === "string" ? input.trim().slice(0, max) : "";
  const date = (input: unknown) => {
    const value = text(input, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  };
  const score = (input: unknown) => {
    if (input === "" || input === null || input === undefined) return null;
    const value = Number(input);
    return Number.isFinite(value) && value >= 0 && value <= 10 ? Math.round(value * 10) / 10 : null;
  };
  return (Array.isArray(value) ? value.slice(0, 20_000) : [])
    .map((row) => row as Partial<DemoPeriodicReport>)
    .map((row): DemoPeriodicReport => {
      const scores = row.scores && typeof row.scores === "object" ? row.scores : {} as DemoPeriodicReport["scores"];
      const skillComments = row.skillComments && typeof row.skillComments === "object" ? row.skillComments : {} as DemoPeriodicReport["skillComments"];
      const updatedAt = text(row.updatedAt, 40);
      return {
        id: text(row.id) || `periodic-report-${crypto.randomUUID()}`,
        classId: text(row.classId),
        studentId: text(row.studentId),
        periodType: row.periodType === "MONTHLY" ? "MONTHLY" : "COURSE",
        periodKey: text(row.periodKey),
        periodLabel: text(row.periodLabel),
        fromDate: date(row.fromDate),
        toDate: date(row.toDate),
        scores: {
          listening: score(scores.listening),
          speaking: score(scores.speaking),
          reading: score(scores.reading),
          writing: score(scores.writing),
        },
        attitudeComment: text(row.attitudeComment, 2000),
        skillComments: {
          listening: text(skillComments.listening, 1000),
          speaking: text(skillComments.speaking, 1000),
          reading: text(skillComments.reading, 1000),
          writing: text(skillComments.writing, 1000),
        },
        comment: text(row.comment, 2000),
        updatedAt: Number.isNaN(Date.parse(updatedAt)) ? "" : updatedAt,
        updatedBy: text(row.updatedBy),
      };
    })
    .filter((row) => row.classId && row.studentId && row.periodKey && row.periodLabel && row.fromDate && row.toDate && row.fromDate <= row.toDate);
}

function lessonSessionIdentity(row: Pick<DemoLessonSession, "classId" | "date" | "startTime" | "recurrenceKey">) {
  return row.recurrenceKey || `${row.classId}|${row.date}|${row.startTime}`;
}

interface AttendanceGradeClearIntent {
  studentId: string;
  vocabulary: boolean;
  assessmentColumnIds: string[];
}

/** Thứ tự cũ bị lỗi: cột điểm nối sau "note" ([…, note, assessment:…]) → đưa note về cuối. */
function repairColumnOrder(order: string[]) {
  const noteIndex = order.indexOf("note");
  if (noteIndex < 0 || noteIndex === order.length - 1) return [...order];
  const tail = order.slice(noteIndex + 1);
  if (!tail.every((key) => key.startsWith("assessment:"))) return [...order];
  return [...order.slice(0, noteIndex), ...tail, "note"];
}

// A teacher may keep an attendance page open while another save adds grades.
// Merge against the latest stored session so a later clip-only save cannot erase them.
function mergeLessonSessionUpsert(
  existing: DemoLessonSession,
  incoming: DemoLessonSession,
  clearIntents: AttendanceGradeClearIntent[],
  removedAssessmentColumnIds: string[],
): DemoLessonSession {
  const removedColumns = new Set(removedAssessmentColumnIds);
  const assessmentColumns = (incoming.assessmentColumns || []).filter((column) => !removedColumns.has(column.id));
  const knownColumns = new Set(assessmentColumns.map((column) => column.id));
  for (const column of existing.assessmentColumns || []) {
    if (removedColumns.has(column.id) || knownColumns.has(column.id)) continue;
    assessmentColumns.push(column);
    knownColumns.add(column.id);
  }

  const availableColumnKeys = new Set([
    "status",
    "clip",
    "worksheet",
    "vocabulary",
    ...assessmentColumns.map((column) => `assessment:${column.id}`),
    "note",
  ]);
  // Giữ thứ tự giáo viên gửi lên; cột chỉ có trong bản đã lưu (vd. cột điểm trợ giảng
  // vừa thêm) được chèn đúng vị trí tương đối thay vì nối xuống sau "Nhận xét".
  const canonicalKeys = ["status", "clip", "worksheet", "vocabulary", ...assessmentColumns.map((column) => `assessment:${column.id}`), "note"];
  const referenceKeys = repairColumnOrder(existing.attendanceColumnOrder || [])
    .filter((key, index, keys) => availableColumnKeys.has(key) && keys.indexOf(key) === index);
  const attendanceColumnOrder = (incoming.attendanceColumnOrder || [])
    .filter((key, index, keys) => availableColumnKeys.has(key) && keys.indexOf(key) === index);
  for (const key of canonicalKeys) {
    if (attendanceColumnOrder.includes(key)) continue;
    // Ưu tiên vị trí trong bản đã lưu, sau đó vị trí chuẩn: chèn sau cột đứng trước gần nhất đã có.
    const sources = referenceKeys.includes(key) ? [referenceKeys, canonicalKeys] : [canonicalKeys];
    let position = -1;
    for (const source of sources) {
      const at = source.indexOf(key);
      for (let before = at - 1; before >= 0 && position < 0; before -= 1) {
        const found = attendanceColumnOrder.indexOf(source[before]!);
        if (found >= 0) position = found + 1;
      }
      if (position >= 0) break;
    }
    if (key === "note" || position < 0) position = key === "note" ? attendanceColumnOrder.length : 0;
    attendanceColumnOrder.splice(position, 0, key);
  }

  const existingAttendance = new Map((existing.attendance || []).map((row) => [row.studentId, row]));
  const clearByStudent = new Map(clearIntents.map((intent) => [intent.studentId, intent]));
  const attendance = (incoming.attendance || []).map((row) => {
    const kept = existingAttendance.get(row.studentId);
    const clear = clearByStudent.get(row.studentId);
    const assessmentScores = { ...(kept?.assessmentScores || {}), ...(row.assessmentScores || {}) };
    for (const columnId of removedColumns) delete assessmentScores[columnId];
    for (const columnId of clear?.assessmentColumnIds || []) delete assessmentScores[columnId];
    existingAttendance.delete(row.studentId);
    return {
      ...kept,
      ...row,
      vocabularyScore: clear?.vocabulary
        ? null
        : row.vocabularyScore ?? kept?.vocabularyScore ?? null,
      assessmentScores,
    };
  });
  for (const kept of existingAttendance.values()) {
    const assessmentScores = { ...(kept.assessmentScores || {}) };
    for (const columnId of removedColumns) delete assessmentScores[columnId];
    attendance.push({ ...kept, vocabularyScore: kept.vocabularyScore ?? null, assessmentScores });
  }

  return { ...incoming, assessmentColumns, attendanceColumnOrder, attendance };
}

let lessonSessionMutationQueue = Promise.resolve();

async function serializeLessonSessionMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const previous = lessonSessionMutationQueue;
  let release: () => void = () => undefined;
  lessonSessionMutationQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await mutation();
  } finally {
    release();
  }
}

// Trình duyệt không nhận mật khẩu học viên nên bản gửi lên luôn để trống — không tính là thay đổi.
/** Số dòng nhật ký giữ lại (mới nhất trước). */
const AUDIT_LOG_LIMIT = 3000;
const auditReplacer = (key: string, value: unknown) => (key === "loginPassword" ? undefined : value);

type AuditChange = { action: DemoAuditAction; entity: string; entityId: string; summary: string; category?: AuditCategory; details?: AuditDetail[] };

function auditChanges<T extends { id: string }>(before: T[], after: T[], entity: string, label: (row: T) => string, names: AuditNames = {}) {
  const previous = new Map(before.map((row) => [row.id, row]));
  const next = new Map(after.map((row) => [row.id, row]));
  const changes: AuditChange[] = [];
  for (const row of after) {
    const old = previous.get(row.id);
    if (!old) changes.push({ action: "CREATE", entity, entityId: row.id, summary: `Tạo ${label(row)}`, details: auditDetails(entity, {}, row, names) });
    else if (JSON.stringify(old, auditReplacer) !== JSON.stringify(row, auditReplacer) && auditHasMeaningfulChange(entity, old, row)) {
      changes.push({ action: "UPDATE", entity, entityId: row.id, summary: `Cập nhật ${label(row)}`, details: auditDetails(entity, old, row, names) });
    }
  }
  for (const row of before) if (!next.has(row.id)) changes.push({ action: "DELETE", entity, entityId: row.id, summary: `Xóa ${label(row)}`, details: auditDetails(entity, row, {}, names) });
  return changes;
}

/** Bảng tra tên (học viên, giáo viên, lớp, phòng, chi nhánh) cho nhật ký chi tiết; danh sách đã có sẵn thì truyền vào để khỏi đọc lại. */
async function auditNamesFor(env: DemoEnv, preload: { students?: DemoStudent[]; classes?: DemoClass[]; teachers?: DemoTeacher[] } = {}): Promise<AuditNames> {
  try {
    const [students, classes, teachers, settings] = await Promise.all([
      preload.students ? Promise.resolve(preload.students) : env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json"),
      preload.classes ? Promise.resolve(preload.classes) : env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json"),
      preload.teachers ? Promise.resolve(preload.teachers) : env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json"),
      env.STEPS_LMS_DATA.get<DemoSettings>("settings:steps-demo", "json").then((value) => mergeSettings(value)),
    ]);
    return buildAuditNames({ students: students || [], classes: classes || [], teachers: teachers || [], rooms: settings?.rooms || [], branches: settings?.branches || [] });
  } catch {
    return {};
  }
}

/** "buổi học S12 · 13/11/2026 17:00" — nhãn dòng nhật ký của một buổi học. */
function sessionAuditLabel(row: DemoLessonSession, classes?: DemoClass[]) {
  const cls = classes?.find((item) => item.id === row.classId);
  const [y, m, d] = String(row.date || "").split("-");
  return `buổi học ${cls ? `${cls.name || cls.code} · ` : ""}${d && m && y ? `${d}/${m}/${y}` : row.date}${row.startTime ? ` ${row.startTime}` : ""}`;
}

async function writeAudit(
  env: DemoEnv,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
  changes: AuditChange[],
) {
  if (changes.length === 0) return;
  const current = (await env.STEPS_LMS_DATA.get<DemoAuditLog[]>("audit:steps-demo", "json")) ?? defaultAuditLogs();
  const createdAt = new Date().toISOString();
  const entries: DemoAuditLog[] = changes.map((change) => ({
    id: `audit-${crypto.randomUUID()}`,
    createdAt,
    userName: actor.name,
    userEmail: actor.email,
    role: actor.role,
    action: change.action,
    entity: change.entity,
    entityId: change.entityId,
    summary: change.summary,
    category: auditCategoryOf(change),
    ...(change.details?.length ? { details: change.details } : {}),
  }));
  await env.STEPS_LMS_DATA.put("audit:steps-demo", JSON.stringify([...entries, ...current].slice(0, AUDIT_LOG_LIMIT)));
}

function studentFinanceView(finance: DemoFinance, studentId: string): DemoFinance {
  const sid = studentId === "student-demo" ? "student-demo-1" : studentId;
  const sepay = mergeSepayLedger(finance.sepay);
  return {
    ...finance,
    debts: finance.debts.filter((row) => row.studentId === sid),
    forecasts: [],
    sepay: {
      ...sepay,
      receivables: sepay.receivables.filter((row) => row.studentId === sid),
      paymentOrders: sepay.paymentOrders.filter((row) => row.studentId === sid),
      payments: sepay.payments.filter((row) => row.studentId === sid),
      receipts: sepay.receipts.filter((row) => row.studentId === sid),
      invoices: sepay.invoices.filter((row) => row.studentId === sid),
      credits: sepay.credits.filter((row) => row.studentId === sid),
      bankTransactions: [],
      webhookLogs: [],
    },
  };
}

// Chống mất data do ghi đè đồng thời: các request khác (điểm danh, chuyển lớp,
// thu học phí) đều ghi lại TOÀN BỘ mảng students từ snapshot đọc lúc đầu request,
// nên một PUT /api/students chạy 30s có thể bị đè mất thay đổi. Helper này nối
// tiếp các lần ghi, đọc lại bản mới nhất trong DB rồi merge trước khi ghi:
// - writer thường: field hồ sơ lấy từ bản mới nhất, field tính toán giữ kết quả vừa tính.
// - adminEdit (PUT /api/students): hồ sơ lấy từ bản admin gửi, field tính toán
//   lấy bản mới nhất nếu admin không sửa (3-way merge so với previous).
const STUDENT_PROFILE_KEYS = [
  "id", "code", "fullName", "phone", "address", "school",
  "parentZalo", "parentPhone1", "parentPhone2", "status",
  "dateOfBirth", "parentName", "note", "loginEmail", "loginPassword",
];
/**
 * Số buổi tồn phổ biến nhất của các thành viên lớp (ngoại trừ `excludeIds`).
 * Dùng để seed số dư cho học viên mới vào lớp/chuyển lớp — học phí đồng bộ
 * theo các bạn thay vì mặc định từ đầu. Bỏ qua thành viên chưa có số dư.
 */
function classPeerSessionBalance(
  cls: Pick<DemoClass, "id" | "studentIds">,
  excludeIds: Set<string>,
  students: DemoStudent[],
): number | undefined {
  const studentById = new Map(students.map((row) => [row.id, row]));
  const counts = new Map<number, number>();
  for (const memberId of cls.studentIds || []) {
    if (excludeIds.has(memberId)) continue;
    const raw = studentById.get(memberId)?.sessionBalances?.[cls.id];
    if (raw === undefined || raw === null || String(raw) === "") continue;
    const value = Math.round(Number(raw));
    if (Number.isFinite(value)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

let studentsWriteQueue: Promise<unknown> = Promise.resolve();

function persistStudentsMerged(
  env: DemoEnv,
  computed: DemoStudent[],
  opts: { adminEdit?: boolean; previous?: DemoStudent[] } = {},
): Promise<void> {
  const run = studentsWriteQueue.then(async () => {
    const latest = (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? [];
    const latestById = new Map(latest.map((s) => [s.id, s]));
    const prevById = new Map((opts.previous ?? []).map((s) => [s.id, s]));
    const merged = computed.map((s) => {
      const l = latestById.get(s.id);
      if (!l) return s;
      const out = { ...s } as unknown as Record<string, unknown>;
      const lr = l as unknown as Record<string, unknown>;
      if (!opts.adminEdit) {
        for (const k of STUDENT_PROFILE_KEYS) if (lr[k] !== undefined) out[k] = lr[k];
        return out as unknown as DemoStudent;
      }
      const base = prevById.get(s.id) as unknown as Record<string, unknown> | undefined;
      const keys = new Set([...Object.keys(lr), ...Object.keys(s as unknown as Record<string, unknown>)]);
      for (const k of keys) {
        if (JSON.stringify(out[k]) === JSON.stringify(base?.[k])) out[k] = lr[k];
      }
      return out as unknown as DemoStudent;
    });
    for (const l of latest) {
      const isNew = !prevById.has(l.id);
      if (!computed.some((s) => s.id === l.id) && (!opts.adminEdit || isNew)) merged.push(l);
    }
    // Mật khẩu Portal: ô trống giữ mật khẩu đang lưu (trình duyệt không bao giờ nhận mật khẩu), chữ thường thì băm.
    for (let index = 0; index < merged.length; index += 1) {
      const row = merged[index]!;
      const loginPassword = await resolveStudentPassword(row.loginPassword, latestById.get(row.id)?.loginPassword, row.loginEmail);
      if (loginPassword !== row.loginPassword) merged[index] = { ...row, loginPassword };
    }
    await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(merged));
  });
  studentsWriteQueue = run.catch(() => undefined);
  return run;
}

async function withSeptemberSessionBalances(
  env: DemoEnv,
  students: DemoStudent[],
  classes?: DemoClass[] | null,
  sessions?: DemoLessonSession[] | null,
  finance?: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(SESSION_BALANCE_MIGRATION_KEY, "json");
  if (done) return students;
  const classRows = cleanClasses(classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const sessionRows = cleanLessonSessions(
    sessions ?? (await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions(),
  );
  const book = hydrateFinance(finance ?? await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"));
  const rebuilt = rebuildSeptemberSessionBalances(students, classRows, sessionRows, mergeSepayLedger(book.sepay));
  await persistStudentsMerged(env, rebuilt);
  await env.STEPS_LMS_DATA.put(SESSION_BALANCE_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return rebuilt;
}

async function withS28NewCourseStart(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(S28_COURSE_MIGRATION_KEY, "json");
  if (done) return classes;
  let changed = false;
  const next = classes.map((cls) => {
    if (!isS28Class(cls) || cls.courseStartDate === S28_NEW_COURSE_START) return cls;
    changed = true;
    return { ...cls, billingMode: "COURSE" as const, courseSessions: 24, courseStartDate: S28_NEW_COURSE_START };
  });
  if (changed) await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  await env.STEPS_LMS_DATA.put(S28_COURSE_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Khóa 1 S12 thực tế có 25 buổi (ngoại lệ): buổi bổ sung 12/07 (CN) trước
 * mốc khai giảng chính 17/07. Neo courseStartDate 17/07 — khóa 1 đủ 24 suất
 * kết thúc đúng 04/10, khóa 2 bắt đầu buổi kế tiếp 09/10. Buổi 12/07 được
 * lưu riêng bởi withS12ExtraSession — nằm trước khai giảng nên web trộn vào
 * bảng khóa 1, đánh số "Buổi 1" (khóa 1 hiển thị 25 buổi) nhưng không tính phí. */
async function withS12CourseFix(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(S12_COURSE_FIX_MIGRATION_KEY, "json");
  if (done) return classes;
  let changed = false;
  const next = classes.map((cls) => {
    if (!isS12Class(cls) || cls.courseStartDate === S12_COURSE_START_DATE) return cls;
    changed = true;
    return { ...cls, courseStartDate: S12_COURSE_START_DATE };
  });
  if (changed) await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  await env.STEPS_LMS_DATA.put(S12_COURSE_FIX_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** S13 trước 01/09 chạy T3+T7 (sheet bắt đầu T7 11/07), từ 01/09 đổi sang
 * T3+CN (điểm danh thật trên CN). Buổi nghỉ học vụ 01/09 không chiếm suất
 * khóa: suất T3 cũ kết thúc 31/08, suất T3 mới chỉ áp từ 02/09 — khóa 1 đủ
 * 24 buổi học thật kết thúc 04/10, khóa 2 bắt đầu 06/10, phiếu khóa 2 giữ
 * đúng kỳ thu T10. */
async function withS13ScheduleFix(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(S13_SCHEDULE_MIGRATION_KEY, "json");
  if (done) return classes;
  let changed = false;
  const next = classes.map((cls) => {
    if (!isS13Class(cls)) return cls;
    const already = (cls.schedules || []).some((slot) => slot.weekday === 2 && slot.effectiveFrom === "2026-09-02");
    if (already && cls.courseStartDate === S13_NEW_COURSE_START) return cls;
    changed = true;
    const sunday = (cls.schedules || []).find((slot) => slot.weekday === 0);
    const tuesday = (cls.schedules || []).find((slot) => slot.weekday === 2);
    return {
      ...cls,
      courseStartDate: S13_NEW_COURSE_START,
      schedules: [
        { ...(tuesday || { weekday: 2, periodId: "period-import-1700-1900", startTime: "17:00", endTime: "19:00" }), effectiveTo: "2026-08-31" },
        { weekday: 6, periodId: sunday?.periodId || "period-import-1500-1700", startTime: sunday?.startTime || "15:00", endTime: sunday?.endTime || "17:00", effectiveTo: "2026-08-31" },
        { ...(tuesday || { weekday: 2, periodId: "period-import-1700-1900", startTime: "17:00", endTime: "19:00" }), effectiveFrom: "2026-09-02" },
        { ...(sunday || { weekday: 0, periodId: "period-import-1500-1700", startTime: "15:00", endTime: "17:00" }), effectiveFrom: "2026-09-01" },
      ],
    };
  });
  if (changed) await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  await env.STEPS_LMS_DATA.put(S13_SCHEDULE_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** S15 theo sheet: T3 chạy suốt (cắt quanh nghỉ học vụ 01/09 — suất cũ tới
 * 31/08, suất mới từ 02/09), cuối tuần T8 học CN (đến 23/08) rồi chuyển T7 từ
 * 29/08; hai tuần đầu T9 học thêm CN (06/09 + 13/09). Khóa 1 = 24 buổi
 * 11/08→27/10 khớp từng ngày với sheet (buổi 18 = 06/10), nghỉ 01/09 không
 * chiếm suất và cũng không hiện trong bảng khóa. */
async function withS15ScheduleFix(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(S15_SCHEDULE_MIGRATION_KEY, "json");
  if (done) return classes;
  let changed = false;
  const next = classes.map((cls) => {
    if (!isS15Class(cls)) return cls;
    const already = (cls.schedules || []).some((slot) => slot.weekday === 2 && slot.effectiveFrom === "2026-09-02" && !slot.effectiveTo);
    if (already && cls.courseStartDate === S15_COURSE_START) return cls;
    changed = true;
    const tuesday = (cls.schedules || []).find((slot) => slot.weekday === 2);
    const base = { weekday: 2, periodId: tuesday?.periodId || "period-import-1915-2115", startTime: tuesday?.startTime || "19:15", endTime: tuesday?.endTime || "21:15" };
    return {
      ...cls,
      courseStartDate: S15_COURSE_START,
      schedules: [
        { ...base, effectiveTo: "2026-08-31" },
        { weekday: 0, periodId: base.periodId, startTime: base.startTime, endTime: base.endTime, effectiveTo: "2026-08-23" },
        { weekday: 6, periodId: base.periodId, startTime: base.startTime, endTime: base.endTime, effectiveFrom: "2026-08-29" },
        { ...base, effectiveFrom: "2026-09-02" },
        { weekday: 0, periodId: base.periodId, startTime: base.startTime, endTime: base.endTime, effectiveFrom: "2026-09-06", effectiveTo: "2026-09-13" },
      ],
    };
  });
  if (changed) await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  await env.STEPS_LMS_DATA.put(S15_SCHEDULE_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** S17–S45 theo sheet: mỗi lớp khai báo suất theo đoạn hiệu lực (segs) để ngày
 * nghỉ lễ/buổi đổi ngày rơi đúng vị trí — sheet không đếm buổi nghỉ. Một seg
 * {from,to} (inclusive) sinh suất của thứ đó trong khoảng; seg đơn ngày
 * from=to tạo buổi ngoại lệ (đổi lịch 1 hôm). useFrom: mượn giờ/periodId của
 * thứ khác khi lớp chưa có suất cho thứ cần thêm. S22/S28/S34/S43/S44/S45
 * khớp sẵn — không đụng. */
const S17_S45_SCHEDULE_SPECS: {
  id: string;
  start?: string;
  slots: { weekday: number; useFrom?: number; segs: { from?: string; to?: string; periodId?: string; startTime?: string; endTime?: string }[] }[];
}[] = [
  { id: "class-import-s8", slots: [{ weekday: 6, segs: [{ to: "2026-10-09" }, { from: "2026-10-10", periodId: "period-import-0900-1100", startTime: "09:00", endTime: "11:00" }] }] },
  { id: "class-import-s17", start: "2026-08-15", slots: [{ weekday: 2, segs: [{ to: "2026-08-31" }, { from: "2026-09-02" }] }] },
  {
    id: "class-import-s18",
    start: "2026-08-12",
    slots: [
      { weekday: 3, segs: [{ to: "2026-09-01" }, { from: "2026-09-03" }] },
      { weekday: 0, segs: [{ to: "2026-08-29" }, { from: "2026-08-31" }] },
    ],
  },
  { id: "class-import-s19", start: "2026-07-19", slots: [] },
  { id: "class-import-s20", start: "2026-07-28", slots: [{ weekday: 2, segs: [{ to: "2026-08-31" }, { from: "2026-09-02" }] }] },
  { id: "class-import-s21", start: "2026-07-30", slots: [{ weekday: 1, segs: [{ to: "2026-08-30" }, { from: "2026-09-01" }] }] },
  { id: "class-import-s23", slots: [{ weekday: 3, segs: [{ to: "2026-09-01" }, { from: "2026-09-03" }] }] },
  { id: "class-import-s24", start: "2026-07-22", slots: [{ weekday: 3, segs: [{ to: "2026-09-01" }, { from: "2026-09-03" }] }] },
  { id: "class-import-s25", slots: [{ weekday: 1, segs: [{ to: "2026-08-30" }, { from: "2026-09-01" }] }] },
  { id: "class-import-s26", start: "2026-07-20", slots: [{ weekday: 1, segs: [{ to: "2026-08-30" }, { from: "2026-09-01" }] }] },
  { id: "class-import-s27", start: "2026-07-20", slots: [{ weekday: 1, segs: [{ to: "2026-08-30" }, { from: "2026-09-01" }] }] },
  { id: "class-import-s29", start: "2026-08-04", slots: [{ weekday: 2, segs: [{ to: "2026-08-31" }, { from: "2026-09-02" }] }] },
  {
    id: "class-import-s30",
    slots: [
      { weekday: 4, segs: [{ to: "2026-07-23" }, { from: "2026-08-27", to: "2026-09-23" }, { from: "2026-09-25" }] },
      { weekday: 5, useFrom: 4, segs: [{ from: "2026-07-31", to: "2026-08-21" }] },
      { weekday: 6, segs: [{ to: "2026-09-04" }, { from: "2026-09-06", to: "2026-10-09" }] },
      {
        weekday: 0,
        useFrom: 4,
        segs: [
          { from: "2026-09-27", to: "2026-09-27" },
          { from: "2026-10-10", periodId: "period-import-1500-1700", startTime: "15:00", endTime: "17:00" },
        ],
      },
    ],
  },
  {
    id: "class-import-s32",
    start: "2026-08-07",
    slots: [{ weekday: 0, segs: [{ to: "2026-08-29" }, { from: "2026-08-31", to: "2026-09-12" }, { from: "2026-09-14" }] }],
  },
  {
    id: "class-import-s33",
    start: "2026-08-07",
    slots: [{ weekday: 0, segs: [{ to: "2026-08-29" }, { from: "2026-08-31", to: "2026-09-12" }, { from: "2026-09-14" }] }],
  },
  {
    id: "class-import-s35",
    slots: [
      { weekday: 2, segs: [{ to: "2026-08-31" }, { from: "2026-09-02", to: "2026-09-28" }, { from: "2026-09-30" }] },
      { weekday: 0, segs: [{ to: "2026-08-08" }, { from: "2026-08-10", to: "2026-08-29" }, { from: "2026-08-31" }] },
      { weekday: 6, useFrom: 0, segs: [{ from: "2026-08-08", to: "2026-08-08" }, { from: "2026-08-29", to: "2026-08-29" }] },
      { weekday: 1, useFrom: 2, segs: [{ from: "2026-09-28", to: "2026-09-28" }] },
    ],
  },
  { id: "class-import-s36", slots: [{ weekday: 4, segs: [{ to: "2026-08-26" }, { from: "2026-09-04" }] }] },
  {
    id: "class-import-s40",
    start: "2026-07-18",
    slots: [
      { weekday: 1, segs: [{ to: "2026-08-30" }, { from: "2026-09-01", to: "2026-10-04" }, { from: "2026-10-06" }] },
      { weekday: 6, segs: [{ to: "2026-08-28" }, { from: "2026-09-06" }] },
      { weekday: 5, useFrom: 6, segs: [{ from: "2026-08-28", to: "2026-08-28" }] },
      { weekday: 2, useFrom: 1, segs: [{ from: "2026-10-06", to: "2026-10-06" }] },
    ],
  },
  {
    id: "class-import-s41",
    start: "2026-08-02",
    slots: [
      { weekday: 4, segs: [{ from: "2026-08-07", to: "2026-09-23" }, { from: "2026-09-25" }] },
      { weekday: 5, useFrom: 4, segs: [{ from: "2026-08-07", to: "2026-08-07" }] },
      { weekday: 0, segs: [{ to: "2026-08-09" }, { from: "2026-08-17", to: "2026-08-29" }, { from: "2026-08-31" }] },
      { weekday: 6, useFrom: 0, segs: [{ from: "2026-08-15", to: "2026-08-15" }, { from: "2026-08-29", to: "2026-08-29" }] },
    ],
  },
  {
    id: "class-import-s42",
    start: "2026-08-01",
    slots: [
      { weekday: 3, useFrom: 2, segs: [{ to: "2026-09-01" }, { from: "2026-09-03" }] },
      { weekday: 2, segs: [{ from: "2026-10-06", to: "2026-10-06" }] },
    ],
  },
];

function s17S45TargetSchedules(
  cls: DemoClass,
  spec: (typeof S17_S45_SCHEDULE_SPECS)[number],
): DemoScheduleSlot[] {
  const clean = (s: DemoScheduleSlot): DemoScheduleSlot => ({
    weekday: s.weekday,
    periodId: s.periodId,
    startTime: s.startTime,
    endTime: s.endTime,
  });
  const apply = (base: DemoScheduleSlot, weekday: number, segs: { from?: string; to?: string; periodId?: string; startTime?: string; endTime?: string }[]) =>
    segs.map((seg) => ({
      ...clean(base),
      weekday,
      ...(seg.periodId ? { periodId: seg.periodId } : {}),
      ...(seg.startTime ? { startTime: seg.startTime } : {}),
      ...(seg.endTime ? { endTime: seg.endTime } : {}),
      ...(seg.from ? { effectiveFrom: seg.from } : {}),
      ...(seg.to ? { effectiveTo: seg.to } : {}),
    }));
  const byWeekday = new Map(spec.slots.map((s) => [s.weekday, s]));
  const emitted = new Set<number>();
  const schedules: DemoScheduleSlot[] = [];
  for (const slot of cls.schedules || []) {
    const sp = byWeekday.get(slot.weekday);
    if (!sp) {
      schedules.push(clean(slot));
      continue;
    }
    if (emitted.has(slot.weekday)) continue;
    emitted.add(slot.weekday);
    schedules.push(...apply(slot, slot.weekday, sp.segs));
  }
  for (const sp of spec.slots) {
    if (emitted.has(sp.weekday)) continue;
    const src = (cls.schedules || []).find((s) => s.weekday === (sp.useFrom ?? sp.weekday));
    if (!src) continue;
    emitted.add(sp.weekday);
    schedules.push(...apply(src, sp.weekday, sp.segs));
  }
  return schedules;
}

/** S8: suất T7 đổi 07:00–09:00 → 09:00–11:00, hiệu lực từ 10/10/2026. Tìm lớp
 * theo mã/tên "S8" (id trên prod có thể khác bản import nên spec chung trượt),
 * chỉ đụng đúng suất T7 — suất T2 và mọi lớp khác giữ nguyên. Đồng thời dời
 * giờ các buổi học ĐÃ LƯU của S8 từ 10/10 trở đi còn ngồi ở 07:00–09:00 —
 * đúng slot cũ — sang 09:00–11:00 (claimDaySlots render theo giờ session nên
 * chỉ đổi lịch không đủ). Idempotent, chạy lại không nhân đôi. */
async function withS8SaturdayTimeFix(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(S8_SAT_TIME_MIGRATION_KEY, "json");
  if (done) return classes;
  let changed = false;
  const s8Ids = new Set<string>();
  const next = classes.map((cls) => {
    const code = String(cls.code || "").trim().toUpperCase();
    const name = String(cls.name || "").trim().toUpperCase();
    if (cls.id !== "class-import-s8" && code !== "S8" && !name.startsWith("S8-") && !name.startsWith("S8 ")) return cls;
    s8Ids.add(cls.id);
    const schedules = cls.schedules || [];
    const activeSat = schedules.filter((slot) => slot.weekday === 6 && (!slot.effectiveTo || slot.effectiveTo >= "2026-10-10"));
    if (activeSat.some((slot) => slot.startTime === "09:00" && slot.endTime === "11:00")) return cls;
    const old = schedules.find((slot) => slot.weekday === 6 && slot.startTime === "07:00" && (!slot.effectiveTo || slot.effectiveTo >= "2026-10-10")) || activeSat[0];
    if (!old) return cls;
    changed = true;
    return {
      ...cls,
      schedules: [
        ...schedules.filter((slot) => slot !== old),
        { ...old, effectiveTo: "2026-10-09" },
        { weekday: 6, periodId: "period-import-0900-1100", startTime: "09:00", endTime: "11:00", effectiveFrom: "2026-10-10" },
      ],
    };
  });
  if (changed) await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  if (s8Ids.size) {
    const sessions = (await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? [];
    let sessionsChanged = false;
    const nextSessions = sessions.map((item) => {
      if (!s8Ids.has(item.classId) || item.isExtra) return item;
      if (item.date < "2026-10-10" || new Date(`${item.date}T12:00:00`).getDay() !== 6) return item;
      if (item.startTime !== "07:00" || item.endTime !== "09:00") return item;
      sessionsChanged = true;
      return { ...item, startTime: "09:00", endTime: "11:00" };
    });
    if (sessionsChanged) await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(nextSessions));
  }
  await env.STEPS_LMS_DATA.put(S8_SAT_TIME_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

const WAITING_CLASS_ID = "class-waiting";
const WAITING_CLASS_NAME = "Lớp chờ";

function isWaitingClass(cls: DemoClass) {
  return cls.id === WAITING_CLASS_ID || String(cls.name || "").trim() === WAITING_CLASS_NAME;
}

/** "Lớp chờ" — lớp chứa học viên bị xoá khỏi lớp / chưa xếp lớp. Không lịch,
 * không thu phí; học viên ở đây giữ trạng thái UNASSIGNED. */
function waitingClassSeed(): DemoClass {
  return {
    id: WAITING_CLASS_ID, code: "LC", name: WAITING_CLASS_NAME,
    classTypeId: "class-standard", branchId: "", teacherId: "", roomId: "", syllabusId: "",
    status: "ACTIVE", studentIds: [], schedules: [],
    note: "Học viên chờ xếp lớp — tự chuyển về đây khi xoá khỏi lớp.",
    billingMode: "MONTHLY", sessionPrice: 0, courseSessions: 1, billingEnabled: false, materialFees: {},
  };
}

function ensureWaitingClass(classes: DemoClass[]) {
  const existing = classes.find(isWaitingClass);
  if (existing) {
    // Đảm bảo lớp chờ luôn tắt thu phí kể cả khi ai đó tạo tay trước đó.
    if (existing.billingEnabled === false) return { classes, waiting: existing, changed: false };
    const fixed = classes.map((row) => (row === existing ? { ...row, billingEnabled: false } : row));
    return { classes: fixed, waiting: { ...existing, billingEnabled: false }, changed: true };
  }
  const waiting = waitingClassSeed();
  return { classes: [...classes, waiting], waiting, changed: true };
}

/** Học viên mới tạo (thêm tay / nhập Excel) vào thẳng Lớp chờ — bể chờ xếp lớp.
 * Không đặt mốc classJoinedAt của Lớp chờ: mốc đó là "ngày rời lớp" của doanh số. */
async function addStudentsToWaitingClass(env: DemoEnv, studentIds: string[]) {
  const ids = studentIds.filter(Boolean);
  const current = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  if (!ids.length) return current;
  const { classes, waiting } = ensureWaitingClass(current);
  const inRealClass = new Set(classes.filter((row) => !isWaitingClass(row)).flatMap((row) => row.studentIds || []));
  const add = ids.filter((id) => !inRealClass.has(id) && !(waiting.studentIds || []).includes(id));
  if (!add.length && classes === current) return current;
  const next = classes.map((row) => (isWaitingClass(row) ? { ...row, studentIds: [...new Set([...(row.studentIds || []), ...add])] } : row));
  await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  return next;
}

// Chạy mọi lần đọc: "Lớp chờ" bị xoá nhầm thì tự tạo lại, không cần marker.
async function withWaitingClass(env: DemoEnv, classes: DemoClass[]) {
  const ensured = ensureWaitingClass(classes);
  if (ensured.changed) await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(ensured.classes));
  return ensured.classes;
}

async function withS17ToS28ScheduleFix(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(S17_S28_SCHEDULE_MIGRATION_KEY, "json");
  if (done) return classes;
  let changed = false;
  const next = classes.map((cls) => {
    const spec = S17_S45_SCHEDULE_SPECS.find((s) => s.id === cls.id);
    if (!spec) return cls;
    const target = spec.start ?? cls.courseStartDate;
    const schedules = s17S45TargetSchedules(cls, spec);
    if (cls.courseStartDate === target && JSON.stringify(cls.schedules) === JSON.stringify(schedules)) return cls;
    changed = true;
    return { ...cls, courseStartDate: target, schedules };
  });
  if (changed) await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  await env.STEPS_LMS_DATA.put(S17_S28_SCHEDULE_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

async function withT2RosterCorrection(env: DemoEnv, classes: DemoClass[], students?: DemoStudent[] | null) {
  const done = await env.STEPS_LMS_DATA.get<string>(T2_ROSTER_CORRECTION_MIGRATION_KEY, "json");
  if (done) return classes;
  const studentRows = cleanStudents(
    students ?? (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents(),
  );
  const next = removeMyTamFromT2(classes, studentRows);
  if (JSON.stringify(next) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  }
  await env.STEPS_LMS_DATA.put(T2_ROSTER_CORRECTION_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Bật thu học phí tự động cho mọi lớp — qua kỳ mới phiếu tự sinh qua
 * syncTuitionReceivables, không cần bấm tạo từng lớp. */
async function withAutoBillingAllClasses(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(AUTO_BILLING_MIGRATION_KEY, "json");
  if (done) return classes;
  const next = classes.map((cls) => (cls.billingEnabled === false ? { ...cls, billingEnabled: true } : cls));
  if (JSON.stringify(next) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  }
  await env.STEPS_LMS_DATA.put(AUTO_BILLING_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Suất CN của T7 chỉ áp dụng từ ngày đổi lịch 07/09 — vá lịch, không đụng phí/điểm danh. */
async function withT7ScheduleEffectiveFrom(env: DemoEnv, classes: DemoClass[]) {
  const done = await env.STEPS_LMS_DATA.get<string>(T7_SCHEDULE_MIGRATION_KEY, "json");
  if (done) return classes;
  const next = t7ScheduleEffectiveFrom(classes);
  if (JSON.stringify(next) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next));
  }
  await env.STEPS_LMS_DATA.put(T7_SCHEDULE_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Vá lịch tháng 9 của T7/T8: buổi ảo 4/9 thành nghỉ học vụ, 13/9 & 23/9 thành
 * GV nghỉ đã bù, tạo buổi bù 19/9 & 29/9 copy điểm danh — học phí net-0. */
async function withT7T8SeptemberSessions(
  env: DemoEnv,
  sessions: DemoLessonSession[],
  classes?: DemoClass[] | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(T7_T8_MAKEUP_MIGRATION_KEY, "json");
  if (done) return sessions;
  const classRows = cleanClasses(
    classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses(),
  );
  const next = t7t8SeptemberMakeupSessions(sessions, classRows);
  if (JSON.stringify(next) !== JSON.stringify(sessions)) {
    await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(next));
  }
  await env.STEPS_LMS_DATA.put(T7_T8_MAKEUP_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Buổi ngoại lệ S12 ngày 12/07 (CN): lớp khai giảng sớm một tuần trước mốc
 * courseStartDate 17/07 — ghi buổi thêm Hoàn thành vào khung CN 07:15–09:15.
 * Không chiếm suất khóa: khóa 1 vẫn 24 buổi kết thúc 04/10, khóa 2 từ 09/10. */
async function withS12ExtraSession(
  env: DemoEnv,
  sessions: DemoLessonSession[],
  classes?: DemoClass[] | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(S12_EXTRA_SESSION_MIGRATION_KEY, "json");
  if (done) return sessions;
  const classRows = cleanClasses(
    classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses(),
  );
  const cls = classRows.find((item) => isS12Class(item));
  if (!cls) {
    await env.STEPS_LMS_DATA.put(S12_EXTRA_SESSION_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return sessions;
  }
  const sundaySlot = (cls.schedules || []).find((slot) => slot.weekday === 0);
  const existing = sessions.find((item) => item.classId === cls.id && item.date === S12_EXTRA_SESSION_DATE);
  const next = existing
    ? sessions.map((item) => item === existing ? { ...item, isExtra: true } : item)
    : [...sessions, {
      id: `session-extra-s12-${S12_EXTRA_SESSION_DATE}`,
      classId: cls.id,
      date: S12_EXTRA_SESSION_DATE,
      startTime: sundaySlot?.startTime || "07:15",
      endTime: sundaySlot?.endTime || "09:15",
      teacherId: cls.teacherId,
      roomId: cls.roomId,
      status: "COMPLETED" as const,
      isExtra: true,
      recurrenceKey: "",
      note: "Buổi bổ sung đầu khóa 1",
      isOff: false,
      hasHomework: false,
      attendance: [],
    }];
  if (next !== sessions) await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(next));
  await env.STEPS_LMS_DATA.put(S12_EXTRA_SESSION_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Cập nhật hồ sơ lớp S43 theo Excel: chỉ điền trường còn trống của học viên
 * hiện có, tạo hồ sơ mới cho bạn chưa có và xếp vào lớp — không đụng lớp khác,
 * không ghi đè dữ liệu web đã có. */
async function withS43RosterInfo(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
): Promise<{ students: DemoStudent[]; classes: DemoClass[] }> {
  const done = await env.STEPS_LMS_DATA.get<string>(S43_ROSTER_INFO_MIGRATION_KEY, "json");
  if (done) return { students, classes };
  const next = s43RosterInfoCorrection(students, classes);
  if (JSON.stringify(next.students) !== JSON.stringify(students)) {
    await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(next.students));
  }
  if (JSON.stringify(next.classes) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next.classes));
  }
  await env.STEPS_LMS_DATA.put(S43_ROSTER_INFO_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Điền trường còn trống theo Excel cho học viên S45, sửa chính tả tên,
 * tạo Hoàng Trọng Đức Anh (HV1014) và xếp vào lớp. Chạy 1 lần, idempotent. */
async function withS45RosterInfo(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
): Promise<{ students: DemoStudent[]; classes: DemoClass[] }> {
  const done = await env.STEPS_LMS_DATA.get<string>(S45_ROSTER_INFO_MIGRATION_KEY, "json");
  if (done) return { students, classes };
  const next = s45RosterInfoCorrection(students, classes);
  if (JSON.stringify(next.students) !== JSON.stringify(students)) {
    await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(next.students));
  }
  if (JSON.stringify(next.classes) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next.classes));
  }
  await env.STEPS_LMS_DATA.put(S45_ROSTER_INFO_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Trần Đức Nam đã nghỉ — xoá hoàn toàn: gỡ khỏi hồ sơ, roster mọi lớp, điểm
 * danh; hủy phiếu chưa thu + đơn QR treo. Biên lai tiền thật vẫn giữ. */
async function withS43WithdrawnPurge(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; classes: DemoClass[]; sessions: DemoLessonSession[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(S43_WITHDRAWN_MIGRATION_KEY, "json");
  if (done) return { students, classes, sessions, finance };
  const next = purgeWithdrawnStudent(S43_WITHDRAWN_STUDENT_ID, { students, classes, sessions, finance });
  if (JSON.stringify(next.students) !== JSON.stringify(students)) {
    await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(next.students));
  }
  if (JSON.stringify(next.classes) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next.classes));
  }
  if (JSON.stringify(next.sessions) !== JSON.stringify(sessions)) {
    await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(next.sessions));
  }
  if (JSON.stringify(next.finance) !== JSON.stringify(finance)) {
    await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(next.finance));
  }
  await env.STEPS_LMS_DATA.put(S43_WITHDRAWN_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Roster S43: gỡ 3 bạn xếp nhầm (Bảo Trâm/Tú Uyên/Nguyên Khang — chỉ khỏi
 * S43, lớp khác giữ), đưa Anh Đức/Trâm Anh/Khánh Ngọc vào lớp; hủy phiếu S43
 * chưa thu của các bạn bị gỡ. Chạy 1 lần, idempotent. */
async function withS43RosterSwap(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; classes: DemoClass[]; sessions: DemoLessonSession[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(S43_ROSTER_SWAP_MIGRATION_KEY, "json");
  if (done) return { students, classes, sessions, finance };
  const next = s43RosterSwapCorrection({ students, classes, sessions, finance });
  if (JSON.stringify(next.students) !== JSON.stringify(students)) {
    await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(next.students));
  }
  if (JSON.stringify(next.classes) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next.classes));
  }
  if (JSON.stringify(next.sessions) !== JSON.stringify(sessions)) {
    await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(next.sessions));
  }
  if (JSON.stringify(next.finance) !== JSON.stringify(finance)) {
    await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(next.finance));
  }
  await env.STEPS_LMS_DATA.put(S43_ROSTER_SWAP_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Xuân Khoa (HV0174) xếp nhầm S12 — sheet báo phí khóa 2 đặt bạn ở S13:
 * chuyển roster, hủy phiếu S12 khóa 2 chưa thu; phiếu S13 khóa 2 tự lập. */
async function withS12S13XuanKhoaMove(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; classes: DemoClass[]; sessions: DemoLessonSession[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(S12_S13_ROSTER_SWAP_MIGRATION_KEY, "json");
  if (done) return { students, classes, sessions, finance };
  const next = s12S13RosterSwapCorrection({ students, classes, sessions, finance });
  if (JSON.stringify(next.students) !== JSON.stringify(students)) {
    await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(next.students));
  }
  if (JSON.stringify(next.classes) !== JSON.stringify(classes)) {
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(next.classes));
  }
  if (JSON.stringify(next.finance) !== JSON.stringify(finance)) {
    await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(next.finance));
  }
  await env.STEPS_LMS_DATA.put(S12_S13_ROSTER_SWAP_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Vá các ca chuyển lớp đã xảy ra trước khi có "mốc vào lớp = đầu kỳ đang chạy"
 * và phiếu transfer 0đ: nhận diện qua nhật ký Finance "chuyển A→B", đưa mốc
 * vào lớp đích về buổi đầu của khóa tại ngày chuyển (công nợ/buổi đã qua y
 * như các bạn cùng lớp) và bảo đảm còn phiếu "transfer|…" làm dấu bao phủ —
 * sync sau đó tự hủy phiếu kỳ chuyển của lớp đích bị lập trùng. */
async function withTransferAnchorRepair(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(TRANSFER_ANCHOR_MIGRATION_KEY, "json");
  if (done) return { students, finance };
  const audits = (await env.STEPS_LMS_DATA.get<DemoAuditLog[]>("audit:steps-demo", "json")) ?? [];
  const now = new Date();
  const classByLabel = new Map<string, DemoClass>();
  for (const cls of classes) {
    if (cls.code) classByLabel.set(cls.code, cls);
    if (cls.name) classByLabel.set(cls.name, cls);
  }
  const studentById = new Map(students.map((row) => [row.id, row]));
  const joinPatch = new Map<string, Record<string, string>>();
  const ledger = finance ? mergeSepayLedger(finance.sepay) : null;
  const markers: SepayReceivable[] = [];
  const seenPairs = new Set<string>();
  for (const entry of audits) {
    if (entry.entity !== "Finance") continue;
    const match = /chuyển (.+?)→(.+?):/.exec(entry.summary || "");
    if (!match) continue;
    const student = studentById.get(entry.entityId);
    const source = classByLabel.get(match[1].trim());
    const target = classByLabel.get(match[2].trim());
    if (!student || !source || !target) continue;
    const pairKey = `${student.id}|${target.id}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    if (!(target.studentIds || []).includes(student.id)) continue;
    const joinDate = studentClassJoinDate(student, target.id);
    if (!joinDate) continue;
    const isCourse = classBillingMode(target) === "COURSE";
    const transferIndex = isCourse ? classCourseIndexOfDate(target, joinDate, sessions) : 0;
    // Mốc đúng = buổi đầu của khóa tại ngày chuyển — đặt lại để công nợ/buổi
    // đã qua của bạn tính y như học viên gốc của lớp (lớp tháng đã đúng sẵn
    // vì joinAnchor tháng là ngày 1 từ đầu).
    if (isCourse) {
      const windowStart = classCourseSessionsForCourse(target, sessions, transferIndex, now)[0]?.date;
      if (windowStart && windowStart !== joinDate) {
        joinPatch.set(student.id, { ...(joinPatch.get(student.id) || {}), [target.id]: windowStart });
      }
    }
    // Các ca chuyển có chênh lệch 0đ trước đây không lập phiếu "transfer|…" —
    // thiếu dấu bao phủ nên lớp đích lập phiếu trùng kỳ chuyển. Bù phiếu 0đ
    // trạng thái Đã thu: chỉ là chứng từ điều chỉnh, không phát sinh công nợ.
    if (ledger) {
      const hasMarker = ledger.receivables.some((row) => (
        row.studentId === student.id && row.classId === target.id && row.status !== "CANCELLED" && isTransferBillKey(row.billKey)
      ));
      if (!hasMarker) {
        const anchor = isCourse
          ? `course${transferIndex + 1}`
          : (() => { const [yy, mm] = joinDate.slice(0, 7).split("-").map(Number); return `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`; })();
        const sourceLabel = source.code || source.name;
        const targetLabel = target.code || target.name;
        const anchorLabel = isCourse
          ? `Khóa ${transferIndex + 1}`
          : `kỳ ${anchor.slice(5, 7)}/${anchor.slice(0, 4)}`;
        markers.push({
          id: `recv-${crypto.randomUUID()}`,
          receivableCode: `CL${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
          studentId: student.id,
          studentName: student.fullName,
          billingPeriod: `Chênh lệch chuyển lớp ${sourceLabel}→${targetLabel} · ${anchorLabel}`,
          issueDate: String(entry.createdAt || "").slice(0, 10) || now.toISOString().slice(0, 10),
          dueDate: String(entry.createdAt || "").slice(0, 10) || now.toISOString().slice(0, 10),
          amountDue: 0,
          amountPaid: 0,
          balanceDue: 0,
          currency: "VND",
          status: "PAID",
          paymentOrderId: "",
          classId: target.id,
          billKey: transferBillKey(target.id, source.id, anchor),
        });
      }
    }
  }
  const classById = new Map(classes.map((row) => [row.id, row]));
  const nextStudents = joinPatch.size
    ? students.map((row) => {
      const patch = joinPatch.get(row.id);
      if (!patch) return row;
      const patched = { ...row, classJoinedAt: { ...(row.classJoinedAt || {}), ...patch } };
      // Số dư lưu sẵn của lớp đích phải khớp mốc mới — tính lại bằng cùng cơ
      // chế hiển thị (courseRemainingSessions đọc mốc vào lớp).
      const sessionBalances = { ...(patched.sessionBalances || {}) };
      for (const classId of Object.keys(patch)) {
        const cls = classById.get(classId);
        if (cls && classBillingMode(cls) === "COURSE") {
          sessionBalances[classId] = courseRemainingSessions(patched, cls, sessions, ledger ?? undefined, now);
        }
      }
      return { ...patched, sessionBalances };
    })
    : students;
  const nextFinance = ledger && markers.length
    ? { ...finance!, sepay: { ...ledger, receivables: [...markers, ...ledger.receivables] } }
    : finance;
  if (nextStudents !== students) await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(nextStudents));
  if (nextFinance !== finance) await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await env.STEPS_LMS_DATA.put(TRANSFER_ANCHOR_MIGRATION_KEY, JSON.stringify(now.toISOString()));
  return { students: nextStudents, finance: nextFinance };
}

/** Đồng bộ lại phiếu đang mở của đúng một lớp sau khi trạng thái nghỉ/buổi bù
 * của GV đổi — tín dụng buổi nghỉ vừa tăng/giảm nên số tiền phiếu tháng tới
 * phải cập nhật ngay, không chờ tới lần lưu hàng loạt kế tiếp. */
async function resyncClassTuitionBills(
  env: DemoEnv,
  classId: string,
  classes: DemoClass[],
  students: DemoStudent[],
  sessions: DemoLessonSession[],
) {
  const snapshot = await readFinanceSnapshot(env);
  const ledger = mergeSepayLedger(snapshot.finance.sepay);
  // sync sửa trực tiếp các dòng sổ đọc từ KV — dùng bản sao để so sánh trước/sau.
  const synced = syncTuitionReceivables(
    mergeSepayLedger(JSON.parse(JSON.stringify(snapshot.finance.sepay)) as DemoFinance["sepay"]),
    classes,
    students,
    sessions,
  );
  const syncedRecv = new Map(synced.receivables.map((row) => [row.id, row]));
  const origIds = new Set(ledger.receivables.map((row) => row.id));
  const changedIds = new Set<string>();
  const receivables = ledger.receivables.map((row) => {
    if (row.classId !== classId) return row;
    const next = syncedRecv.get(row.id);
    if (!next || JSON.stringify(next) === JSON.stringify(row)) return row;
    changedIds.add(row.id);
    return next;
  });
  for (const row of synced.receivables) {
    if (row.classId === classId && !origIds.has(row.id)) { receivables.push(row); changedIds.add(row.id); }
  }
  if (!changedIds.size) return;
  const orderIds = new Set(receivables.filter((row) => changedIds.has(row.id)).map((row) => row.paymentOrderId).filter(Boolean));
  const syncedOrders = new Map(synced.paymentOrders.map((row) => [row.id, row]));
  const paymentOrders = ledger.paymentOrders.map((row) => {
    if (!orderIds.has(row.id)) return row;
    return syncedOrders.get(row.id) || row;
  });
  for (const row of synced.paymentOrders) {
    if (orderIds.has(row.id) && !ledger.paymentOrders.some((orig) => orig.id === row.id)) paymentOrders.push(row);
  }
  await persistFinanceIfUnchanged(env, snapshot.stored, syncTuitionCashbook({ ...snapshot.finance, sepay: { ...ledger, receivables, paymentOrders } }));
}

/** Phần chung của các migration vá lớp thu khóa theo ca riêng: tính lại số dư
 * buổi lưu sẵn của roster theo mốc mới + mang phần thay đổi phiếu của đúng
 * lớp đó từ bản sync về (các lớp khác giữ nguyên byte). Sửa trực tiếp trên
 * object trong mảng students để các bước bootstrap sau dùng chung tham chiếu. */
async function persistScopedCourseRepair(
  env: DemoEnv,
  cls: DemoClass,
  classes: DemoClass[],
  students: DemoStudent[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const now = new Date();
  const ledger = finance ? mergeSepayLedger(finance.sepay) : null;
  let studentsChanged = false;
  for (const row of students) {
    if (!(cls.studentIds || []).includes(row.id)) continue;
    const remaining = courseRemainingSessions(row, cls, sessions, ledger, now);
    const stored = Math.round(Number(row.sessionBalances?.[cls.id]) || 0);
    if (stored === remaining && row.sessionBalances?.[cls.id] !== undefined) continue;
    row.sessionBalances = { ...(row.sessionBalances || {}), [cls.id]: remaining };
    studentsChanged = true;
  }
  if (studentsChanged) await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(students));
  if (!finance || !ledger) return;
  const synced = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classes, students, sessions);
  const syncedRecv = new Map(synced.receivables.map((row) => [row.id, row]));
  const origIds = new Set(ledger.receivables.map((row) => row.id));
  let changed = false;
  const receivables = ledger.receivables.map((row) => {
    if (row.classId !== cls.id) return row;
    const next = syncedRecv.get(row.id);
    if (!next || JSON.stringify(next) === JSON.stringify(row)) return row;
    changed = true;
    return next;
  });
  for (const row of synced.receivables) {
    if (row.classId === cls.id && !origIds.has(row.id)) { receivables.push(row); changed = true; }
  }
  const orderIds = new Set(receivables.map((row) => row.paymentOrderId).filter(Boolean));
  const syncedOrders = new Map(synced.paymentOrders.map((row) => [row.id, row]));
  const paymentOrders = ledger.paymentOrders.map((row) => {
    if (!orderIds.has(row.id)) return row;
    const next = syncedOrders.get(row.id);
    if (!next || JSON.stringify(next) === JSON.stringify(row)) return row;
    changed = true;
    return next;
  });
  for (const row of synced.paymentOrders) {
    if (orderIds.has(row.id) && !ledger.paymentOrders.some((orig) => orig.id === row.id)) { paymentOrders.push(row); changed = true; }
  }
  if (changed) {
    await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(syncTuitionCashbook({ ...finance, sepay: { ...ledger, receivables, paymentOrders } })));
  }
}

/** S19 thực tế thu 20 buổi/khóa: khóa 1 = 19/07→24/09, khóa 2 bắt đầu 27/09
 * (buổi 11/10 là buổi 5 của khóa 2). Dữ liệu đang ghi 24 buổi/khóa nên khóa 2
 * trôi mốc tới 11/10 và 13 phiếu khóa 2 phát hành sai 1.560.000đ (đúng là
 * 1.300.000đ = 20×65.000). Đưa courseSessions về 20 — khóa 1 tự kết thúc
 * 24/09, khóa 2 tự neo 27/09; đồng bộ lại phiếu ngay trong migration (các
 * phiếu đều OPEN/chưa thu/chưa chốt nên sync ghi đè amountDue + QR an toàn)
 * và tính lại số dư buổi lưu sẵn theo mốc mới. Sửa trực tiếp trên object
 * trong mảng để mọi bước bootstrap phía sau dùng chung tham chiếu classes. */
async function withS19CourseSessionsFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(S19_COURSE_SESSIONS_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  const cls = classes.find((row) => isS19Class(row));
  if (!cls) {
    await env.STEPS_LMS_DATA.put(S19_COURSE_SESSIONS_MIGRATION_KEY, JSON.stringify(now.toISOString()));
    return;
  }
  if (cls.courseSessions !== 20) {
    cls.courseSessions = 20;
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(classes));
  }
  await persistScopedCourseRepair(env, cls, classes, students, sessions, finance);
  await env.STEPS_LMS_DATA.put(S19_COURSE_SESSIONS_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/** S19 giữ khóa 1 đã chốt 20 buổi (đã thu đúng 20×65.000), từ khóa 2 trở đi
 * gói mới 24 buổi. courseSessions = 24 cho các khóa sau; khóa 1 được
 * FIRST_COURSE_SESSIONS_OVERRIDES trong tuition-billing neo 20 buổi. Các
 * phiếu khóa 2 OPEN 1.300.000đ (20 buổi) được sync lại thành 1.560.000đ
 * (24×65.000) — mọi phiếu đều chưa thu/chưa chốt nên ghi đè an toàn. */
async function withS19CourseSizesFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(S19_COURSE_SIZES_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  const cls = classes.find((row) => isS19Class(row));
  if (!cls) {
    await env.STEPS_LMS_DATA.put(S19_COURSE_SIZES_MIGRATION_KEY, JSON.stringify(now.toISOString()));
    return;
  }
  if (cls.courseSessions !== 24) {
    cls.courseSessions = 24;
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(classes));
  }
  await persistScopedCourseRepair(env, cls, classes, students, sessions, finance);
  await env.STEPS_LMS_DATA.put(S19_COURSE_SIZES_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/** S29 khóa cũ thực tế chạy 14/07→09/10 (khóa mới buổi 1 = 13/10), nhưng
 * courseStartDate đang neo 04/08 nên khóa 1 trôi tới 27/10 và khóa 2 lùi sang
 * 30/10. Neo lại 14/07: lịch T3+T6 từ 14/07→09/10 có 26 suất lịch — trừ suất
 * 01/09 nghỉ học vụ (đã isOff) còn 25, đánh "học không tính phí" buổi 02/10
 * để khóa 1 gom đúng 24 buổi tính phí kết thúc 09/10, khóa 2 tự mở 13/10.
 * 11 phiếu khóa 2 (24 buổi × 65k) số tiền không đổi — chỉ cửa sổ ngày dịch
 * chuyển; sync scoped-S29 vẫn chạy để cập nhật nếu có lệch nhãn/kỳ. Số dư
 * buổi lưu sẵn tính lại theo mốc mới. Sửa trực tiếp trên object trong mảng để
 * các bước bootstrap phía sau dùng chung tham chiếu classes/sessions. */
async function withS29CourseStartFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(S29_COURSE_START_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  const cls = classes.find((row) => isS29Class(row));
  if (!cls) {
    await env.STEPS_LMS_DATA.put(S29_COURSE_START_MIGRATION_KEY, JSON.stringify(now.toISOString()));
    return;
  }
  if (cls.courseStartDate !== S29_COURSE_START) {
    cls.courseStartDate = S29_COURSE_START;
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(classes));
  }
  let sessionsChanged = false;
  for (const row of sessions) {
    if (row.classId === S29_CLASS_ID && row.date === S29_NOFEE_DATE && !row.isOff && !row.noFee) {
      row.noFee = true;
      sessionsChanged = true;
    }
  }
  if (sessionsChanged) await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(sessions));
  await persistScopedCourseRepair(env, cls, classes, students, sessions, finance);
  await env.STEPS_LMS_DATA.put(S29_COURSE_START_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/** S36 khóa 1 chạy T5+T7 suốt từ 01/08 — lịch tuần lỡ cắt suất T5 trong khe
 * 27/08→03/09 nên mất 2 buổi thật trên sheet (L8=27/08, L10=03/09; 03/09 còn
 * bản ghi điểm danh sẵn) và cả dãy số buổi lệch 2 (buổi 21 phải là 10/10).
 * Gỡ khe: suất T5 về liên tục — khóa 1 gom đủ 24 buổi kết thúc 22/10, khóa 2
 * tự mở 24/10; phiếu khóa 2 (24 buổi × 65k) số tiền không đổi. Sửa trực tiếp
 * trên object trong mảng để các bước bootstrap sau dùng chung tham chiếu. */
async function withS36ScheduleFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(S36_SCHEDULE_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  const cls = classes.find((row) => isS36Class(row));
  if (!cls) {
    await env.STEPS_LMS_DATA.put(S36_SCHEDULE_MIGRATION_KEY, JSON.stringify(now.toISOString()));
    return;
  }
  const thursday = (cls.schedules || []).find((slot) => slot.weekday === 4);
  const saturday = (cls.schedules || []).find((slot) => slot.weekday === 6);
  const hasGap = (cls.schedules || []).some((slot) => slot.weekday === 4 && (slot.effectiveFrom || slot.effectiveTo));
  if (thursday && hasGap) {
    cls.schedules = [
      { weekday: 4, periodId: thursday.periodId, startTime: thursday.startTime || "17:30", endTime: thursday.endTime || "19:00" },
      ...(saturday ? [{ weekday: 6, periodId: saturday.periodId, startTime: saturday.startTime, endTime: saturday.endTime }] : []),
    ];
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(classes));
  }
  await persistScopedCourseRepair(env, cls, classes, students, sessions, finance);
  await env.STEPS_LMS_DATA.put(S36_SCHEDULE_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/** S41 theo sheet chốt của trung tâm: buổi 2 = T5 06/08 (không phải T6 07/08),
 * có thêm buổi T6 14/08, và 24/09 là nghỉ trung thu (GV nghỉ — không chiếm
 * suất khóa). Vá dữ liệu lịch:
 *  - Gộp suất T5 về liên tục từ 06/08 (gỡ effectiveFrom 07/08 và khe
 *    23/09→25/09) → suất 06/08 được sinh, suất 24/09 tồn tại để bản ghi GV
 *    nghỉ chiếm chỗ hiển thị "—".
 *  - Suất T6 lẻ 07/08 → 14/08 theo sheet; bản ghi buổi 07/08 (nếu có) dời về
 *    06/08, hoặc đánh dấu "Buổi thêm" nếu 06/08 đã có bản ghi khác.
 *  - Đảm bảo 24/09 có bản ghi GV nghỉ (isOff + offSource TEACHER) — tạo nếu
 *    thiếu, khôi phục nếu lỡ bị gỡ cờ.
 * Kết quả: buổi 16 = 20/09, 24/09 hiện "—", buổi 21 = 11/10; khóa 1 kết thúc
 * buổi 24 = 22/10 và khóa 2 mở 25/10. Học phí 24 buổi không đổi. */
async function withS41ScheduleFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(S41_SCHEDULE_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  const cls = classes.find((row) => isS41Class(row));
  if (!cls) {
    await env.STEPS_LMS_DATA.put(S41_SCHEDULE_MIGRATION_KEY, JSON.stringify(now.toISOString()));
    return;
  }
  const slots = cls.schedules || [];
  const thursday = slots.find((slot) => slot.weekday === 4);
  if (thursday) {
    const merged = {
      weekday: 4,
      periodId: thursday.periodId,
      startTime: thursday.startTime || "19:15",
      endTime: thursday.endTime || "20:45",
      effectiveFrom: "2026-08-06",
    };
    const others = slots
      .filter((slot) => slot.weekday !== 4)
      .map((slot) => (slot.weekday === 5 && slot.effectiveFrom === "2026-08-07" && slot.effectiveTo === "2026-08-07"
        ? { ...slot, effectiveFrom: "2026-08-14", effectiveTo: "2026-08-14" }
        : { ...slot }));
    const next = [merged, ...others];
    if (JSON.stringify(next) !== JSON.stringify(slots)) {
      cls.schedules = next;
      await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(classes));
    }
  }
  let sessionsChanged = false;
  const own = sessions.filter((row) => row.classId === cls.id);
  const has0608 = own.some((row) => String(row.date || "") === "2026-08-06");
  for (const row of own) {
    const date = String(row.date || "");
    if (date === "2026-08-07") {
      if (!has0608) { row.date = "2026-08-06"; sessionsChanged = true; }
      else if (!row.isExtra) { row.isExtra = true; sessionsChanged = true; }
    }
    if (date === "2026-09-24" && (!row.isOff || row.offSource !== "TEACHER" || row.status === "CANCELLED")) {
      row.isOff = true;
      row.offSource = "TEACHER";
      row.noFee = false;
      if (row.status === "CANCELLED") row.status = "COMPLETED";
      sessionsChanged = true;
    }
  }
  if (!own.some((row) => String(row.date || "") === "2026-09-24")) {
    sessions.push({
      id: `session-s41-2026-09-24-off`,
      classId: cls.id,
      date: "2026-09-24",
      startTime: thursday?.startTime || "19:15",
      endTime: thursday?.endTime || "20:45",
      teacherId: cls.teacherId,
      roomId: cls.roomId,
      status: "COMPLETED",
      isExtra: false,
      recurrenceKey: `${cls.id}|2026-09-24|${thursday?.startTime || "19:15"}`,
      note: "Nghỉ trung thu — giáo viên cho nghỉ",
      isOff: true,
      offSource: "TEACHER",
      hasHomework: false,
      attendance: [],
    });
    sessionsChanged = true;
  }
  if (sessionsChanged) await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(sessions));
  await persistScopedCourseRepair(env, cls, classes, students, sessions, finance);
  await env.STEPS_LMS_DATA.put(S41_SCHEDULE_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/** S35: suất T3 bị cắt đúng ngày 29/09 (đoạn 02/09→28/09 rồi ≥30/09) nên buổi
 * học thật 29/09 — đã có bản ghi điểm danh COMPLETED — bị nuốt khỏi bảng khóa
 * và dãy số lệch 1 (11/10 phải là buổi 21). Gộp các đoạn T3 về một suất liên
 * tục từ đầu khóa: bản ghi 29/09 chiếm lại suất (buổi 18), bản ghi nghỉ lễ
 * 01/09 (isOff+ADMIN) hiện "—". Giữ nguyên suất CN và các suất lẻ T7 08/08,
 * 29/08, T2 28/09. Khóa 1 kết thúc buổi 24 = 20/10, khóa 2 mở 25/10; học phí
 * 24 buổi không đổi. */
async function withS35ScheduleFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(S35_SCHEDULE_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  const cls = classes.find((row) => isS35Class(row));
  if (!cls) {
    await env.STEPS_LMS_DATA.put(S35_SCHEDULE_MIGRATION_KEY, JSON.stringify(now.toISOString()));
    return;
  }
  const slots = cls.schedules || [];
  const tuesday = slots.find((slot) => slot.weekday === 2);
  const fragmented = slots.filter((slot) => slot.weekday === 2).length > 1;
  if (tuesday && fragmented) {
    const next = [
      { weekday: 2, periodId: tuesday.periodId, startTime: tuesday.startTime || "17:30", endTime: tuesday.endTime || "19:00" },
      ...slots.filter((slot) => slot.weekday !== 2).map((slot) => ({ ...slot })),
    ];
    if (JSON.stringify(next) !== JSON.stringify(slots)) {
      cls.schedules = next;
      await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(classes));
    }
  }
  await persistScopedCourseRepair(env, cls, classes, students, sessions, finance);
  await env.STEPS_LMS_DATA.put(S35_SCHEDULE_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/** Công nợ hiện tại 4 lớp S35/S29/S27/S36 theo bảng trung tâm gửi 16/10: mọi
 * học viên có phiếu khóa 2 = 24 buổi × 65.000đ = 1.560.000đ, một số bạn còn
 * nợ cũ cộng thêm. Nợ là bội số buổi → ghi tuitionCredits âm: phiếu khóa 2
 * tự gộp dòng "Nợ học phí khóa cũ" và tự xóa khi phụ huynh thanh toán. Hai
 * khoản lẻ không chia hết 65.000đ (Quỳnh Chi 5.520.000đ, Minh Nhật 725.000đ)
 * → cộng thẳng amountDue phiếu khóa 2 + frozenAt để sync không ghi đè, cập
 * nhật luôn số tiền lệnh thanh toán QR. Chỉ đụng đúng 4 lớp này. */
const DEBT_4CLASSES_CREDIT_SESSIONS: Record<string, { classId: string; sessions: number }> = {
  "student-import-0455": { classId: "class-import-s35", sessions: 24 }, // Bảo Linh 1.560.000đ
  "student-import-0457": { classId: "class-import-s35", sessions: 24 }, // Ngọc Diệp 1.560.000đ
  "student-import-0460": { classId: "class-import-s35", sessions: 24 }, // Cẩm Tú 1.560.000đ
  "student-import-0382": { classId: "class-import-s29", sessions: 30 }, // Gia Linh 1.950.000đ
  "student-import-0390": { classId: "class-import-s29", sessions: 20 }, // Tiến Dũng 1.300.000đ
  "student-import-0465": { classId: "class-import-s36", sessions: 24 }, // Phúc Hưng 1.560.000đ
  "student-import-0472": { classId: "class-import-s36", sessions: 24 }, // Trần Minh Triết 1.560.000đ
  "student-9b88ecf9-a06c-4a42-a8b4-75bba0b66375": { classId: "class-import-s36", sessions: 24 }, // Gia Hân 1.560.000đ
  "student-a1cc0fc6-dce2-4dcc-b45e-a9602d4f017f": { classId: "class-import-s36", sessions: 6 }, // Quang Hải 390.000đ
};
const DEBT_4CLASSES_ODD_AMOUNTS: Record<string, { classId: string; amount: number }> = {
  "student-import-0459": { classId: "class-import-s35", amount: 5_520_000 }, // Quỳnh Chi
  "student-import-0352": { classId: "class-import-s27", amount: 725_000 }, // Nguyễn Chính Minh Nhật
};
const DEBT_4CLASSES_IDS = ["class-import-s35", "class-import-s29", "class-import-s27", "class-import-s36"];

async function withDebt4ClassesFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(DEBT_4CLASSES_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  let studentsChanged = false;
  for (const [studentId, debt] of Object.entries(DEBT_4CLASSES_CREDIT_SESSIONS)) {
    const row = students.find((s) => s.id === studentId);
    const cls = classes.find((c) => c.id === debt.classId);
    if (!row || !cls || !(cls.studentIds || []).includes(studentId)) continue;
    const credits = { ...(row.tuitionCredits || {}) };
    if (Math.round(Number(credits[debt.classId]) || 0) === -debt.sessions) continue;
    credits[debt.classId] = -debt.sessions;
    row.tuitionCredits = credits;
    studentsChanged = true;
  }
  if (studentsChanged) await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(students));
  for (const classId of DEBT_4CLASSES_IDS) {
    const cls = classes.find((c) => c.id === classId);
    if (cls) await persistScopedCourseRepair(env, cls, classes, students, sessions, finance);
  }
  const current = finance ?? await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json");
  if (current) {
    const ledger = mergeSepayLedger(current.sepay);
    let changed = false;
    for (const [studentId, debt] of Object.entries(DEBT_4CLASSES_ODD_AMOUNTS)) {
      const recv = ledger.receivables.find((row) =>
        row.classId === debt.classId && row.studentId === studentId
        && row.billKey === `course|${debt.classId}|2` && row.status === "OPEN");
      if (!recv) continue;
      const base = 1_560_000;
      const expected = base + debt.amount;
      if (Math.round(Number(recv.amountDue) || 0) === expected && recv.frozenAt) continue;
      if (Math.round(Number(recv.amountDue) || 0) !== base) continue;
      recv.amountDue = expected;
      recv.balanceDue = Math.max(0, expected - Math.round(Number(recv.amountPaid) || 0));
      recv.billingPeriod = `${recv.billingPeriod} · Nợ cũ ${debt.amount.toLocaleString("vi-VN")}đ`;
      recv.frozenAt = now.toISOString();
      changed = true;
      const order = ledger.paymentOrders.find((row) => row.id === recv.paymentOrderId);
      if (order && Math.round(Number(order.amount) || 0) !== recv.balanceDue) order.amount = recv.balanceDue;
    }
    if (changed) {
      await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(syncTuitionCashbook({ ...current, sepay: { ...ledger } })));
    }
  }
  await env.STEPS_LMS_DATA.put(DEBT_4CLASSES_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/* Bảng công nợ khóa 2 (ảnh Desktop 16/10): chỉ đụng các lớp/bạn được liệt kê.
 * - Nợ là bội số giá buổi → tuitionCredits âm, phiếu khóa tự gộp dòng "Nợ học
 *   phí khóa cũ" và tự xóa khi thu (cùng cơ chế migration 4 lớp trước).
 * - Nợ lẻ không chia hết giá buổi → cộng thẳng amountDue phiếu khóa 2 + frozenAt
 *   để sync không ghi đè, đồng bộ luôn số tiền QR.
 * - Dư tiền (số âm trong ngoặc) → credit USED bằng đúng số dư + phiếu khóa 2 về
 *   PAID 0đ: ghi nhận khoản dư đã áp, không để credit sống áp lại sang khóa sau. */
const DEBT_8CLASSES_CREDIT_SESSIONS: Record<string, { classId: string; sessions: number }> = {
  // S17 — nợ khóa trước 1.560.000đ = 24 buổi × 65.000đ
  "student-import-0222": { classId: "class-import-s17", sessions: 24 }, // Thành Trung
  "student-import-0226": { classId: "class-import-s17", sessions: 24 }, // Ngọc Diệp
  "student-import-0230": { classId: "class-import-s17", sessions: 24 }, // Thục Quyên
  "student-import-0232": { classId: "class-import-s17", sessions: 24 }, // Trương Anh Quân
  "student-import-0233": { classId: "class-import-s17", sessions: 24 }, // Khả Hân
  "student-import-0234": { classId: "class-import-s17", sessions: 24 }, // Hải Thành
  "student-import-0237": { classId: "class-import-s17", sessions: 24 }, // Bình Minh
  // S21 — nợ khóa trước 1.560.000đ = 24 buổi × 65.000đ
  "student-import-0280": { classId: "class-import-s21", sessions: 24 }, // Phương Chi
  "student-import-0284": { classId: "class-import-s21", sessions: 24 }, // Khả Hân
  "student-import-0285": { classId: "class-import-s21", sessions: 24 }, // Bùi Bảo Châu
};
const DEBT_8CLASSES_ODD_AMOUNTS: Record<string, { classId: string; base: number; amount: number }> = {
  "student-import-0336": { classId: "class-import-s26", base: 1_560_000, amount: 725_000 }, // Nguyễn Dương Bảo Linh → 2.285.000đ
  "student-import-0340": { classId: "class-import-s26", base: 1_560_000, amount: 725_000 }, // Duy Hưng → 2.285.000đ
  "student-import-0348": { classId: "class-import-s26", base: 1_560_000, amount: 1_765_000 }, // Vân Anh → 3.325.000đ
  "student-import-0397": { classId: "class-import-s30", base: 3_480_000, amount: 3_560_000 }, // Ngọc Diệp → 7.040.000đ
  "student-import-0427": { classId: "class-import-s33", base: 2_400_000, amount: 2_450_000 }, // Bảo Ngọc → 4.850.000đ
  "student-import-0436": { classId: "class-import-s34", base: 1_560_000, amount: 2_285_000 }, // Long Hưng → 3.845.000đ
};
const DEBT_8CLASSES_SURPLUS: Record<string, { classId: string; amount: number }> = {
  "student-import-0335": { classId: "class-import-s26", amount: 1_560_000 }, // Trần Hữu Duy Bảo — dư (1.560.000đ)
};
const DEBT_8CLASSES_IDS = ["class-import-s17", "class-import-s21", "class-import-s24", "class-import-s26", "class-import-s28", "class-import-s30", "class-import-s33", "class-import-s34"];

async function withDebt8ClassesFix(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(DEBT_8CLASSES_MIGRATION_KEY, "json");
  if (done) return;
  const now = new Date();
  let studentsChanged = false;
  for (const [studentId, debt] of Object.entries(DEBT_8CLASSES_CREDIT_SESSIONS)) {
    const row = students.find((s) => s.id === studentId);
    const cls = classes.find((c) => c.id === debt.classId);
    if (!row || !cls || !(cls.studentIds || []).includes(studentId)) continue;
    const credits = { ...(row.tuitionCredits || {}) };
    if (Math.round(Number(credits[debt.classId]) || 0) === -debt.sessions) continue;
    credits[debt.classId] = -debt.sessions;
    row.tuitionCredits = credits;
    studentsChanged = true;
  }
  // Huyền Trân (S28): sheet chỉ ghi còn 1.560.000đ → gỡ nợ 6 buổi cũ đang ghi -6.
  {
    const row = students.find((s) => s.id === "student-import-0141");
    if (row?.tuitionCredits && Math.round(Number(row.tuitionCredits["class-import-s28"]) || 0) === -6) {
      const credits = { ...row.tuitionCredits };
      delete credits["class-import-s28"];
      row.tuitionCredits = credits;
      studentsChanged = true;
    }
  }
  // Ngọc Diệp (S24): sheet ghi "Miễn HP", còn lại "-" → bật miễn học phí, phiếu
  // khóa 2 OPEN sẽ bị sync hủy ở bước resync scoped bên dưới.
  {
    const row = students.find((s) => s.id === "student-import-0316");
    if (row && !row.tuitionExempt) {
      row.tuitionExempt = true;
      studentsChanged = true;
    }
  }
  if (studentsChanged) await env.STEPS_LMS_DATA.put("students:steps-demo", JSON.stringify(students));
  const current = finance ?? await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json");
  let financeAfter = current;
  if (current) {
    const ledger = mergeSepayLedger(current.sepay);
    let changed = false;
    for (const [studentId, debt] of Object.entries(DEBT_8CLASSES_ODD_AMOUNTS)) {
      const recv = ledger.receivables.find((row) =>
        row.classId === debt.classId && row.studentId === studentId
        && String(row.billKey || "").startsWith("course|") && row.status === "OPEN");
      if (!recv) continue;
      const expected = debt.base + debt.amount;
      if (Math.round(Number(recv.amountDue) || 0) === expected && recv.frozenAt) continue;
      if (Math.round(Number(recv.amountDue) || 0) !== debt.base) continue;
      recv.amountDue = expected;
      recv.balanceDue = Math.max(0, expected - Math.round(Number(recv.amountPaid) || 0));
      recv.billingPeriod = `${recv.billingPeriod} · Nợ cũ ${debt.amount.toLocaleString("vi-VN")}đ`;
      recv.frozenAt = now.toISOString();
      changed = true;
      const order = ledger.paymentOrders.find((row) => row.id === recv.paymentOrderId);
      if (order && Math.round(Number(order.amount) || 0) !== recv.balanceDue) order.amount = recv.balanceDue;
    }
    for (const [studentId, item] of Object.entries(DEBT_8CLASSES_SURPLUS)) {
      const creditId = `cred-surplus-${item.classId}-${studentId}`;
      const recv = ledger.receivables.find((row) =>
        row.classId === item.classId && row.studentId === studentId
        && String(row.billKey || "").startsWith("course|") && row.status === "OPEN"
        && Math.round(Number(row.balanceDue) || 0) === item.amount);
      if (recv) {
        recv.amountDue = 0;
        recv.balanceDue = 0;
        recv.status = "PAID";
        changed = true;
        const order = ledger.paymentOrders.find((row) => row.id === recv.paymentOrderId);
        if (order && order.status === "ACTIVE") order.status = "CANCELLED";
      }
      if (!ledger.credits.some((row) => row.id === creditId)) {
        ledger.credits.push({
          id: creditId,
          studentId,
          sourcePaymentId: `manual:surplus-${item.classId}`,
          amount: item.amount,
          remainingAmount: 0,
          reason: "OVERPAYMENT",
          status: "USED",
          createdAt: now.toISOString(),
        });
        changed = true;
      }
    }
    // Huyền Trân S28: phiếu khóa không index `course|class-import-s28` đang 1.950.000đ
    // (đã gộp nợ 6 buổi). Gỡ credit ở trên xong phải trả phiếu về 1.560.000đ —
    // sync cũng tự tính lại đúng số này nhưng sửa trực tiếp cho chắc.
    {
      const recv = ledger.receivables.find((row) =>
        row.classId === "class-import-s28" && row.studentId === "student-import-0141"
        && String(row.billKey || "").startsWith("course|") && row.status === "OPEN");
      if (recv && Math.round(Number(recv.amountDue) || 0) === 1_950_000) {
        recv.amountDue = 1_560_000;
        recv.balanceDue = Math.max(0, 1_560_000 - Math.round(Number(recv.amountPaid) || 0));
        changed = true;
        const order = ledger.paymentOrders.find((row) => row.id === recv.paymentOrderId);
        if (order && Math.round(Number(order.amount) || 0) !== recv.balanceDue) order.amount = recv.balanceDue;
      }
    }
    if (changed) {
      financeAfter = { ...current, sepay: { ...ledger } };
      await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(syncTuitionCashbook(financeAfter)));
    }
  }
  for (const classId of DEBT_8CLASSES_IDS) {
    const cls = classes.find((c) => c.id === classId);
    if (cls) await persistScopedCourseRepair(env, cls, classes, students, sessions, financeAfter ?? null);
  }
  // Ngọc Diệp S24 miễn HP: hủy thẳng phiếu khóa 2 + lệnh thu — không trông chờ
  // nhánh cancel-exempt của sync (phiếu chốt/đường ghi khác có thể giữ lại).
  const fresh = await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json");
  if (fresh) {
    const ledger2 = mergeSepayLedger(fresh.sepay);
    const exRecv = ledger2.receivables.find((row) =>
      row.classId === "class-import-s24" && row.studentId === "student-import-0316"
      && String(row.billKey || "").startsWith("course|")
      && ["DRAFT", "OPEN"].includes(row.status) && Math.round(Number(row.amountPaid) || 0) <= 0);
    if (exRecv) {
      exRecv.balanceDue = 0;
      exRecv.status = "CANCELLED";
      const order = ledger2.paymentOrders.find((row) => row.id === exRecv.paymentOrderId);
      if (order && order.status === "ACTIVE") order.status = "CANCELLED";
      await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(syncTuitionCashbook({ ...fresh, sepay: { ...ledger2 } })));
    }
  }
  await env.STEPS_LMS_DATA.put(DEBT_8CLASSES_MIGRATION_KEY, JSON.stringify(now.toISOString()));
}

/** Đăng Khôi (T19) đã chuyển khoản 960k ngày 01/10 theo Excel — ghi nhận thu
 * bằng đúng đường collectManualTuition để phiếu T10 PAID, sổ thu chi khớp và
 * biên lai phát hành như thu tay bình thường. */
async function withT19DangKhoiPaid(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(T19_PAID_MIGRATION_KEY, "json");
  if (done) return { students, finance };
  const cls = classes.find((row) => row.id === T19_CLASS_ID);
  const student = students.find((row) => row.id === T19_DANG_KHOI_STUDENT_ID);
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!cls || !student || !book) {
    await env.STEPS_LMS_DATA.put(T19_PAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const result = collectManualTuition({
    ledger: mergeSepayLedger(book.sepay),
    student,
    cls,
    sessions,
    method: "TRANSFER",
    note: "Đã chuyển khoản ngày 01/10",
    now: new Date("2026-10-01T09:00:00+07:00"),
  });
  if ("error" in result) {
    await env.STEPS_LMS_DATA.put(T19_PAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const cashbook = [
    {
      id: `cash-${crypto.randomUUID()}`,
      date: "2026-10-01",
      kind: "IN" as const,
      source: "TUITION" as const,
      category: "Học phí",
      description: `Thu học phí ${result.charge.period} · đã CK 01/10`,
      amount: Number(result.receipt.amount ?? result.charge.amount),
      method: result.receipt.method || "Chuyển khoản",
      branchId: cls.branchId,
      studentName: student.fullName,
      tuitionId: result.receivable.id,
      receiptId: result.receipt.id,
    },
    ...book.cashbook,
  ];
  const nextFinance: DemoFinance = {
    ...book,
    sepay: result.ledger,
    cashbook,
    recon: rebuildRecon(cashbook, book.recon),
    reconEntries: rebuildReconEntries(cashbook, book.reconEntries),
  };
  const nextStudents = students.map((row) => row.id !== student.id ? row : {
    ...row,
    sessionBalances: { ...(row.sessionBalances || {}), [cls.id]: result.remainingAfter },
    tuitionCredits: { ...(row.tuitionCredits || {}), [cls.id]: Math.max(0, Number(row.tuitionCredits?.[cls.id] || 0) - result.charge.creditSessions) },
    tuitionPaidThrough: result.paidThroughMonth
      ? { ...(row.tuitionPaidThrough || {}), [cls.id]: result.paidThroughMonth }
      : row.tuitionPaidThrough,
  });
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await persistStudentsMerged(env, nextStudents);
  await env.STEPS_LMS_DATA.put(T19_PAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return { students: nextStudents, finance: nextFinance };
}

/** Bảo Minh (T24) Excel ghi đã đóng đủ 960k — ghi nhận thu bằng đúng đường
 * collectManualTuition để phiếu T10 PAID, sổ thu chi khớp như thu tay. */
async function withT24BaoMinhPaid(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(T24_PAID_MIGRATION_KEY, "json");
  if (done) return { students, finance };
  const cls = classes.find((row) => row.id === T24_CLASS_ID);
  const student = students.find((row) => row.id === T24_BAO_MINH_STUDENT_ID);
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!cls || !student || !book) {
    await env.STEPS_LMS_DATA.put(T24_PAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const result = collectManualTuition({
    ledger: mergeSepayLedger(book.sepay),
    student,
    cls,
    sessions,
    method: "TRANSFER",
    note: "Đã đóng đủ theo bảng Excel tháng 10",
    now: new Date("2026-10-04T09:00:00+07:00"),
  });
  if ("error" in result) {
    await env.STEPS_LMS_DATA.put(T24_PAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const cashbook = [
    {
      id: `cash-${crypto.randomUUID()}`,
      date: "2026-10-04",
      kind: "IN" as const,
      source: "TUITION" as const,
      category: "Học phí",
      description: `Thu học phí ${result.charge.period} · đã đóng theo Excel T10`,
      amount: Number(result.receipt.amount ?? result.charge.amount),
      method: result.receipt.method || "Chuyển khoản",
      branchId: cls.branchId,
      studentName: student.fullName,
      tuitionId: result.receivable.id,
      receiptId: result.receipt.id,
    },
    ...book.cashbook,
  ];
  const nextFinance: DemoFinance = {
    ...book,
    sepay: result.ledger,
    cashbook,
    recon: rebuildRecon(cashbook, book.recon),
    reconEntries: rebuildReconEntries(cashbook, book.reconEntries),
  };
  const nextStudents = students.map((row) => row.id !== student.id ? row : {
    ...row,
    sessionBalances: { ...(row.sessionBalances || {}), [cls.id]: result.remainingAfter },
    tuitionCredits: { ...(row.tuitionCredits || {}), [cls.id]: Math.max(0, Number(row.tuitionCredits?.[cls.id] || 0) - result.charge.creditSessions) },
    tuitionPaidThrough: result.paidThroughMonth
      ? { ...(row.tuitionPaidThrough || {}), [cls.id]: result.paidThroughMonth }
      : row.tuitionPaidThrough,
  });
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await persistStudentsMerged(env, nextStudents);
  await env.STEPS_LMS_DATA.put(T24_PAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return { students: nextStudents, finance: nextFinance };
}

/** Sửa lại Bảo Minh (T24): Excel chỉ ghi nợ cũ + HP tháng 10 = tổng 960k còn
 * phải thu, KHÔNG phải đã đóng — migration ghi nhận thu trước đó gây trạng
 * thái "hết nợ" sai. Hoàn tác biên lai bằng reverseTuitionReceipt để phiếu
 * T10 về OPEN 960k, QR mở lại, gỡ dòng sổ thu chi đã ghi nhận nhầm. */
async function withT24BaoMinhUnpaid(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(T24_UNPAID_MIGRATION_KEY, "json");
  if (done) return { students, finance };
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!book) {
    await env.STEPS_LMS_DATA.put(T24_UNPAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const ledger = mergeSepayLedger(book.sepay);
  const receivable = ledger.receivables.find((row) => (
    row.studentId === T24_BAO_MINH_STUDENT_ID
    && row.classId === T24_CLASS_ID
    && row.status === "PAID"
  ));
  const payment = receivable
    ? ledger.payments.find((row) => row.receivableId === receivable.id && row.status !== "VOIDED")
    : undefined;
  const receipt = payment
    ? ledger.receipts.find((row) => row.paymentId === payment.id)
    : undefined;
  if (!receivable || !payment || !receipt) {
    await env.STEPS_LMS_DATA.put(T24_UNPAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const reversed = reverseTuitionReceipt({ ledger, receiptId: receipt.id, students, classes, sessions });
  if ("error" in reversed) {
    await env.STEPS_LMS_DATA.put(T24_UNPAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const cashbook = book.cashbook.filter((row) => !(row.tuitionId === receivable.id && row.receiptId === receipt.id));
  const nextFinance: DemoFinance = {
    ...book,
    sepay: reversed.ledger,
    cashbook,
    recon: rebuildRecon(cashbook, book.recon),
    reconEntries: rebuildReconEntries(cashbook, book.reconEntries),
  };
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await persistStudentsMerged(env, reversed.students);
  await env.STEPS_LMS_DATA.put(T24_UNPAID_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return { students: reversed.students, finance: nextFinance };
}

/** Thanh Nhàn (HV0379 — S28): phiếu khóa 1 `course|class-import-s28` bị đóng băng
 * sai 3.120.000đ (48 suất) trong khi khóa 24 buổi × 65k = 1.560.000đ — mọi bạn
 * cùng lớp cùng số dư -8 đều có phiếu khóa 1 đúng 1.560.000đ. Phiếu đã frozen
 * nên sync không tự sửa: chỉnh amountDue/balanceDue + số tiền đơn QR về đúng
 * 1.560.000đ, giữ nguyên frozenAt và payment code để đối soát cũ vẫn nhận ra. */
async function withS28ThanhNhanReceivableFix(
  env: DemoEnv,
  finance: DemoFinance | null,
): Promise<DemoFinance | null> {
  const done = await env.STEPS_LMS_DATA.get<string>(S28_THANH_NHAN_RECV_MIGRATION_KEY, "json");
  if (done) return finance;
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!book) {
    await env.STEPS_LMS_DATA.put(S28_THANH_NHAN_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  const ledger = mergeSepayLedger(book.sepay);
  const receivable = ledger.receivables.find((row) => (
    row.studentId === S28_THANH_NHAN_STUDENT_ID
    && row.classId === "class-import-s28"
    && row.billKey === "course|class-import-s28"
    && row.status === "OPEN"
    && row.amountDue === 3120000
  ));
  if (!receivable) {
    await env.STEPS_LMS_DATA.put(S28_THANH_NHAN_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  receivable.amountDue = 1560000;
  receivable.balanceDue = 1560000;
  ledger.paymentOrders = ledger.paymentOrders.map((order) => (
    order.id === receivable.paymentOrderId ? { ...refreshOrderQr(order, ledger.settings, 1560000) } : order
  ));
  const nextFinance: DemoFinance = { ...book, sepay: ledger };
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await env.STEPS_LMS_DATA.put(S28_THANH_NHAN_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return nextFinance;
}

/** Nhật Minh (HV0376 — S28): phiếu khóa 2 `course|class-import-s28|2` tự lập sẵn
 * trong khi bạn mới đóng xong khóa 1, chưa tới kỳ thu — hủy phiếu và đơn QR treo.
 * Phiếu CANCELLED vẫn khớp billKey nên sync không lập lại; khi khóa 1 gần hết,
 * quy trình lập phiếu khóa sau chạy lại bình thường. */
async function withS28NhatMinhCourse2Cancel(
  env: DemoEnv,
  finance: DemoFinance | null,
): Promise<DemoFinance | null> {
  const done = await env.STEPS_LMS_DATA.get<string>(S28_NHAT_MINH_C2_MIGRATION_KEY, "json");
  if (done) return finance;
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!book) {
    await env.STEPS_LMS_DATA.put(S28_NHAT_MINH_C2_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  const ledger = mergeSepayLedger(book.sepay);
  const receivable = ledger.receivables.find((row) => (
    row.studentId === S28_NHAT_MINH_STUDENT_ID
    && row.classId === "class-import-s28"
    && row.billKey === "course|class-import-s28|2"
    && row.status !== "CANCELLED"
    && !Number(row.amountPaid || 0)
  ));
  if (!receivable) {
    await env.STEPS_LMS_DATA.put(S28_NHAT_MINH_C2_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  receivable.balanceDue = 0;
  receivable.status = "CANCELLED";
  ledger.paymentOrders = ledger.paymentOrders.map((order) => (
    order.receivableId === receivable.id && order.status === "ACTIVE" ? { ...order, status: "CANCELLED" as const } : order
  ));
  const nextFinance: DemoFinance = { ...book, sepay: ledger };
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await env.STEPS_LMS_DATA.put(S28_NHAT_MINH_C2_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return nextFinance;
}

/** S22 (movers vip 1 — 9 bạn): khóa 1 đang chạy, đã học ~9 buổi mà chưa có phiếu
 * nào — hệ thống mặc định coi khóa 1 "đã đóng" (lớp chạy từ trước SePay) nên
 * Quản lý học phí hiện "Đã thu"/tồn 15 trong khi thực tế cả 9 bạn nợ 24 buổi
 * × 145k = 3.480.000đ. Đảo biên lai khóa 1 ghi nhận nhầm (nếu có), hủy phiếu
 * khóa 2+ lập sớm khi lớp vẫn đang ở khóa 1, rồi lập phiếu `course|class-import-s22`
 * OPEN đúng giá khóa cho từng bạn — phiếu khóa 1 mở tắt luôn giả định đã đóng,
 * số buổi tồn tự về âm đúng số buổi đã học. */
async function withS22Course1Receivables(
  env: DemoEnv,
  students: DemoStudent[],
  classes: DemoClass[],
  sessions: DemoLessonSession[],
  finance: DemoFinance | null,
): Promise<{ students: DemoStudent[]; finance: DemoFinance | null }> {
  const done = await env.STEPS_LMS_DATA.get<string>(S22_COURSE1_RECV_MIGRATION_KEY, "json");
  if (done) return { students, finance };
  const cls = classes.find((row) => row.id === "class-import-s22");
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!cls || !book) {
    await env.STEPS_LMS_DATA.put(S22_COURSE1_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  let ledger = mergeSepayLedger(book.sepay);
  let nextStudents = students;
  let cashbook = book.cashbook;
  const course1Key = `course|${cls.id}`;
  const currentCourse = classCurrentCourseIndex(cls, new Date(), sessions);
  const iso = new Date().toISOString();
  let changed = false;
  for (const studentId of cls.studentIds || []) {
    const student = nextStudents.find((row) => row.id === studentId);
    if (!student) continue;
    // Phiếu khóa 1 đã ghi nhận thu nhầm → đảo biên lai để phiếu về OPEN.
    const settled = ledger.receivables.find((row) => (
      row.studentId === studentId
      && row.classId === cls.id
      && String(row.billKey || "").split("|")[0] === "course"
      && courseIndexOfBillKey(row.billKey || "") === 1
      && ["PAID", "OVERPAID"].includes(String(row.status))
    ));
    if (settled) {
      const payment = ledger.payments.find((row) => row.receivableId === settled.id && row.status !== "VOIDED");
      const receipt = payment ? ledger.receipts.find((row) => row.paymentId === payment.id) : undefined;
      if (receipt) {
        const reversed = reverseTuitionReceipt({ ledger, receiptId: receipt.id, students: nextStudents, classes, sessions });
        if (!("error" in reversed)) {
          ledger = reversed.ledger;
          nextStudents = reversed.students;
          cashbook = cashbook.filter((row) => !(row.tuitionId === settled.id && row.receiptId === receipt.id));
          changed = true;
        }
      }
    }
    // Phiếu khóa sau lập sẵn trong khi lớp vẫn đang ở khóa 1 → hủy (giống ca
    // Nhật Minh S28): CANCELLED vẫn khớp billKey nên sync không lập lại, tới
    // kỳ thu thật quy trình lập phiếu khóa sau chạy bình thường.
    if (currentCourse < 2) {
      for (const row of ledger.receivables) {
        if (
          row.studentId !== studentId
          || row.classId !== cls.id
          || String(row.billKey || "").split("|")[0] !== "course"
          || courseIndexOfBillKey(row.billKey || "") < 2
          || !["OPEN", "PARTIALLY_PAID"].includes(String(row.status))
          || Number(row.amountPaid || 0) > 0
        ) continue;
        row.balanceDue = 0;
        row.status = "CANCELLED";
        ledger.paymentOrders = ledger.paymentOrders.map((order) => (
          order.receivableId === row.id && order.status === "ACTIVE" ? { ...order, status: "CANCELLED" as const } : order
        ));
        changed = true;
      }
    }
    // Chưa có phiếu khóa 1 còn hiệu lực → lập phiếu đúng giá khóa (đã gồm học liệu).
    const hasCourse1 = ledger.receivables.some((row) => (
      row.studentId === studentId
      && row.classId === cls.id
      && String(row.billKey || "") === course1Key
      && row.status !== "CANCELLED"
    ));
    if (!hasCourse1) {
      const charge = classTuitionCharge(cls, sessions, undefined, 1);
      ledger = ensureReceivableForCharge(ledger, student, cls, {
        billKey: course1Key,
        period: charge.period,
        amount: charge.amount,
      }, iso).ledger;
      changed = true;
    }
  }
  if (!changed) {
    await env.STEPS_LMS_DATA.put(S22_COURSE1_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return { students, finance };
  }
  const nextFinance: DemoFinance = {
    ...book,
    sepay: ledger,
    cashbook,
    recon: rebuildRecon(cashbook, book.recon),
    reconEntries: rebuildReconEntries(cashbook, book.reconEntries),
  };
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  if (nextStudents !== students) await persistStudentsMerged(env, nextStudents);
  await env.STEPS_LMS_DATA.put(S22_COURSE1_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return { students: nextStudents, finance: nextFinance };
}

/** Tuấn Dũng (S1): Excel ghi nợ cũ 0, chỉ thu T10 = 585k. Thu gọn phiếu gộp
 * months|09,10 (1.100k) thành phiếu T10 đơn — giữ nguyên mã thanh toán phụ
 * huynh đang cầm. Nếu sync đã lỡ lập phiếu T10 lẻ thì hủy phiếu sót đó. */
async function withS1TuanDungOctoberBill(
  env: DemoEnv,
  finance: DemoFinance | null,
): Promise<DemoFinance | null> {
  const done = await env.STEPS_LMS_DATA.get<string>(S1_TUAN_DUNG_RECV_MIGRATION_KEY, "json");
  if (done) return finance;
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!book) {
    await env.STEPS_LMS_DATA.put(S1_TUAN_DUNG_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  const ledger = mergeSepayLedger(book.sepay);
  const bundle = ledger.receivables.find((row) => (
    row.studentId === S1_TUAN_DUNG_STUDENT_ID
    && row.classId === S1_CLASS_ID
    && row.billKey === `months|${S1_CLASS_ID}|2026-09,2026-10`
    && row.status === "OPEN"
  ));
  if (!bundle) {
    await env.STEPS_LMS_DATA.put(S1_TUAN_DUNG_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  const suffix = String(bundle.billingPeriod || "").split("·")[1]?.trim();
  bundle.billKey = `month|${S1_CLASS_ID}|2026-10`;
  bundle.billingPeriod = `Tháng 10/2026${suffix ? ` · ${suffix}` : ""}`;
  bundle.amountDue = 585_000;
  bundle.balanceDue = 585_000;
  const cancelledIds = new Set<string>();
  ledger.receivables = ledger.receivables.map((row) => {
    if (row === bundle) return row;
    const isStray = row.studentId === S1_TUAN_DUNG_STUDENT_ID
      && row.classId === S1_CLASS_ID
      && row.billKey === `month|${S1_CLASS_ID}|2026-10`
      && row.status === "OPEN";
    if (!isStray) return row;
    cancelledIds.add(row.id);
    return { ...row, balanceDue: 0, status: "CANCELLED" as const };
  });
  ledger.paymentOrders = ledger.paymentOrders.map((order) => {
    if (order.id === bundle.paymentOrderId) return { ...refreshOrderQr(order, ledger.settings, 585_000) };
    if (cancelledIds.has(order.receivableId) && order.status === "ACTIVE") return { ...order, status: "CANCELLED" as const };
    return order;
  });
  const nextFinance: DemoFinance = { ...book, sepay: ledger };
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await env.STEPS_LMS_DATA.put(S1_TUAN_DUNG_RECV_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return nextFinance;
}

/** Đưa các hóa đơn ISSUED phát hành thử về CANCELLED — hàng chờ hiện lại "Chưa xuất" để xuất trên web/MISA. */
async function withIssuedInvoiceReset(
  env: DemoEnv,
  finance: DemoFinance | null,
  migrationKey = ISSUED_INVOICE_RESET_MIGRATION_KEY,
  resetIds: ReadonlySet<string> = ISSUED_INVOICE_RESET_IDS,
): Promise<DemoFinance | null> {
  const done = await env.STEPS_LMS_DATA.get<string>(migrationKey, "json");
  if (done) return finance;
  const book = finance ? syncTuitionCashbook(hydrateFinance(finance)) : null;
  if (!book) {
    await env.STEPS_LMS_DATA.put(migrationKey, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  const ledger = mergeSepayLedger(book.sepay);
  const targets = new Set(ledger.invoices.filter((row) => resetIds.has(row.id) && row.status === "ISSUED").map((row) => row.id));
  if (!targets.size) {
    await env.STEPS_LMS_DATA.put(migrationKey, JSON.stringify(new Date().toISOString()));
    return finance;
  }
  ledger.invoices = ledger.invoices.map((row) => (targets.has(row.id)
    ? { ...row, status: "CANCELLED", approvedAt: undefined, processingAt: undefined, lastError: "Reset: hóa đơn phát hành thử, xuất lại trên web." }
    : row));
  const nextFinance: DemoFinance = { ...book, sepay: ledger };
  await env.STEPS_LMS_DATA.put("finance:steps-demo", JSON.stringify(nextFinance));
  await env.STEPS_LMS_DATA.put(migrationKey, JSON.stringify(new Date().toISOString()));
  return nextFinance;
}

async function withTeacherOffRemainingBackfill(
  env: DemoEnv,
  students: DemoStudent[],
  classes?: DemoClass[] | null,
  sessions?: DemoLessonSession[] | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(TEACHER_OFF_REMAINING_MIGRATION_KEY, "json");
  if (done) return students;
  const classRows = cleanClasses(classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const sessionRows = cleanLessonSessions(
    sessions ?? (await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions(),
  );
  const next = backfillTeacherOffRemaining(students, classRows, sessionRows);
  await persistStudentsMerged(env, next);
  await env.STEPS_LMS_DATA.put(TEACHER_OFF_REMAINING_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

async function withCourseRemainingRebuild(
  env: DemoEnv,
  students: DemoStudent[],
  classes?: DemoClass[] | null,
  sessions?: DemoLessonSession[] | null,
  finance?: DemoFinance | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(COURSE_REMAINING_MIGRATION_KEY, "json");
  if (done) return students;
  const classRows = cleanClasses(classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const sessionRows = cleanLessonSessions(
    sessions ?? (await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions(),
  );
  const book = hydrateFinance(finance ?? await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"));
  const next = rebuildCourseSessionBalances(students, classRows, sessionRows, mergeSepayLedger(book.sepay));
  await persistStudentsMerged(env, next);
  await env.STEPS_LMS_DATA.put(COURSE_REMAINING_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

async function withCourseTeacherCreditCleanup(
  env: DemoEnv,
  students: DemoStudent[],
  classes?: DemoClass[] | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(COURSE_TEACHER_CREDIT_MIGRATION_KEY, "json");
  if (done) return students;
  const classRows = cleanClasses(classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const next = clearCourseTeacherCredits(students, classRows);
  await persistStudentsMerged(env, next);
  await env.STEPS_LMS_DATA.put(COURSE_TEACHER_CREDIT_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

async function withMonthlyTeacherCreditCleanup(
  env: DemoEnv,
  students: DemoStudent[],
  classes?: DemoClass[] | null,
) {
  const done = await env.STEPS_LMS_DATA.get<string>(MONTHLY_OFF_CREDIT_MIGRATION_KEY, "json");
  if (done) return students;
  const classRows = cleanClasses(classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const next = clearMonthlyTeacherCredits(students, classRows);
  await persistStudentsMerged(env, next);
  await env.STEPS_LMS_DATA.put(MONTHLY_OFF_CREDIT_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

async function withTuitionStatusByBillingMode(env: DemoEnv, students: DemoStudent[], classes?: DemoClass[] | null) {
  const done = await env.STEPS_LMS_DATA.get<string>(TUITION_STATUS_MIGRATION_KEY, "json");
  if (done) return students;
  const classRows = cleanClasses(classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const next = initializeTuitionStatusByBillingMode(students, classRows);
  await persistStudentsMerged(env, next);
  await env.STEPS_LMS_DATA.put(TUITION_STATUS_MIGRATION_KEY, JSON.stringify(new Date().toISOString()));
  return next;
}

/** Kết quả đồng bộ finance của các lần đọc — version block tăng mỗi lần ghi
 * nên cache tự mất hiệu lực khi có dữ liệu mới, không cần bộ đếm thời gian. */
const syncedFinanceReadCache = new Map<string, DemoFinance>();
const FINANCE_SYNC_VERSION_KEYS = ["classes:steps-demo", "students:steps-demo", "sessions:steps-demo", "finance:steps-demo"];

/**
 * Đổi ngày nhập học lớp thu khóa: nhả chốt phiếu khóa chưa thu của đúng học viên + lớp có đổi ngày để
 * đồng bộ tính lại số tiền theo mốc mới. Dùng cho cả PUT (lưu hàng loạt) và PATCH (ô ngày nhập học trên web).
 */
async function releaseCourseBillsOnJoinChange(env: DemoEnv, classes: DemoClass[], previous: DemoStudent[], items: DemoStudent[], sessions: DemoLessonSession[]) {
  const joinChanges: Array<{ studentId: string; classId: string }> = [];
  const previousById = new Map(previous.map((row) => [row.id, row]));
  for (const row of items) {
    const before = previousById.get(row.id);
    if (!before) continue;
    for (const classId of new Set([...Object.keys(before.classJoinedAt || {}), ...Object.keys(row.classJoinedAt || {})])) {
      if ((before.classJoinedAt?.[classId] || "") === (row.classJoinedAt?.[classId] || "")) continue;
      const cls = classes.find((item) => item.id === classId);
      if (cls && classBillingMode(cls) === "COURSE") joinChanges.push({ studentId: row.id, classId });
    }
  }
  if (!joinChanges.length) return;
  const snapshot = await readFinanceSnapshot(env);
  let ledger = mergeSepayLedger(snapshot.finance.sepay);
  // 1) Phiếu khóa đã chốt, chưa thu → nhả chốt để đồng bộ tính lại theo ngày mới.
  const released = unfreezeCourseReceivablesForJoinChange(ledger, joinChanges);
  ledger = released.ledger;
  // 2) Phụ huynh đã đóng đủ theo ngày cũ → phần dư thành tín dụng trừ vào khóa sau.
  let credited = 0;
  for (const change of joinChanges) {
    const cls = classes.find((item) => item.id === change.classId);
    const before = previousById.get(change.studentId);
    const after = items.find((row) => row.id === change.studentId);
    if (!cls || !before || !after) continue;
    const res = creditCourseExcessForJoinChange({ ledger, previousStudent: before, student: after, cls, sessions });
    if (res.credited.length) { ledger = res.ledger; credited += res.credited.length; }
  }
  if (released.unfrozen || credited) await persistFinanceIfUnchanged(env, snapshot.stored, { ...snapshot.finance, sepay: ledger });
}

/** Phiếu chi hoàn phần chưa học khi học viên về Lớp chờ — id cố định để lặp không nhân đôi. */
function withLeftClassRefunds(
  finance: DemoFinance,
  refunds: Array<{ receivableId: string; amount: number; studentName: string; description: string; branchId?: string }>,
  iso: string,
): DemoFinance {
  if (!refunds.length) return finance;
  const existing = new Set((finance.cashbook || []).map((row) => row.id));
  const entries: DemoCashEntry[] = [];
  for (const item of refunds) {
    const id = `cash-refund-${item.receivableId}`;
    if (existing.has(id)) continue;
    existing.add(id);
    entries.push({
      id,
      date: iso.slice(0, 10),
      kind: "OUT",
      source: "TUITION",
      category: "Hoàn học phí",
      description: item.description,
      amount: item.amount,
      method: "Chuyển khoản",
      ...(item.branchId ? { branchId: item.branchId } : {}),
      studentName: item.studentName,
      tuitionId: item.receivableId,
    });
  }
  if (!entries.length) return finance;
  return { ...finance, cashbook: [...entries, ...(finance.cashbook || [])] };
}

async function syncedFinance(
  env: DemoEnv,
  classes?: DemoClass[] | null,
  students?: DemoStudent[] | null,
  sessions?: DemoLessonSession[] | null,
  options: { persist?: boolean } = {},
) {
  const persist = options.persist !== false;
  let cacheKey = "";
  if (!persist && !classes && !students && !sessions) {
    const kv = env.STEPS_LMS_DATA as unknown as { versions?: (keys: string[]) => Promise<Record<string, number>> };
    const versions = kv.versions ? await kv.versions(FINANCE_SYNC_VERSION_KEYS) : undefined;
    if (versions && FINANCE_SYNC_VERSION_KEYS.every((key) => versions[key] !== undefined)) {
      cacheKey = FINANCE_SYNC_VERSION_KEYS.map((key) => versions[key]).join("|");
      const hit = syncedFinanceReadCache.get(cacheKey);
      if (hit) return hit;
    }
  }
  const snapshot = await readFinanceSnapshot(env);
  const finance = snapshot.finance;
  const classRows = cleanClasses(classes ?? (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const studentRows = cleanStudents(students ?? (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
  const sessionRows = cleanLessonSessions(sessions
    ?? (await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json"))
    ?? defaultLessonSessions());
  let repairedStudents = studentRows;
  let sepay = syncTuitionReceivables(mergeSepayLedger(finance.sepay), classRows, studentRows, sessionRows);
  for (const receiptId of finance.cashbookSkippedReceiptIds || []) {
    if (!sepay.receipts.some((row) => row.id === receiptId)) continue;
    const reversed = reverseTuitionReceipt({
      ledger: sepay,
      receiptId,
      students: repairedStudents,
      classes: classRows,
      sessions: sessionRows,
    });
    if ("error" in reversed) continue;
    sepay = reversed.ledger;
    repairedStudents = reversed.students;
  }
  repairedStudents = clampPaidThroughToReceipts(repairedStudents, classRows, sepay);
  const next = syncTuitionCashbook({ ...finance, sepay });
  const repairedRoster = JSON.stringify(studentRows) !== JSON.stringify(repairedStudents);
  if (repairedRoster && students) students.splice(0, students.length, ...repairedStudents);
  // Các endpoint chỉ đọc không được ghi lại khối tài chính: giá trị đồng bộ luôn
  // tính lại được, còn một lần ghi bằng dữ liệu đọc từ trước sẽ xoá mất phiếu
  // mà request khác vừa lưu.
  if (persist && repairedRoster) await persistStudentsMerged(env, repairedStudents);
  if (persist && JSON.stringify(finance) !== JSON.stringify(next)) {
    await persistFinanceIfUnchanged(env, snapshot.stored, next);
  }
  if (cacheKey) {
    syncedFinanceReadCache.set(cacheKey, next);
    while (syncedFinanceReadCache.size > 8) syncedFinanceReadCache.delete(syncedFinanceReadCache.keys().next().value as string);
  }
  return next;
}

/**
 * Ghi một dòng webhookLogs REJECTED khi từ chối request, để có vết điều tra dù
 * request không tạo giao dịch nào. Không phải đường tiền nên xung đột bỏ qua
 * âm thầm sau khi hết lượt thử — không đáng để trả lỗi cho một dòng log.
 */
async function appendRejectedWebhookLog(env: DemoEnv, requestId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readFinanceSnapshot(env);
    const current = syncTuitionCashbook(snapshot.finance);
    const sepay = mergeSepayLedger(current.sepay);
    const log: SepayWebhookLog = {
      id: `wh-${crypto.randomUUID()}`,
      requestId,
      signatureValid: false,
      processingStatus: "REJECTED",
      createdAt: new Date().toISOString(),
    };
    sepay.webhookLogs = [log, ...sepay.webhookLogs].slice(0, 200);
    const next = syncTuitionCashbook({ ...current, sepay });
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) return;
  }
}

/**
 * Callback trạng thái tin Zalo ZBS (Phase 7, Bước 6). Cập nhật đúng dòng log khớp
 * `msg_id` sang `DELIVERED`. Không throw khi payload lạ — trả 200 để Zalo không bắn
 * lại vô hạn, nhưng chữ ký sai/thiếu luôn bị từ chối (bài học Phase 1).
 */
const ZALO_WEBHOOK_PAYLOAD_MAX_CHARS = 4000;

async function handleZaloWebhook(request: Request, env: DemoEnv) {
  const raw = await request.text();
  const effective = await readEffectiveIntegrationSettings(env);
  const authResult = await verifyZaloWebhookRequest({ rawBody: raw, headers: request.headers, appId: effective.zalo.appId, appSecret: effective.zalo.appSecret });
  if (!authResult.ok) return json({ error: authResult.reason }, 401);

  const body = (() => { try { return JSON.parse(raw) as { msg_id?: string }; } catch { return null; } })();
  const msgId = body?.msg_id;
  if (!msgId) return json({ ok: true });

  let snapshot = await readZaloMessageLogs(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const target = snapshot.logs.find((log) => log.providerMsgId === msgId);
    if (!target) return json({ ok: true });
    const receivedAt = new Date().toISOString();
    // Giữ nội dung webhook gốc (cắt ngắn) để đối soát với tin đã gửi.
    const nextLogs = snapshot.logs.map((log) => (log.providerMsgId === msgId
      ? { ...log, status: "DELIVERED" as const, deliveredAt: receivedAt, webhookAt: receivedAt, webhookPayload: raw.slice(0, ZALO_WEBHOOK_PAYLOAD_MAX_CHARS) }
      : log));
    if (await persistZaloMessageLogsIfUnchanged(env, snapshot.stored, nextLogs)) return json({ ok: true });
    snapshot = await readZaloMessageLogs(env);
  }
  return json({ ok: true });
}

// Day la handler webhook SePay THAT dang chay o production (ngoaingusteps.edu.vn).
// Hoa don PENDING tao o day duoc invoice-outbox.ts phat hanh that qua MISA.
async function handleSepayWebhook(request: Request, env: DemoEnv) {
  const raw = await request.text();
  const requestId = request.headers.get("x-request-id") || `req-${crypto.randomUUID()}`;
  const allowDemoLogin = env.ALLOW_DEMO_LOGIN === "true";
  const effective = await readEffectiveIntegrationSettings(env);
  const authResult = await verifyWebhookRequest({
    rawBody: raw,
    headers: request.headers,
    secret: effective.sepay.secret || undefined,
    mode: effective.sepay.mode,
  });
  if (!authResult.ok && !allowDemoLogin) {
    await appendRejectedWebhookLog(env, requestId);
    return json({ error: "INVALID_SIGNATURE" }, 401);
  }
  const signatureValid = authResult.ok;
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return json({ error: "INVALID_PAYLOAD" }, 400);
  }
  const providerTransactionId = String(
    payload.id || payload.referenceCode || payload.reference_code || payload.transactionId || payload.transaction_id || "",
  ).trim();
  if (!providerTransactionId) return json({ error: "MISSING_TRANSACTION_ID" }, 400);

  let snapshot = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = syncTuitionCashbook(snapshot.finance);
    const sepay = mergeSepayLedger(current.sepay);
    const now = new Date().toISOString();
    const duplicate = sepay.bankTransactions.some((row) => row.provider === "SEPAY" && row.providerTransactionId === providerTransactionId);
    sepay.webhookLogs = [
      {
        id: `wh-${crypto.randomUUID()}`,
        requestId,
        signatureValid,
        processingStatus: duplicate ? ("DUPLICATE" as const) : ("ACCEPTED" as const),
        providerTransactionId,
        createdAt: now,
      },
      ...sepay.webhookLogs,
    ].slice(0, 200);
    let next: DemoFinance;
    let activatedStudents: DemoStudent[] | undefined;
    let activatedStudentId: string | undefined;
    // Tin Zalo "đã thanh toán" cho giao dịch vừa khớp đủ tiền — xếp ngay sau khi ghi khối tài chính.
    let paidNotice: { studentId: string; receivableId: string; invoiceId?: string; rawPhone: string } | undefined;
    if (duplicate) {
      next = syncTuitionCashbook({ ...current, sepay });
    } else {
      const tx: SepayBankTransaction = {
        id: `btx-${crypto.randomUUID()}`,
        provider: "SEPAY",
        providerTransactionId,
        accountNumber: String(payload.accountNumber || payload.account_number || sepay.settings.accountNumber),
        transactionDate: String(payload.transactionDate || payload.transaction_date || now),
        transferType: String(payload.transferType || payload.transfer_type || "in").toUpperCase() === "OUT" ? "OUT" : "IN",
        transferAmount: Math.round(Number(payload.transferAmount ?? payload.transfer_amount ?? payload.amount ?? 0)),
        content: [payload.content, payload.description, payload.code].filter(Boolean).join(" "),
        status: "RECEIVED",
        receivedAt: now,
      };
      sepay.bankTransactions = [tx, ...sepay.bankTransactions];
      const resolveStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
      const named = contentNamedStudentIds(tx.content, sepay, resolveStudents);
      // Mã HP{lớp}{HV} trên phiếu báo dùng chung mọi kỳ của học viên ở lớp đó — quy về
      // mã order ACTIVE của đúng phiếu đang mở (khớp số tiền, phiếu cũ trước) TRƯỚC khi
      // khớp thẳng: tránh tiền tháng 11 rơi vào phiếu tháng 10 đang mang đúng chuỗi mã.
      // Mã giải mã được là của học viên nào thì chỉ ghi cho học viên đó (guardContentStudent).
      const rawCode = extractPaymentCode(tx.content) || "";
      const resolveClasses = rawCode ? cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses()) : [];
      const friendly = rawCode ? friendlyPaymentOrderCode(sepay, rawCode, resolveClasses, resolveStudents, tx.transferAmount) : undefined;
      let matchResult = friendly
        ? guardContentStudent(processBankTransaction(sepay, { ...tx, content: friendly }), named)
        : guardContentStudent(processBankTransaction(sepay, tx), named);
      if (friendly) {
        if (matchResult.transaction.status === "ALLOCATED") matchResult = { ...matchResult, transaction: { ...matchResult.transaction, content: tx.content } };
        else matchResult = guardContentStudent(processBankTransaction(sepay, tx), named);
      }
      let nextLedger = applyMatch(sepay, matchResult);
      // Hóa đơn ở lại PENDING — invoice-outbox.ts xử lý ngoài cửa sổ ghi này (R1, R12).
      let cashbook = current.cashbook;

      // Tiền đã khớp đúng khoản phải thu — kích hoạt buổi học ngay trong lượt webhook này,
      // dùng đúng tuitionCollectionCharge như đường thu tay (D2, Phase 5).
      if (matchResult.event === "TuitionPaymentCompleted" && matchResult.receivable && matchResult.payment) {
        const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
        const storedStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
        const students = clampPaidThroughToReceipts(storedStudents, classes, nextLedger);
        const storedSessions = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
        const sessions = Array.isArray(storedSessions) ? storedSessions : defaultLessonSessions();
        const paidPaymentId = matchResult.payment.id;
        paidNotice = {
          studentId: matchResult.receivable.studentId,
          receivableId: matchResult.receivable.id,
          invoiceId: nextLedger.invoices.find((row) => row.paymentId === paidPaymentId)?.id,
          rawPhone: storedStudents.find((row) => row.id === matchResult.receivable!.studentId)?.parentPhone1 || "",
        };

        const activation = activateSessionsForPayment({
          ledger: nextLedger,
          receivable: matchResult.receivable,
          payment: matchResult.payment,
          students,
          classes,
          sessions,
        });

        if (activation.status === "OK") {
          nextLedger = activation.ledger;
          activatedStudents = activation.students;
          activatedStudentId = matchResult.receivable.studentId;
          const cls = classes.find((row) => row.id === matchResult.receivable!.classId);
          cashbook = [
            {
              id: `cash-${crypto.randomUUID()}`,
              date: now.slice(0, 10),
              kind: "IN" as const,
              source: "TUITION" as const,
              category: "Học phí",
              description: `Thu học phí ${activation.charge.period}`,
              amount: Number(activation.receipt.amount ?? activation.charge.amount),
              method: activation.receipt.method || "Chuyển khoản",
              branchId: cls?.branchId,
              studentName: activation.receipt.studentName || "",
              tuitionId: matchResult.receivable.id,
              receiptId: activation.receipt.id,
            },
            ...current.cashbook,
          ];
        } else if (activation.status === "ERROR") {
          // Tiền đã về, vấn đề là nghiệp vụ nội bộ — không bắt SePay gửi lại. Giữ giao
          // dịch ở NEEDS_REVIEW để kế toán xử lý tay, vẫn ghi khối tài chính bình thường.
          nextLedger = {
            ...nextLedger,
            bankTransactions: nextLedger.bankTransactions.map((row) => (
              row.id === tx.id ? { ...row, status: "NEEDS_REVIEW" as const, reviewReason: activation.reviewReason } : row
            )),
          };
        }
        // ALREADY_ACTIVATED: giữ nguyên nextLedger — biên lai đầy đủ đã có từ lượt trước.
      }

      next = syncTuitionCashbook({
        ...current,
        sepay: nextLedger,
        cashbook,
        recon: rebuildRecon(cashbook, current.recon),
        reconEntries: rebuildReconEntries(cashbook, current.reconEntries),
      });
    }
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
      if (activatedStudents) {
        await persistStudentsMerged(env, activatedStudents);
        await writeAudit(env, { email: "sepay-webhook", name: "Webhook SePay", role: "ADMIN" }, [{
          action: "UPDATE",
          entity: "Student",
          entityId: activatedStudentId || providerTransactionId,
          summary: `Webhook SePay tự kích hoạt buổi học sau khi khớp giao dịch ${providerTransactionId}`,
        }]);
      }
      // Tin "đã thanh toán" luôn được xếp khi tiền khớp đủ, có hay không có hóa đơn. Có hóa đơn
      // thì gắn theo hóa đơn (chống trùng với đường thu tay), không thì gắn theo khoản phải thu.
      if (paidNotice) {
        await enqueueZaloMessage(env, paidNotice.invoiceId
          ? { kind: "INVOICE_ISSUED", invoiceId: paidNotice.invoiceId, studentId: paidNotice.studentId, rawPhone: paidNotice.rawPhone }
          : { kind: "INVOICE_ISSUED", receivableId: paidNotice.receivableId, studentId: paidNotice.studentId, rawPhone: paidNotice.rawPhone });
      }
      // Bắn rồi quên, không kéo dài đường trả response webhook (R1). VPS không có ctx.waitUntil
      // nên đây chỉ là một lời gọi không chờ. Zalo "đã thanh toán" gửi TRƯỚC, hóa đơn MISA sau.
      void processZaloOutbox(env).then(() => processInvoiceOutbox(env)).catch(() => undefined);
      return json({ success: true, ok: true, ...(duplicate ? { duplicate: true } : {}) });
    }
    snapshot = await readFinanceSnapshot(env);
  }
  return json({ error: "CONFLICT" }, 409);
}

/** File sao kê (base64 .xls/.xlsx của BIDV) → các dòng giao dịch. */
function parseStatementFile(fileBase64: string): { rows: BankStatementRow[] } | { error: string } {
  if (!fileBase64 || fileBase64.length > 5_000_000) return { error: "File sao kê chưa hợp lệ — chọn file .xls/.xlsx từ ngân hàng." };
  let sheetRows: unknown[][];
  try {
    const payload = fileBase64.includes(",") ? fileBase64.slice(fileBase64.indexOf(",") + 1) : fileBase64;
    const bytes = Uint8Array.from(atob(payload.replace(/\s+/g, "")), (char) => char.charCodeAt(0));
    const workbook = XLSX.read(bytes, { type: "array" });
    const first = workbook.SheetNames[0];
    sheetRows = first ? XLSX.utils.sheet_to_json(workbook.Sheets[first], { header: 1, defval: "", raw: true }) as unknown[][] : [];
  } catch {
    return { error: "Không đọc được file — dùng file .xls/.xlsx xuất từ BIDV." };
  }
  // File BIDV gốc: tự tìm cột ngày / ghi có / nội dung theo tiêu đề; không thấy thì đọc B/D/F như cũ.
  const remapped = remapStatementColumns(sheetRows);
  const rows = extractStatementRows(remapped.rows, Boolean(remapped.columns && remapped.columns.debit >= 0));
  if (!rows.length) return { error: "File không có dòng giao dịch nào — cần các cột Ngày giao dịch, Ghi có, Nội dung (hoặc B/D/F)." };
  return { rows };
}

function summarizeStatement(rows: BankImportRowOutcome[]) {
  const credit = rows.filter((row) => row.amount > 0);
  const applied = rows.filter((row) => row.result === "APPLIED");
  const queued = rows.filter((row) => row.queued);
  return {
    total: rows.length,
    credit: credit.length,
    debit: rows.filter((row) => row.amount <= 0).length,
    applied: applied.length,
    appliedAmount: applied.reduce((sum, row) => sum + row.amount, 0),
    queued: queued.length,
    queuedAmount: queued.reduce((sum, row) => sum + row.amount, 0),
    expense: rows.filter((row) => row.result === "EXPENSE").length,
    expenseAmount: rows.filter((row) => row.result === "EXPENSE").reduce((sum, row) => sum - row.amount, 0),
    duplicate: rows.filter((row) => row.result === "DUPLICATE" && !row.queued).length,
    skipped: rows.filter((row) => !["APPLIED", "DUPLICATE", "EXPENSE"].includes(row.result)).length,
  };
}

/**
 * Nhập sao kê — dùng chung cho nút trên web và API của trợ lý (Muse).
 * preview: chạy khớp trên bản sao, không ghi; dòng tiền vào không khớp được đánh dấu
 * queued (sẽ vào hàng đợi). apply: ghi dòng khớp (biên lai, buổi học, sổ quỹ) + đưa
 * dòng lệch vào hàng đợi Giao dịch lệch trong cùng một lượt ghi.
 */
async function importBankStatement(
  env: DemoEnv,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
  fileName: string,
  statementRows: BankStatementRow[],
  mode: "preview" | "apply",
  expectedStored?: string,
): Promise<{ status: number; body: Record<string, unknown>; stored?: string }> {
  const loadContext = async () => {
    const classes = cleanClasses(await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses();
    const students = cleanStudents(await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents();
    const storedSessions = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
    const sessions = Array.isArray(storedSessions) ? storedSessions : defaultLessonSessions();
    return { classes, students, sessions };
  };
  if (mode === "preview") {
    const snapshot = await readFinanceSnapshot(env);
    const { classes, students, sessions } = await loadContext();
    const sepay = syncTuitionReceivables(mergeSepayLedger(syncTuitionCashbook(snapshot.finance).sepay), classes, students, sessions);
    const outcome = processBankStatement(sepay, students, statementRows, undefined, classes, { queueUnmatched: true, recordExpenses: true });
    return { status: 200, body: { ok: true, fileName, rows: outcome.rows, summary: summarizeStatement(outcome.rows) }, stored: snapshot.stored };
  }
  let appliedResult: { rows: BankImportRowOutcome[]; applied: number; finance: DemoFinance; students?: DemoStudent[] } | undefined;
  let snapshot = await readFinanceSnapshot(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (expectedStored !== undefined && snapshot.stored !== expectedStored) {
      return { status: 409, body: { error: "Dữ liệu học phí đã thay đổi kể từ lúc xem trước — cần xem trước lại.", code: "STALE_PREVIEW" } };
    }
    const current = syncTuitionCashbook(snapshot.finance);
    const { classes, students: storedStudents, sessions } = await loadContext();
    const sepay = syncTuitionReceivables(mergeSepayLedger(current.sepay), classes, storedStudents, sessions);
    const outcome = processBankStatement(sepay, storedStudents, statementRows, undefined, classes, { queueUnmatched: true, recordExpenses: true });
    let nextLedger = outcome.ledger;
    let students = clampPaidThroughToReceipts(storedStudents, classes, nextLedger);
    let studentsChanged = false;
    let cashbook = current.cashbook;
    // Khoản chi trên sao kê (ghi nợ) → dòng CHI trong Quản lý thu chi, ngày hôm nay, ngày chứng từ = ngày giao dịch.
    if (outcome.expenses.length) {
      const today = vnToday();
      cashbook = [
        ...outcome.expenses.map((tx) => ({
          id: `cash-${crypto.randomUUID()}`,
          date: today,
          voucherDate: tx.transactionDate || "",
          kind: "OUT" as const,
          source: "MANUAL" as const,
          category: "Chi theo sao kê",
          description: `Chi chuyển khoản: ${String(tx.content || "").slice(0, 260)}`,
          amount: Math.round(Number(tx.transferAmount) || 0),
          method: "Chuyển khoản",
          bankTransactionId: tx.id,
        })),
        ...cashbook,
      ];
    }
    // Tiền đã khớp đúng khoản phải thu — kích hoạt buổi học + ghi sổ quỹ như đường SePay.
    for (const match of outcome.completed) {
      const recorded = recordMatchedPayment({ ledger: nextLedger, students, classes, sessions, cashbook, match });
      nextLedger = recorded.ledger;
      students = recorded.students;
      cashbook = recorded.cashbook;
      studentsChanged = studentsChanged || recorded.studentsChanged;
    }
    const next = syncTuitionCashbook({
      ...current,
      sepay: nextLedger,
      cashbook,
      recon: rebuildRecon(cashbook, current.recon),
      reconEntries: rebuildReconEntries(cashbook, current.reconEntries),
    });
    const statementTodayLock = await todayLockedError(env);
    if (statementTodayLock) return { status: 409, body: { error: statementTodayLock } };
    const statementLockHit = lockedCashbookTouch(current.cashbook, next.cashbook, await readReconLockDates(env));
    if (statementLockHit) return { status: 409, body: { error: lockedDayError(statementLockHit) } };
    if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
      if (studentsChanged) await persistStudentsMerged(env, students);
      const queued = outcome.rows.filter((row) => row.queued).length;
      await writeAudit(env, actor, [{
        action: "UPDATE",
        entity: "Finance",
        entityId: "bank-statement",
        summary: `Nhập sao kê ${fileName}: ghi nhận ${outcome.completed.length}/${outcome.rows.length} giao dịch${queued ? `, ${queued} giao dịch lệch chuyển sang Giao dịch lệch` : ""}${outcome.expenses.length ? `, ${outcome.expenses.length} khoản chi ghi vào Quản lý thu chi` : ""}`,
      }]);
      try { await recordStatementImport(env, actor, fileName, outcome.completed.length, outcome.rows.length); } catch { /* nhật ký task, không chặn nhập sao kê */ }
      appliedResult = { rows: outcome.rows, applied: outcome.completed.length, finance: next, students: studentsChanged ? students : undefined };
      break;
    }
    if (expectedStored !== undefined) {
      return { status: 409, body: { error: "Dữ liệu học phí đã thay đổi kể từ lúc xem trước — cần xem trước lại.", code: "STALE_PREVIEW" } };
    }
    snapshot = await readFinanceSnapshot(env);
  }
  if (!appliedResult) {
    return { status: 409, body: { error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi thử lại giúp em." } };
  }
  return {
    status: 200,
    body: { ok: true, fileName, rows: appliedResult.rows, summary: summarizeStatement(appliedResult.rows), finance: appliedResult.finance, students: appliedResult.students },
  };
}

/** Ghi một lượt khớp tiền đã ALLOCATED: kích hoạt buổi học + dòng sổ quỹ (ngày nhập, ngày chứng từ = ngày giao dịch). */
function recordMatchedPayment(input: {
  ledger: SepayLedger;
  students: DemoStudent[];
  classes: DemoClass[];
  sessions: DemoLessonSession[];
  cashbook: DemoCashEntry[];
  match: MatchApplyResult;
}): { ledger: SepayLedger; students: DemoStudent[]; cashbook: DemoCashEntry[]; studentsChanged: boolean } {
  const { match } = input;
  let { ledger, students, cashbook } = input;
  if (!match.receivable || !match.payment) return { ledger, students, cashbook, studentsChanged: false };
  const activation = activateSessionsForPayment({ ledger, receivable: match.receivable, payment: match.payment, students, classes: input.classes, sessions: input.sessions });
  if (activation.status === "OK") {
    const cls = input.classes.find((row) => row.id === match.receivable!.classId);
    cashbook = [
      {
        id: `cash-${crypto.randomUUID()}`,
        date: vnToday(),
        voucherDate: match.transaction.transactionDate || "",
        kind: "IN" as const,
        source: "TUITION" as const,
        category: "Học phí",
        description: `Thu học phí ${activation.charge.period}`,
        amount: Number(activation.receipt.amount ?? activation.charge.amount),
        method: activation.receipt.method || "Chuyển khoản",
        branchId: cls?.branchId,
        studentName: activation.receipt.studentName || "",
        tuitionId: match.receivable.id,
        receiptId: activation.receipt.id,
      },
      ...cashbook,
    ];
    return { ledger: activation.ledger, students: activation.students, cashbook, studentsChanged: true };
  }
  if (activation.status === "ERROR") {
    ledger = {
      ...ledger,
      bankTransactions: ledger.bankTransactions.map((row) => (
        row.id === match.transaction.id ? { ...row, status: "NEEDS_REVIEW" as const, reviewReason: activation.reviewReason } : row
      )),
    };
  }
  return { ledger, students, cashbook, studentsChanged: false };
}

async function applySepayAction(current: DemoFinance, body: Record<string, unknown>): Promise<DemoFinance> {
  const action = String(body.action || "");
  let sepay = mergeSepayLedger(current.sepay);
  if (action === "create-receivable") {
    const studentId = String(body.studentId || "");
    const studentName = String(body.studentName || "Học viên");
    const amountDue = Math.max(1000, Math.round(Number(body.amountDue || 0)));
    const billingPeriod = String(body.billingPeriod || "Khoản thu mới");
    const created = createReceivable({
      studentId,
      studentName,
      amountDue,
      billingPeriod,
      usedCodes: sepay.paymentOrders.map((row) => row.paymentCode),
    });
    sepay = {
      ...sepay,
      receivables: [created.receivable, ...sepay.receivables],
      paymentOrders: [refreshOrderQr(created.order, sepay.settings, amountDue), ...sepay.paymentOrders],
    };
  } else if (action === "update-settings") {
    sepay = applySepayAccount(sepay, {
      bank: String(body.bank || sepay.settings.bank).trim() || sepay.settings.bank,
      accountNumber: String(body.accountNumber || sepay.settings.accountNumber).replace(/\s+/g, "") || sepay.settings.accountNumber,
      accountName: String(body.accountName || sepay.settings.accountName).trim() || sepay.settings.accountName,
      qrImageDataUrl: typeof body.qrImageDataUrl === "string" ? body.qrImageDataUrl : sepay.settings.qrImageDataUrl,
    });
  } else if (action === "retry-invoice") {
    // Đưa về PENDING + xoá bộ đếm để invoice-outbox.ts thử lại ở lượt kế tiếp.
    sepay = {
      ...sepay,
      invoices: sepay.invoices.map((invoice) => (
        invoice.id === body.invoiceId ? { ...invoice, status: "PENDING" as const, retryCount: 0, lastError: undefined, processingAt: undefined } : invoice
      )),
    };
  } else if (action === "ignore") {
    sepay = {
      ...sepay,
      bankTransactions: sepay.bankTransactions.map((row) => row.id === body.transactionId ? { ...row, status: "IGNORED" } : row),
    };
  } else if (action === "match") {
    const tx = sepay.bankTransactions.find((row) => row.id === body.transactionId);
    const order = sepay.paymentOrders.find((row) => row.paymentCode === body.paymentCode);
    if (tx && order) {
      // Kế toán chọn mã thủ công: khớp đúng mã được chọn. Trước đây mã được nối vào
      // CUỐI nội dung nên mã cũ (sai) đứng đầu vẫn được trích ra và khớp lại mã cũ.
      const patched = { ...tx, content: `${tx.content} ${order.paymentCode}`.trim(), status: "RECEIVED" as const };
      const result = processBankTransaction({ ...sepay, bankTransactions: sepay.bankTransactions.map((row) => row.id === tx.id ? patched : row) }, { ...patched, content: order.paymentCode });
      sepay = applyMatch(sepay, { ...result, transaction: { ...result.transaction, content: patched.content } });
      // Hóa đơn ở lại PENDING — invoice-outbox.ts xử lý ngoài cửa sổ ghi này (R1, R12).
    }
  }
  return { ...current, sepay };
}

/** Số khóa kế toán chọn để thu (lớp thu khóa) — số nguyên dương, không hợp lệ thì bỏ qua. */
function requestedCourseIndex(value: unknown) {
  const index = Math.round(Number(value) || 0);
  return index >= 1 && index <= 500 ? index : undefined;
}

/**
 * Gán một giao dịch trong hàng đợi Giao dịch lệch cho đúng phiếu của học viên do kế toán
 * chọn: ghi thu như khớp mã (biên lai, buổi học, sổ quỹ ngày nhập / ngày chứng từ = ngày
 * giao dịch). Tiền ≤ số còn nợ (thu đủ hoặc thu một phần). Tiền lớn hơn → dùng Thu thủ công.
 */
async function assignReviewTransactionAction(
  env: DemoEnv,
  snapshot: { stored: string; finance: DemoFinance },
  body: Record<string, unknown>,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
): Promise<{ error?: string; status?: number; conflict?: boolean; finance?: DemoFinance; students?: DemoStudent[] }> {
  const current = syncTuitionCashbook(snapshot.finance);
  const classes = cleanClasses(await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses();
  const storedStudents = cleanStudents(await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents();
  const storedSessions = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
  const sessions = Array.isArray(storedSessions) ? storedSessions : defaultLessonSessions();
  const ledger = syncTuitionReceivables(mergeSepayLedger(current.sepay), classes, storedStudents, sessions);
  const tx = ledger.bankTransactions.find((row) => row.id === String(body.transactionId || ""));
  if (!tx || tx.transferType !== "IN" || !["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"].includes(tx.status)) return { error: "Giao dịch không còn trong hàng đợi." };
  const receivable = ledger.receivables.find((row) => row.id === String(body.receivableId || ""));
  if (!receivable || !["OPEN", "PARTIALLY_PAID"].includes(receivable.status) || receivable.balanceDue <= 0) return { error: "Phiếu đã chọn không còn nợ — chọn phiếu khác." };
  if (tx.transferAmount > receivable.balanceDue) {
    return { error: `Số tiền chuyển ${tx.transferAmount.toLocaleString("vi-VN")}đ lớn hơn số còn nợ của phiếu (${receivable.balanceDue.toLocaleString("vi-VN")}đ) — dùng "Thu thủ công" để chia nhiều phiếu / thu trước, rồi bấm "Đã thu thủ công".` };
  }
  const order = ledger.paymentOrders.find((row) => row.receivableId === receivable.id && row.status === "ACTIVE");
  if (!order) return { error: "Phiếu chưa có mã thanh toán đang mở — dùng Thu thủ công." };
  const pending = { ...tx, status: "RECEIVED" as const, reviewReason: undefined };
  const matched = processBankTransaction(
    { ...ledger, settings: { ...ledger.settings, autoPartial: true } },
    { ...pending, content: order.paymentCode },
  );
  if (matched.transaction.status !== "ALLOCATED" || !matched.receivable || !matched.payment) {
    return { error: `Không ghi được vào phiếu này (${matched.transaction.reviewReason || matched.transaction.status}).` };
  }
  const student = storedStudents.find((row) => row.id === receivable.studentId);
  const resolution = `Gán cho ${student?.fullName || receivable.studentName} (${student?.code || ""}) — ${receivable.billingPeriod}`;
  const match = { ...matched, transaction: { ...matched.transaction, content: tx.content, reviewNote: tx.reviewNote, resolution, resolvedBy: actor.name || actor.email, resolvedAt: new Date().toISOString() } };
  let nextLedger = applyMatch(ledger, match);
  const students = clampPaidThroughToReceipts(storedStudents, classes, nextLedger);
  const recorded = recordMatchedPayment({ ledger: nextLedger, students, classes, sessions, cashbook: current.cashbook, match });
  nextLedger = recorded.ledger;
  const next = syncTuitionCashbook({
    ...current,
    sepay: nextLedger,
    cashbook: recorded.cashbook,
    recon: rebuildRecon(recorded.cashbook, current.recon),
    reconEntries: rebuildReconEntries(recorded.cashbook, current.reconEntries),
  });
  const todayLock = await todayLockedError(env);
  if (todayLock) return { error: todayLock, status: 409 };
  const lockHit = lockedCashbookTouch(current.cashbook, next.cashbook, await readReconLockDates(env));
  if (lockHit) return { error: lockedDayError(lockHit), status: 409 };
  if (!await persistFinanceIfUnchanged(env, snapshot.stored, next)) return { conflict: true };
  if (recorded.studentsChanged) await persistStudentsMerged(env, recorded.students);
  await writeAudit(env, actor, [{ action: "UPDATE", entity: "Finance", entityId: tx.id, summary: `Giao dịch lệch ${tx.transferAmount.toLocaleString("vi-VN")}đ (${String(tx.content).slice(0, 60)}): ${resolution}` }]);
  return { finance: next, students: recorded.studentsChanged ? recorded.students : undefined };
}

/** Đánh dấu giao dịch lệch đã xử lý (đã thu thủ công / không phải học phí) — không đụng tiền. */
async function resolveReviewTransaction(
  env: DemoEnv,
  snapshot: { stored: string; finance: DemoFinance },
  body: Record<string, unknown>,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
): Promise<{ error?: string; status?: number; finance?: DemoFinance }> {
  const current = syncTuitionCashbook(snapshot.finance);
  const ledger = mergeSepayLedger(current.sepay);
  const tx = ledger.bankTransactions.find((row) => row.id === String(body.transactionId || ""));
  if (!tx || !["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"].includes(tx.status)) return { error: "Giao dịch không còn trong hàng đợi." };
  const kind = String(body.resolution || "") === "MANUAL_COLLECTED" ? "Đã thu thủ công" : "Không phải học phí — bỏ qua";
  const note = String(body.note || "").trim().slice(0, 200);
  const resolved = { ...tx, status: "IGNORED" as const, resolution: note ? `${kind}: ${note}` : kind, resolvedBy: actor.name || actor.email, resolvedAt: new Date().toISOString() };
  const next = { ...current, sepay: { ...ledger, bankTransactions: ledger.bankTransactions.map((row) => row.id === tx.id ? resolved : row) } };
  if (!await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
    return { error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi thao tác lại giúp em.", status: 409 };
  }
  await writeAudit(env, actor, [{ action: "UPDATE", entity: "Finance", entityId: tx.id, summary: `Giao dịch lệch ${tx.transferAmount.toLocaleString("vi-VN")}đ (${String(tx.content).slice(0, 60)}): ${resolved.resolution}` }]);
  return { finance: next };
}

/**
 * "Thu vô danh" ở Giao dịch lệch: tiền đã về nhưng chưa dò ra học viên — vẫn ghi một dòng
 * THU vào Quản lý thu chi (ngày hôm nay, ngày chứng từ = ngày giao dịch) để đối soát được
 * trong ngày, không gắn phiếu học phí nào. Giao dịch rời hàng đợi, ghi chú "Thu vô danh"
 * + mã dòng sổ quỹ để sau này IT gán lại đúng học viên.
 */
async function collectAnonymousTransaction(
  env: DemoEnv,
  snapshot: { stored: string; finance: DemoFinance },
  body: Record<string, unknown>,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
): Promise<{ error?: string; status?: number; finance?: DemoFinance }> {
  const current = syncTuitionCashbook(snapshot.finance);
  const ledger = mergeSepayLedger(current.sepay);
  const tx = ledger.bankTransactions.find((row) => row.id === String(body.transactionId || ""));
  if (!tx || tx.transferType === "OUT" || !["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"].includes(tx.status)) return { error: "Giao dịch không còn trong hàng đợi." };
  const amount = Math.round(Number(tx.transferAmount) || 0);
  if (amount <= 0) return { error: "Giao dịch không có số tiền vào." };
  if (current.cashbook.some((row) => row.bankTransactionId === tx.id)) return { error: "Giao dịch này đã được ghi thu vô danh." };
  const todayLock = await todayLockedError(env);
  if (todayLock) return { error: todayLock, status: 409 };
  const today = vnToday();
  if ((await readReconLockDates(env)).has(today)) return { error: lockedDayError(today), status: 409 };
  const note = String(body.note || "").trim().slice(0, 200);
  const entry: DemoCashEntry = {
    id: `cash-${crypto.randomUUID()}`,
    date: today,
    voucherDate: tx.transactionDate || "",
    kind: "IN",
    source: "MANUAL",
    category: "Thu vô danh",
    description: `Thu vô danh (chưa xác định học viên)${note ? ` — ${note}` : ""} · ${String(tx.content || "").slice(0, 220)}`,
    amount,
    method: "Chuyển khoản",
    bankTransactionId: tx.id,
  };
  const cashbook = [entry, ...current.cashbook];
  const resolved = {
    ...tx,
    status: "IGNORED" as const,
    resolution: `Thu vô danh — chưa xác định học viên (sổ quỹ ${entry.id})${note ? `: ${note}` : ""}`,
    resolvedBy: actor.name || actor.email,
    resolvedAt: new Date().toISOString(),
  };
  const next: DemoFinance = {
    ...current,
    cashbook,
    recon: rebuildRecon(cashbook, current.recon),
    reconEntries: rebuildReconEntries(cashbook, current.reconEntries),
    sepay: { ...ledger, bankTransactions: ledger.bankTransactions.map((row) => row.id === tx.id ? resolved : row) },
  };
  if (!await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
    return { error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi thao tác lại giúp em.", status: 409 };
  }
  await writeAudit(env, actor, [{ action: "CREATE", entity: "CashEntry", entityId: entry.id, summary: `Thu vô danh ${amount.toLocaleString("vi-VN")}đ từ giao dịch lệch (${String(tx.content).slice(0, 60)})${note ? ` — ${note}` : ""}` }]);
  return { finance: next };
}

const REVIEW_QUEUE_STATUSES = ["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"];
const REVIEW_REASON_TEXT: Record<string, string> = {
  NO_PAYMENT_CODE: "Không CK theo mã QR", UNKNOWN_PAYMENT_CODE: "Không CK theo mã QR", PARTIAL_PAYMENT: "Thiếu tiền",
  OVERPAYMENT: "Trả thừa", ALREADY_PAID: "Phiếu đã thu đủ (CK trùng)", INVALID_RECEIVABLE: "Không hợp lệ",
  CODE_STUDENT_MISMATCH: "Mã của học viên khác", AMBIGUOUS_STUDENT: "Mã nhiều học viên", NO_OPEN_BILL: "Không còn phiếu nợ",
  AMOUNT_MISMATCH: "Sai số tiền", MANUAL_CHECK: "Cần xem tay",
};
const vnDateTime = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const t = d.toISOString();
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)} ${t.slice(11, 16)}`;
};
const classCodeKey = (value: unknown) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Hàng đợi Giao dịch lệch cho trợ lý (chỉ đọc). */
async function opsReviewQueue(env: DemoEnv): Promise<Record<string, unknown>> {
  const snapshot = await readFinanceSnapshot(env);
  const ledger = mergeSepayLedger(syncTuitionCashbook(snapshot.finance).sepay);
  const students = cleanStudents(await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents();
  const classes = cleanClasses(await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses();
  const items = ledger.bankTransactions
    .filter((row) => row.transferType !== "OUT" && REVIEW_QUEUE_STATUSES.includes(row.status))
    .sort((a, b) => String(b.transactionDate || "").localeCompare(String(a.transactionDate || "")))
    .map((row) => {
      const named = contentNamedStudentIds(row.content, ledger, students)
        .map((id) => students.find((s) => s.id === id))
        .filter((s): s is DemoStudent => Boolean(s))
        .map((s) => ({ code: s.code, name: s.fullName, classes: classes.filter((c) => (c.studentIds || []).includes(s.id)).map((c) => c.code || c.name) }));
      return {
        transactionId: row.id,
        date: vnDateTime(row.transactionDate || row.receivedAt),
        amount: Math.round(Number(row.transferAmount) || 0),
        content: row.content,
        reason: REVIEW_REASON_TEXT[String(row.reviewReason || "")] || row.reviewReason || row.status,
        note: row.reviewNote || "",
        namedStudents: named,
      };
    });
  const total = items.reduce((sum, row) => sum + row.amount, 0);
  return { ok: true, count: items.length, total, items, message: `Hàng đợi Giao dịch lệch: ${items.length} giao dịch (${total.toLocaleString("vi-VN")}đ).` };
}

/**
 * Trợ lý xử lý một giao dịch lệch theo lệnh anh Vũ: "collect" = thu thủ công cho học viên
 * (mã HV + lớp) đúng số tiền giao dịch; "ignore" = không phải học phí. mode "preview" không ghi.
 */
async function opsReviewAction(
  env: DemoEnv,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
  input: { transactionId: string; action: "collect" | "ignore"; studentCode?: string; classCode?: string; courseIndex?: number; note?: string },
  mode: "preview" | "apply",
  expectedStored?: string,
): Promise<{ status: number; body: Record<string, unknown>; stored?: string }> {
  const snapshot = await readFinanceSnapshot(env);
  if (expectedStored !== undefined && snapshot.stored !== expectedStored) {
    return { status: 409, body: { code: "STALE_PREVIEW", error: "Dữ liệu học phí đã thay đổi sau lúc xem trước — gọi /review/preview lại." } };
  }
  const ledger = mergeSepayLedger(syncTuitionCashbook(snapshot.finance).sepay);
  const tx = ledger.bankTransactions.find((row) => row.id === input.transactionId);
  if (!tx || tx.transferType === "OUT" || !REVIEW_QUEUE_STATUSES.includes(tx.status)) {
    return { status: 404, body: { code: "NOT_IN_QUEUE", error: "Giao dịch không có (hoặc không còn) trong hàng đợi Giao dịch lệch — gọi GET /review-queue để xem lại." } };
  }
  const amount = Math.round(Number(tx.transferAmount) || 0);
  const txInfo = { transactionId: tx.id, date: vnDateTime(tx.transactionDate || tx.receivedAt), amount, content: tx.content };
  const note = String(input.note || "").trim().slice(0, 200);
  if (input.action === "ignore") {
    if (mode === "preview") {
      return { status: 200, stored: snapshot.stored, body: { ok: true, action: "ignore", transaction: txInfo, message: `Bỏ qua giao dịch ${amount.toLocaleString("vi-VN")}đ ngày ${txInfo.date} (không phải học phí${note ? `: ${note}` : ""}). Không ghi tiền cho ai.` } };
    }
    const resolved = await resolveReviewTransaction(env, snapshot, { transactionId: tx.id, resolution: "NOT_TUITION", note }, actor);
    if (resolved.error) return { status: resolved.status || 400, body: { error: resolved.error } };
    return { status: 200, body: { ok: true, action: "ignore", transaction: txInfo, message: `Đã bỏ qua giao dịch ${amount.toLocaleString("vi-VN")}đ ngày ${txInfo.date} (không phải học phí).` } };
  }
  // collect: tìm học viên theo mã HV, lớp theo mã lớp (học viên phải thuộc lớp đó).
  const students = cleanStudents(await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents();
  const classes = cleanClasses(await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses();
  const code = String(input.studentCode || "").trim().toUpperCase();
  if (!code) return { status: 400, body: { code: "STUDENT_CODE_REQUIRED", error: "Cần mã học viên (vd HV0333)." } };
  const found = students.filter((row) => String(row.code || "").trim().toUpperCase() === code);
  if (!found.length) return { status: 400, body: { code: "STUDENT_NOT_FOUND", error: `Không có học viên mã ${code}.` } };
  if (found.length > 1) return { status: 400, body: { code: "STUDENT_CODE_DUPLICATE", error: `Mã ${code} đang trùng ${found.length} học viên — xử lý trên web.` } };
  const student = found[0];
  const studentClasses = classes.filter((row) => (row.studentIds || []).includes(student.id));
  let cls: DemoClass | undefined;
  if (input.classCode) {
    cls = studentClasses.find((row) => classCodeKey(row.code) === classCodeKey(input.classCode) || classCodeKey(row.name) === classCodeKey(input.classCode));
    if (!cls) {
      return { status: 400, body: { code: "CLASS_MISMATCH", error: `${student.fullName} (${student.code}) không học lớp ${input.classCode}. Lớp của bạn: ${studentClasses.map((row) => row.code || row.name).join(", ") || "(không có)"}.` } };
    }
  } else if (studentClasses.length === 1) {
    cls = studentClasses[0];
  } else {
    return { status: 400, body: { code: "CLASS_REQUIRED", error: `${student.fullName} (${student.code}) đang ở ${studentClasses.length} lớp: ${studentClasses.map((row) => row.code || row.name).join(", ") || "(không có)"} — cần mã lớp.` } };
  }
  const body: Record<string, unknown> = {
    studentId: student.id,
    classId: cls.id,
    method: "TRANSFER",
    amount,
    reviewTransactionId: tx.id,
    ...(input.courseIndex ? { courseIndex: input.courseIndex } : {}),
    ...(note ? { note } : {}),
    dryRun: mode === "preview",
  };
  const result = await collectTuitionAction(env, snapshot, body, actor);
  if (result.conflict) return { status: 409, body: { code: "STALE_PREVIEW", error: "Dữ liệu học phí vừa thay đổi — gọi /review/preview lại." } };
  if (result.error) return { status: 400, body: { code: "COLLECT_FAILED", error: result.error } };
  if (mode === "preview" && result.preview) {
    const p = result.preview;
    const message = `Thu ${amount.toLocaleString("vi-VN")}đ (CK ngày ${txInfo.date}) cho ${p.studentName} (${p.studentCode}) lớp ${p.classCode}: `
      + p.steps.map((step) => `${step.label} ${step.amount.toLocaleString("vi-VN")}đ${step.remainingOnBill > 0 ? ` (phiếu còn thiếu ${step.remainingOnBill.toLocaleString("vi-VN")}đ)` : ""}`).join("; ")
      + `. Sau khi thu: ${p.openBillsAfter.length ? `còn nợ ${p.openBillsAfter.map((row) => `${row.period} ${row.balanceDue.toLocaleString("vi-VN")}đ`).join(", ")}` : "hết nợ lớp này"}.`;
    return { status: 200, stored: snapshot.stored, body: { ok: true, action: "collect", transaction: txInfo, preview: p, message } };
  }
  return { status: 200, body: { ok: true, action: "collect", transaction: txInfo, message: `Đã thu ${amount.toLocaleString("vi-VN")}đ cho ${student.fullName} (${student.code}) lớp ${cls.code || cls.name}; giao dịch đã gỡ khỏi hàng đợi.` } };
}

interface CollectPreview {
  studentCode: string;
  studentName: string;
  classCode: string;
  method: string;
  total: number;
  steps: { label: string; amount: number; remainingOnBill: number }[];
  openBillsAfter: { period: string; balanceDue: number }[];
  voucherDate: string;
}

async function collectTuitionAction(
  env: DemoEnv,
  snapshot: { stored: string; finance: DemoFinance },
  body: Record<string, unknown>,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
): Promise<{ error?: string; conflict?: boolean; finance?: DemoFinance; students?: DemoStudent[]; zaloMessage?: EnqueueZaloMessageResult; preview?: CollectPreview }> {
  const current = syncTuitionCashbook(snapshot.finance);
  const studentId = String(body.studentId || "");
  const classId = String(body.classId || "");
  const method = String(body.method || "TRANSFER").toUpperCase() === "CASH" ? "CASH" : "TRANSFER";
  const note = String(body.note || "").trim().slice(0, 300);
  const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const storedStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
  // Mốc đã đóng mà không còn biên lai là dữ liệu treo của bản cũ, bỏ đi để thu lại được.
  const students = clampPaidThroughToReceipts(storedStudents, classes, mergeSepayLedger(current.sepay));
  const storedSessions = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
  const sessions = Array.isArray(storedSessions) ? storedSessions : defaultLessonSessions();
  const cls = classes.find((row) => row.id === classId);
  const student = students.find((row) => row.id === studentId);
  if (!cls || !student) return { error: "Không tìm thấy học viên hoặc lớp." };
  const ledger = mergeSepayLedger(current.sepay);
  // Học viên đã rời lớp (vd đưa về Lớp chờ) vẫn thu được phần còn nợ ở lớp cũ: phiếu của lớp đó
  // đã chốt khi rời lớp và còn số phải thu.
  const owesLeftClass = (ledger.receivables || []).some((row) => row.studentId === student.id && row.classId === cls.id
    && (row.status === "OPEN" || row.status === "PARTIALLY_PAID") && Math.round(Number(row.balanceDue) || 0) > 0);
  // Phiếu đã ngắt lúc về Lớp chờ không thu lại ở lớp cũ — khoản đó đã mang sang
  // lớp/kỳ quay lại, thu ở đây là lập lại công nợ đã hủy.
  const parkedOut = (ledger.receivables || []).some((row) => row.studentId === student.id && row.classId === cls.id
    && row.leftClass?.carryAmount);
  if (!(cls.studentIds || []).includes(student.id) && (!owesLeftClass || parkedOut)) return { error: "Học viên không thuộc lớp này." };
  if (student.tuitionExempt) return { error: "Học viên này đang được miễn học phí." };
  // Số tiền thực thu (trả góp / thu thiếu / thu dư). Bỏ trống = thu đủ theo phiếu như trước.
  const rawAmount = body.amount === undefined || body.amount === null || body.amount === "" ? undefined : Math.round(Number(body.amount));
  if (rawAmount !== undefined && (!Number.isFinite(rawAmount) || rawAmount <= 0)) return { error: "Số tiền thực thu phải lớn hơn 0." };
  if (rawAmount !== undefined && rawAmount > 500_000_000) return { error: "Số tiền thực thu quá lớn." };
  type Collected = { ledger: SepayLedger; steps: CollectAmountStep[]; remainingAfter: number; paidThroughMonth?: string; creditSessionsUsed: number };
  const collect = (target: DemoClass, courseIndexOverride?: number): { error: string } | Collected => {
    if (rawAmount !== undefined) {
      // Lớp tháng: kế toán chọn tháng nào thì thu đúng tháng đó (dư trừ tháng sau, tháng trước giữ nguyên).
      const startMonth = classBillingMode(target) === "MONTHLY" && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(body.month || "")) ? String(body.month) : undefined;
      return collectTuitionAmount({ ledger, student, cls: target, sessions, method, note, amount: rawAmount, courseIndexOverride, startMonth });
    }
    const single = collectManualTuition({ ledger, student, cls: target, sessions, method, note, courseIndexOverride });
    if ("error" in single) {
      // Lớp tháng chỉ còn phần thiếu của phiếu đã thu một phần → thu đủ = truy thu phần đó.
      const currentMonth = monthKey(new Date());
      const carry = classBillingMode(target) === "MONTHLY"
        ? monthlyCarryReceivables(ledger, student.id, target.id)
          .filter((row) => String(String(row.billKey).split("|")[2] || "").split(",")[0] <= currentMonth)
          .reduce((sum, row) => sum + Math.round(Number(row.balanceDue) || 0), 0)
        : 0;
      if (carry > 0) return collectTuitionAmount({ ledger, student, cls: target, sessions, method, note, amount: carry });
      return single;
    }
    return {
      ledger: single.ledger,
      steps: [{ kind: "DUE", payment: single.payment, receipt: single.receipt, receivable: single.receivable, charge: single.charge }],
      remainingAfter: single.remainingAfter,
      paidThroughMonth: single.paidThroughMonth,
      creditSessionsUsed: Number(single.receipt.creditSessionsUsed) || 0,
    };
  };
  let chargeCls = cls;
  // Lớp khóa: thu đúng khóa kế toán chọn trong popup; không chọn thì khóa cũ
  // nhất còn nợ. collectManualTuition tự chặn khóa đã đủ / khóa chưa bắt đầu.
  let result = collect(cls, classBillingMode(cls) === "COURSE" ? requestedCourseIndex(body.courseIndex) : undefined);
  if ("error" in result && classBillingMode(cls) === "COURSE" && requestedCourseIndex(body.courseIndex)) {
    return { error: result.error };
  }
  if ("error" in result) {
    // HV chuyển lớp: khóa đang chạy của lớp đích được phiếu lớp nguồn bao phủ
    // nên charge=0 — cột "Còn nợ" vẫn cộng phiếu đang mở của lớp khác → thu
    // đúng phiếu đó; biên lai/số dư ghi theo lớp của phiếu (khớp đường QR).
    const outstanding = ledger.receivables
      .filter((row) => (
        row.studentId === student.id
        && row.classId !== cls.id
        && ["OPEN", "PARTIALLY_PAID"].includes(String(row.status || ""))
        && Math.round(Number(row.balanceDue) || 0) > 0
        && String(row.billKey || "").split("|")[0] !== "transfer"
      ))
      .sort((a, b) => (Math.round(Number(b.balanceDue) || 0) - Math.round(Number(a.balanceDue) || 0)))[0];
    const sourceCls = outstanding ? classes.find((row) => row.id === outstanding.classId) : undefined;
    if (!sourceCls) return { error: result.error };
    chargeCls = sourceCls;
    result = collect(sourceCls);
  }
  if ("error" in result) return { error: result.error };
  const collected = result;
  // Thu bằng chuyển khoản = khách đã ck, nhân viên đã đối chiếu mã: lập hóa đơn PENDING
  // ngay trong lượt ghi này (hàng chờ MISA phát hành ngoài cửa sổ ghi, dùng thông tin hồ
  // sơ học viên). Hóa đơn cũng là khóa của tin Zalo "đã thanh toán" nên lập khi MISA hoặc
  // Zalo được bật; tiền mặt không xuất hóa đơn / gửi tin tự động. Thu nhiều kỳ một lần
  // (truy thu + kỳ này + thu trước) → mỗi kỳ một hóa đơn, tin Zalo gửi một lần.
  const integration = await readEffectiveIntegrationSettings(env);
  const invoices: SepayInvoice[] = method === "TRANSFER" && (integration.misa.enabled || integration.zalo.enabled)
    ? collected.steps.map((step) => ({
      id: `inv-${crypto.randomUUID()}`,
      studentId: student.id,
      paymentId: step.payment.id,
      receivableId: step.receivable.id,
      provider: "MISA",
      amount: step.payment.allocatedAmount,
      buyerName: student.fullName,
      status: "PENDING" as const,
      retryCount: 0,
      createdAt: step.payment.paidAt,
    }))
    : [];
  let nextLedger = collected.ledger;
  if (invoices.length) nextLedger = { ...nextLedger, invoices: [...invoices, ...nextLedger.invoices] };
  // Thu thủ công cho một giao dịch trong hàng đợi Giao dịch lệch: số tiền phải đúng số tiền
  // giao dịch; gỡ giao dịch khỏi hàng đợi trong CÙNG lượt ghi; sổ quỹ ghi ngày chứng từ = ngày GD.
  const reviewTxId = String(body.reviewTransactionId || "");
  const reviewTx = reviewTxId ? nextLedger.bankTransactions.find((row) => row.id === reviewTxId) : undefined;
  if (reviewTxId) {
    if (!reviewTx || reviewTx.transferType !== "IN" || !["UNMATCHED", "NEEDS_REVIEW", "DUPLICATE"].includes(reviewTx.status)) return { error: "Giao dịch không còn trong hàng đợi Giao dịch lệch." };
    if (rawAmount !== Math.round(Number(reviewTx.transferAmount) || 0)) return { error: `Số tiền thu phải đúng số tiền giao dịch (${Math.round(Number(reviewTx.transferAmount) || 0).toLocaleString("vi-VN")}đ).` };
    const resolution = `Đã thu thủ công: ${student.fullName} (${student.code}) · ${cls.code || cls.name} · ${rawAmount.toLocaleString("vi-VN")}đ`;
    nextLedger = {
      ...nextLedger,
      bankTransactions: nextLedger.bankTransactions.map((row) => row.id === reviewTxId
        ? { ...row, status: "IGNORED" as const, resolution, resolvedBy: actor.name || actor.email, resolvedAt: new Date().toISOString() }
        : row),
    };
  }
  const today = vnToday();
  const stepLabel = (step: CollectAmountStep) => step.kind === "CARRY"
    ? `Truy thu học phí ${step.receipt.billingPeriod}`
    : step.kind === "PREPAY" ? `Thu trước học phí ${step.receipt.billingPeriod}` : `Thu học phí ${step.receipt.billingPeriod}`;
  const cashbook = [
    ...collected.steps.map((step) => ({
      id: `cash-${crypto.randomUUID()}`,
      date: today,
      kind: "IN" as const,
      source: "TUITION" as const,
      category: "Học phí",
      description: note || stepLabel(step),
      amount: Number(step.receipt.amount),
      method: step.receipt.method || "Chuyển khoản",
      branchId: chargeCls.branchId,
      studentName: student.fullName,
      tuitionId: step.receivable.id,
      receiptId: step.receipt.id,
      // Ngày chứng từ: thu từ giao dịch ngân hàng = ngày GD; thu tay (tiền mặt / chuyển khoản bấm
      // tay) = hôm trước — trung tâm cập nhật thu chi hôm nay cho tiền nhận hôm qua (anh Vũ 28/10/2026).
      voucherDate: reviewTx?.transactionDate || previousVnDay(today),
    })),
    ...current.cashbook,
  ];
  const finance: DemoFinance = {
    ...current,
    sepay: nextLedger,
    cashbook,
    recon: rebuildRecon(cashbook, current.recon),
    reconEntries: rebuildReconEntries(cashbook, current.reconEntries),
  };
  const crossClassBalance = chargeCls.id !== cls.id
    ? courseRemainingSessions(student, cls, sessions, nextLedger)
    : undefined;
  const nextStudents = students.map((row) => row.id !== student.id ? row : {
    ...row,
    sessionBalances: {
      ...(row.sessionBalances || {}),
      [chargeCls.id]: collected.remainingAfter,
      ...(crossClassBalance !== undefined ? { [cls.id]: crossClassBalance } : {}),
    },
    tuitionCredits: { ...(row.tuitionCredits || {}), [chargeCls.id]: Math.max(0, Number(row.tuitionCredits?.[chargeCls.id] || 0) - collected.creditSessionsUsed) },
    tuitionPaidThrough: collected.paidThroughMonth
      ? { ...(row.tuitionPaidThrough || {}), [chargeCls.id]: [row.tuitionPaidThrough?.[chargeCls.id] || "", collected.paidThroughMonth].sort().at(-1)! }
      : row.tuitionPaidThrough,
  });
  const todayLock = await todayLockedError(env);
  if (todayLock) return { error: todayLock };
  const lockHit = lockedCashbookTouch(current.cashbook, cashbook, await readReconLockDates(env));
  if (lockHit) return { error: lockedDayError(lockHit) };
  if (body.dryRun === true) {
    // Xem trước (trợ lý hỏi anh Vũ trước khi ghi): không ghi, không gửi Zalo / hóa đơn.
    const openAfter = nextLedger.receivables.filter((row) => row.studentId === student.id && row.classId === chargeCls.id && ["OPEN", "PARTIALLY_PAID"].includes(row.status) && row.balanceDue > 0);
    return {
      preview: {
        studentCode: student.code,
        studentName: student.fullName,
        classCode: chargeCls.code || chargeCls.name,
        method: collected.steps[0]?.receipt.method || "",
        total: collected.steps.reduce((sum, step) => sum + step.payment.allocatedAmount, 0),
        steps: collected.steps.map((step) => ({ label: stepLabel(step), amount: step.payment.allocatedAmount, remainingOnBill: Math.round(Number(step.receivable.balanceDue) || 0) })),
        openBillsAfter: openAfter.map((row) => ({ period: row.billingPeriod, balanceDue: Math.round(Number(row.balanceDue) || 0) })),
        voucherDate: reviewTx?.transactionDate || "",
      },
    };
  }
  // Ghi biên lai trước, và chỉ ghi khi kho tài chính vẫn đúng bản đã đọc.
  if (!await persistFinanceIfUnchanged(env, snapshot.stored, finance)) return { conflict: true };
  await persistStudentsMerged(env, nextStudents);
  const total = collected.steps.reduce((sum, step) => sum + step.payment.allocatedAmount, 0);
  await writeAudit(env, actor, [{
    action: "CREATE",
    entity: "Student",
    entityId: student.id,
    summary: `Đóng học phí ${student.fullName} · ${total.toLocaleString("vi-VN")}đ · ${collected.steps[0].receipt.method}${collected.steps.length > 1 || rawAmount !== undefined
      ? ` · ${collected.steps.map((step) => `${stepLabel(step)} ${step.payment.allocatedAmount.toLocaleString("vi-VN")}đ${step.receivable.balanceDue > 0 ? ` (còn thiếu ${step.receivable.balanceDue.toLocaleString("vi-VN")}đ)` : ""}`).join("; ")}`
      : ` · ${collected.steps[0].charge.period}`}`,
  }]);
  // Chỉ chuyển khoản mới báo khách "đã nhận chuyển khoản". Xếp tin SAU khi khối tài chính
  // đã ghi xong; dùng mẫu "thông báo đã thanh toán" (INVOICE_ISSUED) gắn với hóa đơn vừa lập.
  let zaloMessage: EnqueueZaloMessageResult | undefined;
  if (invoices.length) {
    zaloMessage = await enqueueZaloMessage(env, { kind: "INVOICE_ISSUED", invoiceId: invoices[0].id, studentId: student.id, rawPhone: student.parentPhone1 || "", requestedBy: actor.email });
    // Zalo "đã thanh toán" gửi trước, rồi tự dựng bản nháp hóa đơn MISA để kế toán mở ra là có sẵn
    // bản xem trước. Mỗi bước độc lập: Zalo lỗi không chặn nháp, nháp lỗi không chặn hàng chờ.
    const invoiceIds = invoices.map((row) => row.id);
    void (async () => {
      await processZaloOutbox(env).catch(() => undefined);
      for (const invoiceId of invoiceIds) await prepareInvoiceDraft(env, invoiceId).catch(() => undefined);
      await processInvoiceOutbox(env).catch(() => undefined);
    })();
  }
  return { finance, students: nextStudents, zaloMessage };
}

/**
 * "Gửi yêu cầu thanh toán" — chốt cứng khoản phải thu theo đúng công thức mà đường
 * thu tay dùng (tuitionCollectionCharge), để QR gửi cho phụ huynh và số tiền đường thu
 * tay tính không bao giờ lệch nhau (Đ2, Phase 4).
 */
async function requestPaymentAction(
  env: DemoEnv,
  snapshot: { stored: string; finance: DemoFinance },
  body: Record<string, unknown>,
  actor: Pick<SessionPayload, "email" | "name" | "role">,
): Promise<{ error?: string; conflict?: boolean; finance?: DemoFinance; receivable?: SepayReceivable; zaloMessage?: EnqueueZaloMessageResult }> {
  const current = syncTuitionCashbook(snapshot.finance);
  const studentId = String(body.studentId || "");
  const classId = String(body.classId || "");
  const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
  const students = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
  const storedSessions = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
  const sessions = Array.isArray(storedSessions) ? storedSessions : defaultLessonSessions();
  const cls = classes.find((row) => row.id === classId);
  const student = students.find((row) => row.id === studentId);
  if (!cls || !student) return { error: "Không tìm thấy học viên hoặc lớp." };
  if (!(cls.studentIds || []).includes(student.id)) return { error: "Học viên không thuộc lớp này." };
  if (student.tuitionExempt) return { error: "Học viên này đang được miễn học phí." };

  const ledger = mergeSepayLedger(current.sepay);
  const now = new Date();
  // Lớp khóa: gửi phiếu của KHÓA HIỆN TẠI, số tiền cộng dồn nợ các khóa trước
  // (courseRequestBundle). Khóa hiện tại đã đóng đủ mà còn nợ khóa cũ thì gửi
  // phiếu khóa cũ còn nợ gần nhất. Khóa chưa bắt đầu chưa phát sinh công nợ.
  const isCourseClass = classBillingMode(cls) === "COURSE";
  let courseTarget = 0;
  if (isCourseClass) {
    const currentIndex = classCurrentCourseIndex(cls, now, sessions);
    const due = studentCourseCollectStates(student, cls, sessions, ledger, now)
      .filter((row) => row.status === "DUE" && row.index <= currentIndex);
    courseTarget = (due.find((row) => row.index === currentIndex) || due[due.length - 1])?.index || 0;
    if (!courseTarget) return { error: "Học viên không còn nợ khóa nào đã bắt đầu." };
  }
  const charge = isCourseClass
    ? tuitionCollectionCharge(student, cls, sessions, ledger, now, courseTarget)
    : tuitionCollectionCharge(student, cls, sessions, ledger, now);
  // HV chuyển lớp: khóa đang chạy ở lớp đích được phiếu lớp nguồn bao phủ nên
  // charge=0 — nhưng cột "Còn nợ" trên danh sách vẫn cộng các phiếu đang mở của
  // lớp khác (phiếu lớp nguồn), nên gửi lại đúng phiếu đang mở đó thay vì báo
  // không còn gì để gửi.
  const outstandingOther = charge.amount > 0 ? undefined : ledger.receivables
    .filter((row) => (
      row.studentId === student.id
      && row.classId !== cls.id
      && ["OPEN", "PARTIALLY_PAID"].includes(String(row.status || ""))
      && Math.round(Number(row.balanceDue) || 0) > 0
      && String(row.billKey || "").split("|")[0] !== "transfer"
    ))
    .sort((a, b) => (Math.round(Number(b.balanceDue) || 0) - Math.round(Number(a.balanceDue) || 0)))[0];
  if (charge.amount <= 0 && !outstandingOther) return { error: "Không còn khoản học phí nào cần gửi yêu cầu thanh toán." };

  const iso = now.toISOString();
  const ensured = outstandingOther
    ? { receivable: outstandingOther, ledger }
    : ensureReceivableForCharge(ledger, student, cls, charge, iso);
  // Yêu cầu phải hỏi đúng số dư thật của phiếu: phiếu đã thu một phần hoặc đã áp
  // tín dụng/bảo lưu có balanceDue nhỏ hơn báo giá gross — hỏi charge.amount
  // nguyên sẽ đòi lại phần đã xử lý. Phiếu "sạch" (chưa thu, chưa áp credit)
  // vẫn chốt theo báo giá mới nhất để cập nhật phiếu lệch.
  const ensuredPaid = Math.max(0, Math.round(Number(ensured.receivable.amountPaid) || 0));
  const ensuredCredits = (ensured.receivable.appliedCredits || [])
    .reduce((sum, item) => sum + (Math.round(Number(item.amount)) || 0), 0);
  const ensuredPlain = ensuredPaid === 0 && ensuredCredits === 0;
  // Phiếu ĐÃ GỬI yêu cầu trước đó (frozenAt) là số đã chốt với phụ huynh — có thể đã
  // được sửa tay (gộp nợ lớp cũ, khấu trừ đặc biệt…). Gửi lại chỉ gửi lại đúng số đó,
  // không tính lại theo lịch/giá hiện tại (anh Mori 11/11/2026: "đã chốt thì giữ nguyên").
  const keepSentAmount = !outstandingOther && ensuredPlain && Boolean(ensured.receivable.frozenAt)
    && Math.round(Number(ensured.receivable.amountDue) || 0) > 0;
  const requestAmount = outstandingOther || !ensuredPlain || keepSentAmount
    ? Math.max(0, Math.round(Number(ensured.receivable.balanceDue) || 0))
    : Math.max(0, Math.round(Number(charge.amount) || 0));
  if (requestAmount <= 0) return { error: "Khoản phải thu của học viên này đã được tất toán." };
  const frozen: SepayReceivable = outstandingOther ? {
    ...outstandingOther,
    studentName: student.fullName,
    frozenAt: iso,
    publicToken: outstandingOther.publicToken || generatePublicToken(),
    requestedBy: actor.email,
  } : {
    ...ensured.receivable,
    studentName: student.fullName,
    billingPeriod: charge.period,
    classId: cls.id,
    billKey: charge.billKey,
    amountDue: ensuredPlain && !keepSentAmount ? requestAmount : ensured.receivable.amountDue,
    balanceDue: requestAmount,
    status: ensuredPaid > 0 ? "PARTIALLY_PAID" : "OPEN",
    frozenAt: iso,
    publicToken: ensured.receivable.publicToken || generatePublicToken(),
    requestedBy: actor.email,
  };
  // Phiếu các khóa trước còn nợ đi kèm yêu cầu này: chốt lại (frozenAt) để đồng bộ
  // không đổi số tiền trong lúc chờ phụ huynh chuyển khoản tổng.
  const bundleIds = isCourseClass && !outstandingOther
    ? new Set(courseRequestBundle(ensured.ledger, student.id, cls.id, courseTarget).rows.map((row) => row.id).filter((id) => id !== frozen.id))
    : new Set<string>();
  const nextLedger: SepayLedger = {
    ...ensured.ledger,
    receivables: ensured.ledger.receivables.map((row) => row.id === frozen.id ? frozen : bundleIds.has(row.id) && !row.frozenAt ? { ...row, frozenAt: iso } : row),
    paymentOrders: ensured.ledger.paymentOrders.map((row) => (
      row.id === frozen.paymentOrderId ? { ...refreshOrderQr(row, ensured.ledger.settings, requestAmount), status: "ACTIVE" } : row
    )),
  };
  const sentAmount = isCourseClass && !outstandingOther
    ? courseRequestBundle(nextLedger, student.id, cls.id, courseTarget).total || requestAmount
    : outstandingOther ? requestAmount : receivableRequestAmount(nextLedger, frozen);
  const finance: DemoFinance = { ...current, sepay: nextLedger };
  if (!await persistFinanceIfUnchanged(env, snapshot.stored, finance)) return { conflict: true };
  await writeAudit(env, actor, [{
    action: "UPDATE",
    entity: "Student",
    entityId: student.id,
    summary: `Gửi yêu cầu thanh toán ${student.fullName} · ${frozen.billingPeriod || charge.period} · ${sentAmount.toLocaleString("vi-VN")}đ${sentAmount !== requestAmount ? ` (gồm nợ ${isCourseClass ? "khóa trước" : "cũ T9"} ${(sentAmount - requestAmount).toLocaleString("vi-VN")}đ)` : ""}`,
  }]);
  // Xếp tin "yêu cầu thanh toán" SAU khi khối tài chính đã ghi xong (Phase 7, Bước 5a) —
  // ghi vào khối log Zalo riêng, không nằm trong cửa sổ ghi khối tài chính.
  const zaloMessage = await enqueueZaloMessage(env, { kind: "PAYMENT_REQUEST", receivableId: frozen.id, studentId: student.id, rawPhone: student.parentPhone1 || "", requestedBy: actor.email, resend: true });
  void processZaloOutbox(env).catch(() => undefined);
  return { finance, receivable: frozen, zaloMessage };
}

/** Dữ liệu dùng chung của /api/bootstrap (không phụ thuộc người đăng nhập): giáo trình,
 * học viên, lớp, buổi học, học phí đã đồng bộ… Dựng tốn ~1s CPU (học phí ~0,7s) cho MỖI
 * lượt mở web — nhiều người mở cùng lúc là nghẽn CPU (17/11/2026: 145% CPU, mở web 38 giây).
 * Nay giữ lại theo "thế hệ dữ liệu": bất kỳ lượt ghi nào (request ghi, ghi khối lưu trữ, việc
 * chạy nền) đều tăng thế hệ → lần mở web sau dựng lại; thêm hạn 60 giây và đổi ngày cho chắc. */
type BootstrapCore = Awaited<ReturnType<typeof computeBootstrapCore>>;
type BootstrapCoreEntry = { env: DemoEnv; generation: number; day: string; builtAt: number; checkedAt: number; versions: string; value: Promise<BootstrapCore> };
let bootstrapCoreCache: BootstrapCoreEntry | null = null;
/** Trong 60 giây đầu dùng thẳng; sau đó hỏi phiên bản các khối lưu trữ (một truy vấn nhỏ) — chưa
 * đổi thì dùng tiếp, để lượt ghi từ tiến trình khác (script chạy tay trên VPS) vẫn được nhận ra. */
const BOOTSTRAP_CACHE_TTL_MS = 60_000;
const BOOTSTRAP_CACHE_MAX_AGE_MS = 15 * 60_000;
const BOOTSTRAP_VERSION_KEYS = [
  "settings:steps-demo", "students:steps-demo", "teachers:steps-demo", "accountants:steps-demo", "assistants:steps-demo",
  "classes:steps-demo", "sessions:steps-demo", "periodic-reports:steps-demo", "finance:steps-demo",
  "audit:steps-demo", "integrations:steps-demo", "zalo-messages:steps-demo", "payroll-config:steps-demo",
  AUDITS_KEY, STAFF_SETTINGS_KEY, RECON_LOCKS_KEY, STATEMENT_IMPORTS_KEY,
];
async function bootstrapStorageVersions(env: DemoEnv): Promise<string> {
  const kv = env.STEPS_LMS_DATA as unknown as { versions?: (keys: string[]) => Promise<Record<string, number>> };
  if (!kv.versions) return "";
  const versions = await kv.versions(BOOTSTRAP_VERSION_KEYS);
  return Object.keys(versions).length ? BOOTSTRAP_VERSION_KEYS.map((key) => versions[key] ?? "-").join("|") : "";
}
async function bootstrapCore(env: DemoEnv): Promise<BootstrapCore> {
  const generation = currentDataGeneration();
  const day = vnToday();
  const now = Date.now();
  const cached = bootstrapCoreCache;
  if (cached && cached.env === env && cached.generation === generation && cached.day === day) {
    if (now - cached.checkedAt < BOOTSTRAP_CACHE_TTL_MS) return cached.value;
    if (cached.versions && now - cached.builtAt < BOOTSTRAP_CACHE_MAX_AGE_MS) {
      const versions = await bootstrapStorageVersions(env).catch(() => "");
      if (versions === cached.versions && bootstrapCoreCache === cached && currentDataGeneration() === generation) {
        cached.checkedAt = Date.now();
        return cached.value;
      }
    }
    if (bootstrapCoreCache !== cached) return bootstrapCore(env);
  }
  const entry: BootstrapCoreEntry = { env, generation, day, builtAt: now, checkedAt: now, versions: "", value: null as unknown as Promise<BootstrapCore> };
  // Phiên bản đọc TRƯỚC khi dựng: lượt ghi chen vào giữa lúc dựng sẽ làm lần kiểm sau lệch → dựng lại.
  entry.value = (async () => {
    entry.versions = await bootstrapStorageVersions(env).catch(() => "");
    return computeBootstrapCore(env);
  })();
  bootstrapCoreCache = entry;
  entry.value.catch(() => { if (bootstrapCoreCache === entry) bootstrapCoreCache = null; });
  return entry.value;
}

async function computeBootstrapCore(env: DemoEnv) {
  const catalog = env.SYLLABUS_CATALOG.getByName("steps-demo");
  const documentFor = (id: string) => env.SYLLABUS_DOCUMENT.getByName(id);
  const [metas, settings, students, teachers, accountants, assistants, classes, lessonSessions, periodicReports, finance] = await Promise.all([
    catalog.list(),
    env.STEPS_LMS_DATA.get<DemoSettings>("settings:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoAccountant[]>("accountants:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoAssistant[]>("assistants:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoPeriodicReport[]>("periodic-reports:steps-demo", "json"),
    env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"),
  ]);


  const documents = await Promise.all(metas.map((meta) => documentFor(meta.id).getOrInit(initialDocument(meta.id))));
  await Promise.all(documents.filter((document): document is SyllabusDocument => Boolean(document)).map((document) => catalog.upsert(document.meta)));
  const syllabuses = documents.filter((document): document is SyllabusDocument => Boolean(document)).map((document) => ({
    ...document.meta,
    duration: document.program?.coursesCount
      ? `${document.days.length} buổi · ${document.program.coursesCount} khóa`
      : `${document.days.length || Math.max(1, document.units.length)} buổi · ${document.units.length} Unit`,
    program: document.program,
    wrapDays: document.days.filter((day) => !day.unitId).sort((a,b)=>a.sortOrder-b.sortOrder).map((day) => {
      const lessonIds = new Set(document.lessons.filter((lesson) => lesson.courseDayId === day.id).map((lesson) => lesson.id));
      return { ...day, activities: (document.activities ?? []).filter((activity) => lessonIds.has(activity.lessonId) && activity.status === "PUBLISHED").sort((a,b)=>a.sortOrder-b.sortOrder).map((activity)=>({ id: activity.id, engineType: activity.engineType,
              portalBlock: activity.portalBlock, title: activity.title, instruction: activity.instruction, passingScore: activity.passingScore, starsReward: activity.starsReward, itemCount: activity.config?.items?.length ?? 0 })) };
    }),
    units: document.units.sort((a, b) => a.order - b.order).map((unit) => {
      const lessonIds = new Set(document.lessons.filter((lesson) => lesson.unitId === unit.id).map((lesson) => lesson.id));
      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        title: unit.name,
        description: unit.overview || unit.topic,
        communicationGoal: unit.communicationGoal,
        courseNumber: unit.courseNumber,
        lessonCount: unit.lessonCount,
        days: document.days.filter((day) => day.unitId === unit.id).sort((a, b) => a.sortOrder - b.sortOrder).map((day) => {
          const dayLessons = document.lessons.filter((lesson) => lesson.courseDayId === day.id).sort((a, b) => a.order - b.order);
          const dayLessonIds = new Set(dayLessons.map((lesson) => lesson.id));
          return {
            id: day.id,
            courseDayNumber: day.courseDayNumber,
            unitDayNumber: day.unitDayNumber,
            title: day.title,
            weekNumber: day.weekNumber,
            courseNumber: day.courseNumber,
            track: day.track,
            classLessonNumber: day.classLessonNumber,
            deliveryMode: day.deliveryMode,
            phase: day.phase,
            responseLevel: day.responseLevel,
            assessmentType: day.assessmentType,
            testSkills: day.testSkills,
            durationMinutes: day.durationMinutes,
            activities: (document.activities ?? []).filter((activity) => dayLessonIds.has(activity.lessonId) && activity.status === "PUBLISHED").sort((a,b)=>a.sortOrder-b.sortOrder).map((activity) => ({
              id: activity.id,
              engineType: activity.engineType,
              portalBlock: activity.portalBlock,
              title: activity.title,
              instruction: activity.instruction,
              passingScore: activity.passingScore,
              starsReward: activity.starsReward,
              itemCount: activity.config?.items?.length ?? 0,
            })),
          };
        }),
        activities: (document.activities ?? []).filter((activity) => lessonIds.has(activity.lessonId) && activity.status === "PUBLISHED").map((activity) => ({
          id: activity.id,
          engineType: activity.engineType,
              portalBlock: activity.portalBlock,
          title: activity.title,
          instruction: activity.instruction,
          starsReward: activity.starsReward,
        })),
      };
    }),
  }));
  const s43Info = await withS43RosterInfo(
    env,
    cleanStudents(students ?? defaultStudents()),
    cleanClasses(classes ?? defaultClasses()),
  );
  const s45Info = await withS45RosterInfo(env, s43Info.students, s43Info.classes);
  const purge = await withS43WithdrawnPurge(
    env,
    s45Info.students,
    s45Info.classes,
    cleanLessonSessions(lessonSessions ?? defaultLessonSessions()),
    finance ?? null,
  );
  const s43Swap = await withS43RosterSwap(
    env,
    purge.students,
    purge.classes,
    purge.sessions,
    purge.finance,
  );
  const xkMove = await withS12S13XuanKhoaMove(
    env,
    s43Swap.students,
    s43Swap.classes,
    s43Swap.sessions,
    s43Swap.finance,
  );
  const cleanedClasses = await withT7ScheduleEffectiveFrom(env, await withAutoBillingAllClasses(env, await withT2RosterCorrection(
    env,
    await withS8SaturdayTimeFix(env, await withWaitingClass(env, await withS17ToS28ScheduleFix(env, await withS15ScheduleFix(env, await withS13ScheduleFix(env, await withS12CourseFix(env, await withS28NewCourseStart(env, xkMove.classes))))))),
    xkMove.students,
  )));
  const cleanedSessions = await withS12ExtraSession(
    env,
    await withT7T8SeptemberSessions(
      env,
      xkMove.sessions,
      cleanedClasses,
    ),
    cleanedClasses,
  );
  await withS19CourseSessionsFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  await withS19CourseSizesFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  await withS29CourseStartFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  await withS36ScheduleFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  await withS41ScheduleFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  await withS35ScheduleFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  await withDebt4ClassesFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  await withDebt8ClassesFix(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  const transferFix = await withTransferAnchorRepair(
    env,
    xkMove.students,
    cleanedClasses,
    cleanedSessions,
    xkMove.finance ?? finance ?? null,
  );
  const t19Paid = await withT19DangKhoiPaid(
    env,
    transferFix.students,
    cleanedClasses,
    cleanedSessions,
    transferFix.finance ?? finance ?? null,
  );
  const t24Paid = await withT24BaoMinhPaid(
    env,
    t19Paid.students,
    cleanedClasses,
    cleanedSessions,
    t19Paid.finance ?? transferFix.finance ?? finance,
  );
  const t24Unpaid = await withT24BaoMinhUnpaid(
    env,
    t24Paid.students,
    cleanedClasses,
    cleanedSessions,
    t24Paid.finance ?? transferFix.finance ?? finance,
  );
  const s1TuanDung = await withS1TuanDungOctoberBill(
    env,
    t24Unpaid.finance ?? transferFix.finance ?? finance,
  );
  const s28RecvFix = await withS28ThanhNhanReceivableFix(
    env,
    s1TuanDung ?? t24Unpaid.finance ?? transferFix.finance ?? finance,
  );
  const s28NhatMinh = await withS28NhatMinhCourse2Cancel(
    env,
    s28RecvFix ?? s1TuanDung ?? t24Unpaid.finance ?? transferFix.finance ?? finance,
  );
  const s22Recv = await withS22Course1Receivables(
    env,
    t24Unpaid.students,
    cleanedClasses,
    cleanedSessions,
    s28NhatMinh ?? s28RecvFix ?? s1TuanDung ?? t24Unpaid.finance ?? transferFix.finance ?? finance,
  );
  const invoiceReset = await withIssuedInvoiceReset(
    env,
    s22Recv.finance ?? s28NhatMinh ?? s28RecvFix ?? s1TuanDung ?? t24Unpaid.finance ?? transferFix.finance ?? finance,
  );
  const invoiceResetTs = await withIssuedInvoiceReset(
    env,
    invoiceReset ?? s22Recv.finance ?? s28NhatMinh ?? s28RecvFix ?? s1TuanDung ?? t24Unpaid.finance ?? transferFix.finance ?? finance,
    ISSUED_INVOICE_RESET_TS_MIGRATION_KEY,
    ISSUED_INVOICE_RESET_TS_IDS,
  );
  const fixedFinance = invoiceResetTs ?? invoiceReset ?? s22Recv.finance ?? s28NhatMinh ?? s28RecvFix ?? s1TuanDung ?? t24Unpaid.finance ?? transferFix.finance ?? finance;
  const balancedStudents = await withCourseRemainingRebuild(
    env,
    await withTeacherOffRemainingBackfill(
      env,
      await withSeptemberSessionBalances(
        env,
        s22Recv.students,
        cleanedClasses,
        cleanedSessions,
        fixedFinance,
      ),
      cleanedClasses,
      cleanedSessions,
    ),
    cleanedClasses,
    cleanedSessions,
    fixedFinance,
  );
  const cleanedStudents = await withMonthlyTeacherCreditCleanup(
    env,
    await withCourseTeacherCreditCleanup(
      env,
      await withTuitionStatusByBillingMode(env, balancedStudents, cleanedClasses),
      cleanedClasses,
    ),
    cleanedClasses,
  );
  const cleanedPeriodicReports = cleanPeriodicReports(periodicReports ?? []);
  const financeBook = await syncedFinance(env, cleanedClasses, cleanedStudents, cleanedSessions, { persist: false });
  return {
    metas, documents, syllabuses, settings, cleanedStudents, cleanedClasses, cleanedSessions, cleanedPeriodicReports, financeBook,
    teachers: await withTeacherAssistantFlags(env, teachers ?? defaultTeachers()),
    accountants: accountants ?? defaultAccountants(),
    assistants: assistants ?? defaultAssistants(),
  };
}

/** Chuỗi JSON phần dùng chung theo vai trò (không chứa thông tin riêng người dùng), gắn với
 * đúng bản core đã dựng — người cùng vai trò mở web không phải stringify lại ~16MB.
 * Khoá `${variant}|full` (bản đầy đủ như cũ) hoặc `${variant}|split` (bản nhẹ + phần tải sau). */
type BootstrapSharedEntry = { core: BootstrapCore; json: string; token?: string };
const bootstrapSharedJson = new Map<string, BootstrapSharedEntry>();
/** Phần tải sau theo token; giữ cả của bản core trước để người vừa nhận bản nhẹ vẫn lấy được đúng phần còn lại. */
const bootstrapRestJson = new Map<string, { variant: string; json: string; at: number }>();
const BOOTSTRAP_REST_KEEP_MS = 10 * 60_000;

/**
 * Mở web chỉ tải phần trang cần (anh Mori 17/11/2026). Các mảng lớn ít trang dùng — nhật ký thao tác,
 * tin Zalo, sổ thu chi, đối soát, lệnh thanh toán, giao dịch ngân hàng (~40% dung lượng) — tách ra
 * "phần tải sau": bản nhẹ để giá trị null + danh sách đường dẫn, app.js tải nốt ngay sau khi vẽ trang.
 * Trang nào cần các mảng này thì app.js chờ tải xong mới vẽ; chưa tải xong thì không cho ghi gì.
 */
const BOOTSTRAP_REST_PATHS = [
  ["auditLogs"], ["zaloMessages"],
  ["finance", "cashbook"], ["finance", "reconEntries"],
  ["finance", "sepay", "paymentOrders"], ["finance", "sepay", "bankTransactions"],
] as const;

export function splitBootstrapShared(shared: Record<string, unknown>) {
  const lite: Record<string, unknown> = { ...shared };
  const values: Record<string, unknown> = {};
  const paths: string[] = [];
  const copies = new Map<string, Record<string, unknown>>([["", lite]]);
  const holderOf = (parents: readonly string[]) => {
    let holder = lite;
    for (let i = 0; i < parents.length; i += 1) {
      const id = parents.slice(0, i + 1).join(".");
      if (!copies.has(id)) {
        const child = holder[parents[i]!];
        if (!child || typeof child !== "object" || Array.isArray(child)) return null;
        const copy = { ...(child as Record<string, unknown>) };
        holder[parents[i]!] = copy;
        copies.set(id, copy);
      }
      holder = copies.get(id)!;
    }
    return holder;
  };
  for (const path of BOOTSTRAP_REST_PATHS) {
    const key = path[path.length - 1]!;
    const holder = holderOf(path.slice(0, -1));
    if (!holder || !Array.isArray(holder[key])) continue;
    const id = path.join(".");
    values[id] = holder[key];
    holder[key] = null;
    paths.push(id);
  }
  return { lite, values, paths };
}

/** Toàn bộ dữ liệu /api/bootstrap cho một phiên (phần riêng + phần dùng chung theo vai trò). */
async function bootstrapPayloadFor(env: DemoEnv, core: BootstrapCore, session: SessionPayload) {
  const { metas, documents, syllabuses, settings, cleanedStudents, cleanedClasses, cleanedSessions, cleanedPeriodicReports, financeBook } = core;
  const [student, progress, auditLogs, integrations, zaloMessages, payrollConfig] = await Promise.all([
    env.STEPS_LMS_DATA.get<Record<string, unknown>>(`student:${session.studentId}`, "json"),
    env.STEPS_LMS_DATA.get<Record<string, boolean>>(`progress:${session.studentId}`, "json"),
    session.role === "ADMIN" ? env.STEPS_LMS_DATA.get<DemoAuditLog[]>("audit:steps-demo", "json") : Promise.resolve(null),
    canManageFinance(session.role) ? env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json") : Promise.resolve(null),
    canManageFinance(session.role) ? readZaloMessageLogs(env).then((row) => row.logs) : Promise.resolve(null),
    canManageFinance(session.role) ? env.STEPS_LMS_DATA.get<DemoPayrollConfig>("payroll-config:steps-demo", "json") : Promise.resolve(null),
  ]);
  const storedStudent = student ?? {
    id: session.studentId,
    name: "Nguyễn Minh Anh",
    activeSyllabusId: metas[0]?.id ?? "steps-starters",
  };
  const storedActiveId = typeof storedStudent.activeSyllabusId === "string" ? storedStudent.activeSyllabusId : "";
  const demoStudent = { ...storedStudent, activeSyllabusId: documents.some((document) => document?.meta.id === storedActiveId) ? storedActiveId : metas[0]?.id ?? storedActiveId };
  const visiblePeriodicReports = session.role === "ADMIN"
    ? cleanedPeriodicReports
    : session.role === "TEACHER"
      ? cleanedPeriodicReports.filter((report) => cleanedClasses.find((cls) => cls.id === report.classId)?.teacherId === session.teacherId)
      : session.role === "STUDENT"
        ? cleanedPeriodicReports.filter((report) => report.studentId === (session.studentId === "student-demo" ? "student-demo-1" : session.studentId))
        : [];

  const bootstrapPayload = {
    user: {
      email: session.email,
      name: session.name,
      role: session.role,
      teacherId: session.teacherId || "",
      auditor: Boolean(session.auditor),
      assistantScope: session.role === "TEACHER" ? await teacherIsAssistantStaff(env, session.teacherId) : false,
    },
    student: demoStudent,
    syllabuses,
    progress: progress ?? {},
    settings: mergeSettings(settings),
    students: cleanedStudents,
    teachers: core.teachers,
    accountants: core.accountants,
    assistants: core.assistants,
    // Kế toán (gồm nhân sự Hành chính dùng tài khoản kế toán) chỉ nhận tên Audit cho bảng Quản lý task.
    audits: session.role === "ADMIN" ? cleanAudits(await env.STEPS_LMS_DATA.get(AUDITS_KEY, "json"))
      : session.role === "ACCOUNTANT" ? cleanAudits(await env.STEPS_LMS_DATA.get(AUDITS_KEY, "json")).map((row) => ({ id: row.id, code: row.code, fullName: row.fullName, phone: "", address: "", email: "" })) : [],
    staffSettings: canManageFinance(session.role) ? cleanStaffSettings(await env.STEPS_LMS_DATA.get(STAFF_SETTINGS_KEY, "json")) : null,
    reconLocks: canManageFinance(session.role) ? cleanReconLocks(await env.STEPS_LMS_DATA.get(RECON_LOCKS_KEY, "json")) : [],
    statementImports: canManageFinance(session.role) ? cleanStatementImports(await env.STEPS_LMS_DATA.get(STATEMENT_IMPORTS_KEY, "json")) : [],
    classes: cleanedClasses,
    lessonSessions: cleanedSessions,
    periodicReports: visiblePeriodicReports,
    finance: session.role === "STUDENT" ? studentFinanceView(financeBook, session.studentId) : financeBook,
    auditLogs: auditLogs ?? defaultAuditLogs(),
    allowDemoLogin: env.ALLOW_DEMO_LOGIN === "true",
    integrations: session.role === "ADMIN" ? maskIntegrationSettings(integrations ?? defaultIntegrationSettings()) : null,
    // Cờ riêng cho ACCOUNTANT xem có được hiện nút "Xuất hóa đơn"/"Phát hành lại" ở trang Hóa đơn điện tử
    // hay không, tách khỏi khối `integrations` đầy đủ (chỉ ADMIN mới thấy khối đó).
    invoiceIssueEnabled: canManageFinance(session.role) ? (integrations ?? defaultIntegrationSettings()).misa.issueEnabled : false,
    invoiceBuyerNameSource: canManageFinance(session.role) ? normalizeMisaInvoiceFields((integrations ?? defaultIntegrationSettings()).misa.invoiceFields).buyerNameSource : "PARENT",
    zaloMessages: zaloMessages ?? null,
    payrollConfig: payrollConfig ? hydratePayrollConfig(payrollConfig) : null,
  };
  return bootstrapPayload;
}

const bootstrapVariantOf = (session: SessionPayload) => `${session.role}|${session.auditor ? 1 : 0}|${session.role === "STUDENT" ? session.studentId : ""}`;

/** Chuỗi JSON phần dùng chung của một vai trò, dựng một lần cho mỗi bản core. */
function bootstrapSharedJsonOf(core: BootstrapCore, variant: string, payload: Awaited<ReturnType<typeof bootstrapPayloadFor>>, split = false): BootstrapSharedEntry {
  // Bản core mới → bỏ hết chuỗi của bản cũ (không giữ dữ liệu cũ trong bộ nhớ).
  for (const [key, entry] of bootstrapSharedJson) if (entry.core !== core) bootstrapSharedJson.delete(key);
  const cacheKey = `${variant}|${split ? "split" : "full"}`;
  const cached = bootstrapSharedJson.get(cacheKey);
  if (cached) return cached;
  const { user, student, progress, periodicReports, ...shared } = payload;
  void user; void student; void progress; void periodicReports;
  const repaired = repairLegacyEncoding(shared) as Record<string, unknown>;
  let entry: BootstrapSharedEntry;
  if (split) {
    const { lite, values, paths } = splitBootstrapShared(repaired);
    const token = crypto.randomUUID();
    const now = Date.now();
    for (const [key, item] of bootstrapRestJson) if (now - item.at > BOOTSTRAP_REST_KEEP_MS) bootstrapRestJson.delete(key);
    bootstrapRestJson.set(token, { variant, json: JSON.stringify({ values }), at: now });
    // Giữ tối đa 2 bản cho mỗi vai trò (bản hiện tại + bản trước).
    const ofVariant = [...bootstrapRestJson].filter(([, item]) => item.variant === variant);
    for (const [key] of ofVariant.slice(0, Math.max(0, ofVariant.length - 2))) bootstrapRestJson.delete(key);
    entry = { core, json: JSON.stringify({ ...lite, bootstrapRest: { token, paths } }), token };
  } else {
    entry = { core, json: JSON.stringify(repaired) };
  }
  bootstrapSharedJson.set(cacheKey, entry);
  return entry;
}

/**
 * Dựng sẵn sau mỗi lượt ghi (anh Mori 17/11/2026: mở web 7–10 giây vì máy chủ phải dựng lại ~5 giây
 * ngay lúc người dùng chờ). Sau khi dữ liệu thôi đổi 2 giây, máy chủ tự dựng core + JSON cho các vai trò
 * vừa mở web gần đây → người mở web sau đó nhận ngay bản dựng sẵn. Chỉ là bộ đệm: request vẫn tự
 * kiểm thế hệ / phiên bản dữ liệu như cũ, dựng sẵn không bao giờ làm dữ liệu cũ đi.
 */
const bootstrapRecentSessions = new Map<string, { session: SessionPayload; at: number }>();
const BOOTSTRAP_PREWARM_DEBOUNCE_MS = 2_000;
const BOOTSTRAP_PREWARM_MIN_GAP_MS = 10_000;
const BOOTSTRAP_PREWARM_RECENT_MS = 3 * 60 * 60_000;
const bootstrapPrewarm = { timer: null as ReturnType<typeof setTimeout> | null, running: false, pending: false, lastStart: 0, churn: 0, env: null as DemoEnv | null };

export function scheduleBootstrapPrewarm(env: DemoEnv) {
  bootstrapPrewarm.env = env;
  if (bootstrapPrewarm.running) { bootstrapPrewarm.pending = true; return; }
  if (bootstrapPrewarm.timer) clearTimeout(bootstrapPrewarm.timer);
  // Dựng sẵn mà vẫn bị lượt ghi làm cũ liên tục (vd việc chạy nền tự ghi) → giãn dần, tối đa 5 phút.
  const gap = Math.min(5 * 60_000, BOOTSTRAP_PREWARM_MIN_GAP_MS * 2 ** Math.max(0, bootstrapPrewarm.churn - 2));
  const wait = Math.max(BOOTSTRAP_PREWARM_DEBOUNCE_MS, bootstrapPrewarm.lastStart + gap - Date.now());
  bootstrapPrewarm.timer = setTimeout(() => { bootstrapPrewarm.timer = null; void runBootstrapPrewarm(); }, wait);
  (bootstrapPrewarm.timer as { unref?: () => void }).unref?.();
}

async function runBootstrapPrewarm() {
  const env = bootstrapPrewarm.env;
  if (!env || bootstrapPrewarm.running) return;
  const now = Date.now();
  for (const [variant, item] of bootstrapRecentSessions) if (now - item.at > BOOTSTRAP_PREWARM_RECENT_MS) bootstrapRecentSessions.delete(variant);
  if (!bootstrapRecentSessions.size) return;
  bootstrapPrewarm.running = true;
  bootstrapPrewarm.pending = false;
  bootstrapPrewarm.lastStart = now;
  const generation = currentDataGeneration();
  try {
    const core = await bootstrapCore(env);
    for (const [variant, item] of [...bootstrapRecentSessions]) {
      if (currentDataGeneration() !== generation) break;
      if (bootstrapSharedJson.get(`${variant}|split`)?.core === core) continue;
      bootstrapSharedJsonOf(core, variant, await bootstrapPayloadFor(env, core, item.session), true);
    }
  } catch (error) {
    console.error("bootstrap-prewarm:", error);
  } finally {
    bootstrapPrewarm.running = false;
    bootstrapPrewarm.churn = currentDataGeneration() !== generation ? bootstrapPrewarm.churn + 1 : 0;
    if (bootstrapPrewarm.pending || currentDataGeneration() !== generation) scheduleBootstrapPrewarm(env);
  }
}

async function handleApi(request: Request, env: DemoEnv, url: URL) {
  if (url.pathname === "/api/health") {
    try {
      await env.STEPS_LMS_DATA.get("_health", "json");
      return json({ ok: true, service: "steps-lms", storage: "postgresql-or-worker-bindings" });
    } catch {
      return json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);
    }
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const body = await parseBody<{ email?: string; password?: string; demo?: boolean }>(request);
    const email = body?.email?.trim().toLowerCase() ?? "";
    const adminEmail = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = env.SEED_ADMIN_PASSWORD ?? env.DEMO_PASSWORD;
    const productionAdmin: DemoUser | undefined = adminEmail && email === adminEmail
      ? {
          email: adminEmail,
          name: env.SEED_ADMIN_NAME?.trim() || "Quản trị STEPS",
          role: "ADMIN",
          studentId: "student-demo",
        }
      : undefined;
    const teacherRows = cleanTeachers((await env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json")) ?? defaultTeachers());
    const matchingTeachers = teacherRows.filter((row) => staffLoginUsername(row.fullName) === email);
    const teacher = matchingTeachers.length === 1 ? matchingTeachers[0] : undefined;
    const accountantRows = cleanAccountants((await env.STEPS_LMS_DATA.get<DemoAccountant[]>("accountants:steps-demo", "json")) ?? defaultAccountants());
    const matchingAccountants = accountantRows.filter((row) => staffLoginUsername(row.fullName) === email);
    const accountant = matchingAccountants.length === 1 ? matchingAccountants[0] : undefined;
    const assistantRows = cleanAssistants((await env.STEPS_LMS_DATA.get<DemoAssistant[]>("assistants:steps-demo", "json")) ?? defaultAssistants());
    const matchingAssistants = assistantRows.filter((row) => staffLoginUsername(row.fullName) === email);
    const assistant = matchingAssistants.length === 1 ? matchingAssistants[0] : undefined;
    const auditRows = cleanAudits(await env.STEPS_LMS_DATA.get(AUDITS_KEY, "json"));
    const matchingAudits = auditRows.filter((row) => staffLoginUsername(row.fullName) === email);
    const auditAccount = matchingAudits.length === 1 ? matchingAudits[0] : undefined;
    const usernameBelongsToMultipleRoles = [teacher, accountant, assistant, auditAccount].filter(Boolean).length > 1;
    // Audit: đăng nhập như kế toán (tên viết liền không dấu + mật khẩu mặc định), quyền admin có giới hạn.
    const productionAuditor: DemoUser | undefined = auditAccount && !usernameBelongsToMultipleRoles
      ? { email, name: auditAccount.fullName, role: "ADMIN", studentId: "student-demo", auditor: true }
      : undefined;
    const productionTeacher: DemoUser | undefined = teacher && !usernameBelongsToMultipleRoles
      ? {
          email,
          name: teacher.fullName,
          role: "TEACHER",
          studentId: "student-demo",
          teacherId: teacher.id,
        }
      : undefined;
    // Nhân sự được cấp toàn quyền như admin (anh Mori 12/11/2026: Trương Đức Nhật — giám đốc). Đăng nhập vẫn bằng
    // tên viết liền + mật khẩu mặc định kế toán (anh Mori chọn giữ 123456789), nhưng phiên là ADMIN đầy đủ.
    const productionAccountant: DemoUser | undefined = accountant && !usernameBelongsToMultipleRoles
      ? {
          email,
          name: accountant.fullName,
          role: FULL_ADMIN_STAFF_IDS.has(accountant.id) ? "ADMIN" : "ACCOUNTANT",
          studentId: "student-demo",
        }
      : undefined;
    // Trợ giảng tạo như giáo viên nên cũng dùng mật khẩu quản trị để đăng nhập.
    const productionAssistant: DemoUser | undefined = assistant && !usernameBelongsToMultipleRoles
      ? {
          email,
          name: assistant.fullName,
          role: "ASSISTANT",
          studentId: "student-demo",
        }
      : undefined;
    const allowDemoLogin = env.ALLOW_DEMO_LOGIN === "true";
    const user = productionAdmin ?? productionTeacher ?? productionAccountant ?? productionAuditor ?? productionAssistant ?? (allowDemoLogin ? demoUsers[email] : undefined);
    const demoClick = allowDemoLogin && body?.demo === true;
    // Học viên: email đăng nhập + mật khẩu đặt ở hồ sơ học viên (Tài khoản đăng nhập).
    if (!user && !demoClick && email.includes("@")) {
      if (studentLoginLocked(email)) return json({ error: "Sai mật khẩu quá nhiều lần — thử lại sau 15 phút." }, 429);
      const studentRows = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? []);
      const studentAccount = findStudentByLogin(studentRows, email);
      if (!studentAccount || !(await verifyStudentPassword(String(body?.password || ""), studentAccount.loginPassword))) {
        recordStudentLoginFail(email);
        return json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." }, 401);
      }
      clearStudentLoginFails(email);
      const studentUser: DemoUser = { email, name: studentAccount.fullName, role: "STUDENT", studentId: studentAccount.id };
      const studentSession = await createSession({ ...studentUser, exp: Date.now() + SESSION_TTL_SECONDS * 1000 }, env.AUTH_SECRET);
      await writeAudit(env, studentUser, [
        { action: "LOGIN", entity: "User", entityId: email, summary: "Học viên đăng nhập Portal" },
      ]).catch(() => undefined);
      return json({ ok: true, user: studentUser }, 200, { "Set-Cookie": sessionSetCookieHeader(url, studentSession, SESSION_TTL_SECONDS) });
    }
    if (user && user === productionAdmin && !demoClick && studentLoginLocked(`admin:${email}`)) {
      return json({ error: "Sai mật khẩu quá nhiều lần — thử lại sau 15 phút." }, 429);
    }
    const teacherUsesDefaultPassword = Boolean(productionTeacher && user === productionTeacher
      && (DEFAULT_PASSWORD_TEACHER_IDS.has(String(productionTeacher.teacherId))
        || cleanStaffSettings(await env.STEPS_LMS_DATA.get(STAFF_SETTINGS_KEY, "json")).defaultPasswordTeacherIds.includes(String(productionTeacher.teacherId))));
    const passwordOk = user === productionAccountant || (productionAuditor && user === productionAuditor) || teacherUsesDefaultPassword
      ? body?.password === (env.ACCOUNTANT_DEFAULT_PASSWORD || "123456789")
      : user && user === productionAdmin
        ? await adminPasswordOk(env, String(body?.password || ""))
        : Boolean(adminPassword) && body?.password === adminPassword;
    if (user && user === productionAdmin && !demoClick) {
      if (passwordOk) clearStudentLoginFails(`admin:${email}`); else recordStudentLoginFail(`admin:${email}`);
    }
    if (!user || (!demoClick && !passwordOk)) {
      return json({ error: "Tên đăng nhập hoặc mật khẩu không đúng." }, 401);
    }
    const session = await createSession(
      { ...user, exp: Date.now() + SESSION_TTL_SECONDS * 1000 },
      env.AUTH_SECRET,
    );
    await writeAudit(env, user, [
      { action: "LOGIN", entity: "User", entityId: email, summary: "Đăng nhập hệ thống" },
    ]).catch(() => undefined);
    return json(
      { ok: true, user },
      200,
      { "Set-Cookie": sessionSetCookieHeader(url, session, SESSION_TTL_SECONDS) },
    );
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return json(
      { ok: true },
      200,
      { "Set-Cookie": sessionSetCookieHeader(url, "", 0) },
    );
  }

  if (url.pathname === "/api/webhooks/sepay" && request.method === "POST") {
    return handleSepayWebhook(request, env);
  }

  if (url.pathname === "/api/webhooks/zalo" && request.method === "POST") {
    return handleZaloWebhook(request, env);
  }

  const publicPaymentMatch = url.pathname.match(/^\/api\/public\/payment\/([^/]+)\/([^/]+)$/);
  const publicPaymentQrMatch = url.pathname.match(/^\/api\/public\/payment-qr\/([^/]+)\/([^/]+)$/);
  if ((publicPaymentMatch || publicPaymentQrMatch) && request.method === "GET") {
    const [, receivableId, token] = (publicPaymentMatch || publicPaymentQrMatch)!;
    const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const noStore = { "Cache-Control": "private, no-store" };
    if (isPublicPaymentRateLimited(clientKey)) return json({ error: "TOO_MANY_REQUESTS" }, 429, noStore);
    const finance = syncTuitionCashbook(hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json")));
    const ledger = mergeSepayLedger(finance.sepay);
    const receivable = findReceivableByToken(ledger, decodeURIComponent(receivableId!), decodeURIComponent(token!));
    if (!receivable) return publicPaymentQrMatch
      ? new Response("Not found", { status: 404, headers: noStore })
      : json({ error: "NOT_FOUND" }, 404, noStore);
    const order = ledger.paymentOrders.find((row) => row.id === receivable.paymentOrderId);
    // Nội dung CK luôn là mã HP{lớp}{HV} (khớp phiếu báo / tin Zalo); đối soát tự quy về đúng phiếu.
    const publicClasses = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
    const publicStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
    const paymentCode = billPaymentCode(publicClasses.find((row) => row.id === receivable.classId) || {}, publicStudents.find((row) => row.id === receivable.studentId) || {}, receivable.billKey)
      || order?.paymentCode || receivable.receivableCode;
    const isPaid = receivable.status === "PAID" || receivable.status === "OVERPAID";
    // Số phụ huynh cần chuyển: lớp khóa cộng dồn nợ khóa trước (khớp tin Zalo).
    const publicAmount = isPaid ? receivable.amountDue : receivableRequestAmount(ledger, receivable);
    if (publicPaymentQrMatch) {
      // QR luôn sinh động theo paymentCode + amountDue hiện tại, không bao giờ trả
      // qrImageDataUrl tĩnh (R10) — trang công khai này chỉ phục vụ đường tự động.
      const svg = vietQrSvg({
        bankId: ledger.settings.bank,
        accountNumber: ledger.settings.accountNumber,
        accountName: ledger.settings.accountName,
        amount: publicAmount,
        addInfo: paymentCode,
      });
      if (!svg) return new Response("Not found", { status: 404, headers: noStore });
      return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", ...noStore } });
    }
    // Chỉ trả tên học viên và số tiền — không trả số điện thoại, email, địa chỉ, lớp.
    return json({
      studentName: receivable.studentName,
      billingPeriod: receivable.billingPeriod,
      amount: publicAmount,
      paymentCode,
      status: receivable.status,
      paid: isPaid,
    }, 200, noStore);
  }

  const session = await readSession(request, env.AUTH_SECRET);
  if (!session) return json({ error: "UNAUTHORIZED" }, 401);
  // Học viên thật (không phải tài khoản demo) chỉ gọi được API của Portal.
  if (session.role === "STUDENT" && session.studentId !== "student-demo" && !studentApiAllowed(request.method, url.pathname)) {
    return json({ error: "FORBIDDEN" }, 403);
  }

  const catalog = env.SYLLABUS_CATALOG.getByName("steps-demo");
  const documentFor = (id: string) => env.SYLLABUS_DOCUMENT.getByName(id);

  if (url.pathname === "/api/settings" && request.method === "GET") {
    return json({ settings: mergeSettings(await env.STEPS_LMS_DATA.get<DemoSettings>("settings:steps-demo", "json")) });
  }

  const misaResponse = await handleMisaInvoiceApi(request, url, env, session, {
    json,
    audit: (summary, entityId) => writeAudit(env, session, [{ action: "UPDATE", entity: "Invoice", entityId, summary }]),
  });
  if (misaResponse) return misaResponse;

  const gradingResponse = await handleGradingApi(request, url, env, session, {
    json,
    loadAsset: async (path) => {
      const asset = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
      return asset.ok ? asset.arrayBuffer() : null;
    },
  });
  if (gradingResponse) return gradingResponse;

  if (url.pathname === "/api/integrations" && request.method === "GET") {
    if (session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
    const current = (await env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json")) ?? defaultIntegrationSettings();
    return json({ settings: maskIntegrationSettings(current) });
  }

  if (url.pathname === "/api/integrations" && request.method === "PUT") {
    if (!isSuperAdmin(session)) return json({ error: session.role === "ADMIN" ? "Tài khoản Audit không được sửa tài khoản / cấu hình hệ thống." : "FORBIDDEN" }, 403);
    const body = await parseBody<IntegrationSettingsPatch>(request);
    if (!body) return json({ error: "Dữ liệu cấu hình tích hợp không hợp lệ." }, 400);
    const stored = await env.STEPS_LMS_DATA.get<IntegrationSettings>("integrations:steps-demo", "json");
    const current = stored ?? defaultIntegrationSettings();
    const expected = JSON.stringify(stored ?? null);
    const next = await mergeIntegrationSettings(current, body, env.AUTH_SECRET, session.email);
    if (!await env.STEPS_LMS_DATA.compareAndPut("integrations:steps-demo", expected, JSON.stringify(next))) {
      return json({ error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi thao tác lại giúp em." }, 409);
    }
    const changedGroups = [
      JSON.stringify(current.sepay) !== JSON.stringify(next.sepay) ? "SePay" : null,
      JSON.stringify(current.misa) !== JSON.stringify(next.misa) ? "MISA" : null,
      JSON.stringify(current.zalo) !== JSON.stringify(next.zalo) ? "Zalo" : null,
      JSON.stringify(current.ai ?? null) !== JSON.stringify(next.ai) ? "Chấm bài AI" : null,
    ].filter((group): group is string => group !== null);
    if (changedGroups.length) {
      await writeAudit(env, session, [
        { action: "UPDATE", entity: "Settings", entityId: "integrations", summary: `Cập nhật cấu hình tích hợp: ${changedGroups.join(", ")}` },
      ]);
    }
    return json({ ok: true, settings: maskIntegrationSettings(next) });
  }

  if (url.pathname === "/api/integrations/ping" && request.method === "POST") {
    if (session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ provider?: string }>(request);
    const effective = await readEffectiveIntegrationSettings(env);
    if (body?.provider === "misa") {
      if (!effective.misa.enabled) return json({ ok: false, message: "MISA đang tắt — bật công tắc rồi lưu trước khi kiểm tra." });
      return json(await createMisaClient(effective.misa).ping());
    }
    if (body?.provider === "zalo") {
      if (!effective.zalo.enabled) return json({ ok: false, message: "Zalo đang tắt — bật công tắc rồi lưu trước khi kiểm tra." });
      const client = createZaloClient({
        appId: effective.zalo.appId, appSecret: effective.zalo.appSecret, refreshToken: effective.zalo.refreshToken,
        onTokenRotated: (next) => rotateZaloRefreshToken(env, next),
      });
      return json(await client.ping());
    }
    return json({ error: "Nhà cung cấp chưa hỗ trợ kiểm tra kết nối." }, 400);
  }

  if (url.pathname === "/api/zalo-messages" && request.method === "GET") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const { logs } = await readZaloMessageLogs(env);
    return json({ logs });
  }

  if (url.pathname === "/api/zalo-messages" && request.method === "POST") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ action?: string; id?: string }>(request);
    if (String(body?.action || "") !== "retry" || !body?.id) return json({ error: "Yêu cầu không hợp lệ." }, 400);
    let snapshot = await readZaloMessageLogs(env);
    let updated = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const target = snapshot.logs.find((log) => log.id === body.id);
      if (!target) return json({ error: "Không tìm thấy dòng tin nhắn này." }, 404);
      if (target.status !== "FAILED") return json({ error: "Chỉ gửi lại được dòng đang ở trạng thái lỗi." }, 400);
      const nextLogs = snapshot.logs.map((log) => (log.id === body.id ? { ...log, status: "QUEUED" as const, errorCode: undefined, errorMessage: undefined, requestedBy: session.email } : log));
      if (await persistZaloMessageLogsIfUnchanged(env, snapshot.stored, nextLogs)) { updated = true; break; }
      snapshot = await readZaloMessageLogs(env);
    }
    if (!updated) return json({ error: "Dữ liệu vừa đổi ở nơi khác, thử lại giúp em." }, 409);
    void processZaloOutbox(env).catch(() => undefined);
    return json({ ok: true });
  }

  if (url.pathname === "/api/students" && request.method === "GET") {
    const balanced = await withMonthlyTeacherCreditCleanup(
      env,
      await withCourseTeacherCreditCleanup(
        env,
        await withCourseRemainingRebuild(
          env,
          await withTeacherOffRemainingBackfill(
            env,
            await withSeptemberSessionBalances(
              env,
              cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents()),
            ),
          ),
        ),
      ),
    );
    const items = await withTuitionStatusByBillingMode(env, balanced);
    return json({ items });
  }

  if (url.pathname === "/api/students" && request.method === "PUT") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ items?: DemoStudent[] }>(request);
    const previous = (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents();
    const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
    const sessions = cleanLessonSessions((await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions());
    const items = refreshTuitionExemptSessionBalances(cleanStudents(body?.items), classes, sessions);
    // Xoá học viên: chỉ admin (Audit không xoá được).
    if (!isSuperAdmin(session)) {
      const kept = new Set(items.map((row) => row.id));
      if (cleanStudents(previous).some((row) => !kept.has(row.id))) return json({ error: "Chỉ admin được xoá học viên." }, 403);
    }
    await persistStudentsMerged(env, items, { adminEdit: true, previous });
    await writeAudit(env, session, auditChanges(previous, items, "Student", (row) => `học viên ${row.fullName}`, await auditNamesFor(env, { students: items, classes })));
    await releaseCourseBillsOnJoinChange(env, classes, previous, items, sessions);
    const finance = await syncedFinance(env, classes, items, sessions);
    return json({ ok: true, items, finance });
  }

  // Nhập Excel học viên: giữ dữ liệu cũ, chỉ điền ô trống + thêm học viên mới.
  // mode "preview" chỉ trả kế hoạch; "apply" tính lại trên dữ liệu mới nhất rồi ghi.
  if (url.pathname === "/api/students/import" && request.method === "POST") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Record<string, unknown>>(request) || {};
    const fileBase64 = String(body.fileBase64 || "");
    const apply = body.mode === "apply";
    if (!fileBase64 || fileBase64.length > 5_000_000) return json({ error: "File chưa hợp lệ — chọn file Excel danh sách học viên." }, 400);
    let sheetRows: unknown[][];
    try {
      const payload = fileBase64.includes(",") ? fileBase64.slice(fileBase64.indexOf(",") + 1) : fileBase64;
      const bytes = Uint8Array.from(atob(payload.replace(/\s+/g, "")), (char) => char.charCodeAt(0));
      const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
      const first = workbook.SheetNames[0];
      sheetRows = first ? XLSX.utils.sheet_to_json(workbook.Sheets[first], { header: 1, defval: "", raw: true }) as unknown[][] : [];
    } catch {
      return json({ error: "Không đọc được file — dùng file .xls/.xlsx xuất từ trang Học viên." }, 400);
    }
    const parsed = parseStudentSheet(sheetRows);
    if (parsed.error) return json({ error: parsed.error }, 400);
    if (!parsed.rows.length) return json({ error: "File không có dòng học viên nào." }, 400);
    const previous = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
    const plan = planStudentImport(parsed.rows, previous, () => `student-${crypto.randomUUID()}`);
    const summary = { created: plan.created.map((row) => ({ line: row.line, code: row.student.code, fullName: row.student.fullName, parentName: row.student.parentName, phone: [row.student.parentPhone1, row.student.parentPhone2].filter(Boolean).join(" / ") })), updated: plan.updated, conflicts: plan.conflicts, unchanged: plan.unchanged, warnings: plan.warnings, errors: plan.errors, rows: parsed.rows.length };
    if (!apply) return json({ ok: true, mode: "preview", ...summary });
    if (!plan.created.length && !plan.updated.length) return json({ ok: true, mode: "apply", ...summary, items: previous });
    await persistStudentsMerged(env, plan.next, { adminEdit: true, previous });
    await writeAudit(env, session, [
      ...plan.created.map((row) => ({ action: "CREATE" as const, entity: "Student", entityId: row.student.id, summary: `Nhập Excel: thêm học viên ${row.student.code} ${row.student.fullName}` })),
      ...plan.updated.map((row) => ({ action: "UPDATE" as const, entity: "Student", entityId: row.id, summary: `Nhập Excel: bổ sung ${row.fields.map((item) => item.label).join(", ")} cho ${row.code} ${row.fullName}` })),
    ]);
    const classes = await addStudentsToWaitingClass(env, plan.created.map((row) => row.student.id));
    const items = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? []);
    return json({ ok: true, mode: "apply", ...summary, items, classes });
  }

  // Cập nhật/tạo một học viên — payload nhỏ (~1KB) thay vì PUT toàn bộ danh
  // sách (~500KB), tránh upload chậm/đứt trên đường truyền yếu (nginx 499).
  if (url.pathname === "/api/students" && request.method === "PATCH") {
    // Kế toán / hành chính (tài khoản kế toán): chỉ sửa hồ sơ học viên đã có — thông tin liên hệ, trạng thái,
    // tài khoản Portal. Không tạo mới, không đổi số buổi tồn / miễn học phí / các trường học phí khác.
    const profileOnly = session.role === "ACCOUNTANT";
    // Hành chính (tài khoản kế toán / Audit nhóm HC) được thêm học viên mới: chỉ hồ sơ, vào Lớp chờ, không có số dư học phí.
    const officeHcCreator = profileOnly ? await sessionIsOfficeHc(env, session) : false;
    if (!canManageRoster(session.role) && !profileOnly) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ item?: DemoStudent }>(request);
    const cleaned = cleanStudents(body?.item ? [body.item] : []);
    let item = cleaned[0];
    if (!item?.id) return json({ error: "Thiếu học viên cần cập nhật." }, 400);
    const previous = (await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents();
    const exists = previous.some((row) => row.id === item!.id);
    if (profileOnly) {
      const before = cleanStudents(previous).find((row) => row.id === item!.id);
      if (!before && !officeHcCreator) return json({ error: "Kế toán chỉ sửa được học viên đã có." }, 403);
      if (!before) {
        if (previous.some((row) => String(row.code || "").trim().toLowerCase() === String(item!.code || "").trim().toLowerCase())) return json({ error: `Mã học viên ${item.code} đã có, tải lại trang rồi thêm lại giúp em.` }, 409);
        // Chỉ nhận trường hồ sơ — bỏ mọi số dư / miễn học phí / mốc vào lớp do client gửi lên.
        const incoming = item as unknown as Record<string, unknown>;
        const profile: Record<string, unknown> = { id: item.id };
        for (const key of STUDENT_PROFILE_EDIT_KEYS) if (key in incoming) profile[key] = incoming[key];
        const fresh = cleanStudents([{ ...profile, status: "UNASSIGNED" }])[0];
        if (!fresh) return json({ error: "Nhập họ tên học viên trước khi lưu." }, 400);
        item = fresh;
      }
    }
    if (profileOnly && previous.some((row) => row.id === item!.id)) {
      const before = cleanStudents(previous).find((row) => row.id === item!.id)!;
      const incoming = item as unknown as Record<string, unknown>;
      const merged = { ...before } as unknown as Record<string, unknown>;
      for (const key of STUDENT_PROFILE_EDIT_KEYS) if (key in incoming) merged[key] = incoming[key];
      item = merged as unknown as DemoStudent;
    }
    const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
    const sessions = cleanLessonSessions((await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions());
    const base = exists ? previous.map((row) => (row.id === item.id ? item : row)) : [...previous, item];
    const items = refreshTuitionExemptSessionBalances(base, classes, sessions);
    await persistStudentsMerged(env, items, { adminEdit: true, previous });
    await writeAudit(env, session, auditChanges(
      previous.filter((row) => row.id === item.id),
      items.filter((row) => row.id === item.id),
      "Student",
      (row) => `học viên ${row.fullName}`,
      await auditNamesFor(env, { students: items, classes }),
    ));
    const nextClasses = exists ? classes : await addStudentsToWaitingClass(env, [item.id]);
    if (exists) await releaseCourseBillsOnJoinChange(env, classes, previous, items, sessions);
    const finance = await syncedFinance(env, nextClasses, items, sessions);
    return json({ ok: true, item: items.find((row) => row.id === item.id), items, finance, ...(exists ? {} : { classes: nextClasses }) });
  }

  if (url.pathname === "/api/teachers" && request.method === "GET") {
    return json({ items: await withTeacherAssistantFlags(env, (await env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json")) ?? defaultTeachers()) });
  }

  if (url.pathname === "/api/teachers" && request.method === "PUT") {
    if (!isSuperAdmin(session)) return json({ error: session.role === "ADMIN" ? "Tài khoản Audit không được sửa tài khoản / cấu hình hệ thống." : "FORBIDDEN" }, 403);
    const body = await parseBody<{ items?: DemoTeacher[] }>(request); const items = cleanTeachers(body?.items);
    const previous = (await env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json")) ?? defaultTeachers();
    await env.STEPS_LMS_DATA.put("teachers:steps-demo", JSON.stringify(items));
    await writeAudit(env, session, auditChanges(previous, items, "Teacher", (row) => `giáo viên ${row.fullName}`));
    return json({ ok: true, items: await withTeacherAssistantFlags(env, items) });
  }

  // Thêm / sửa một giáo viên (superadmin + nhân sự nhóm Hành chính). Xoá giáo viên vẫn chỉ superadmin (PUT).
  // Kèm cờ "Quyền trợ giảng" (assistantAccess): tick → nhập điểm mọi lớp như tài khoản trợ giảng.
  if (url.pathname === "/api/teachers" && request.method === "PATCH") {
    if (!isSuperAdmin(session) && !await sessionIsOfficeHc(env, session)) return json({ error: "Chỉ quản trị và Hành chính được thêm / sửa giáo viên." }, 403);
    const body = await parseBody<{ item?: DemoTeacher }>(request);
    const incoming = body?.item;
    if (!incoming || typeof incoming !== "object") return json({ error: "Thiếu giáo viên cần lưu." }, 400);
    const raw = await env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json");
    const previous = await withTeacherAssistantFlags(env, cleanTeachers(raw ?? defaultTeachers()));
    const id = String(incoming.id || "").trim().slice(0, 120);
    const before = id ? previous.find((row) => row.id === id) : undefined;
    const nextCode = () => { const max = previous.reduce((top, row) => Math.max(top, Number(/^GV(\d+)$/i.exec(row.code)?.[1]) || 0), 0); return `GV${String(max + 1).padStart(4, "0")}`; };
    const candidate = cleanTeachers([{ ...(before || {}), ...incoming, id: before?.id || id || `teacher-${crypto.randomUUID()}`, code: String(incoming.code || before?.code || "").trim() || nextCode(), assistantAccess: incoming.assistantAccess === undefined ? before?.assistantAccess === true : incoming.assistantAccess === true }])[0];
    if (!candidate) return json({ error: "Nhập họ tên và email giáo viên trước khi lưu." }, 400);
    const emailKey = candidate.email.toLowerCase();
    if (previous.some((row) => row.id !== candidate.id && row.email.toLowerCase() === emailKey)) return json({ error: "Email này đã được sử dụng." }, 409);
    if (previous.some((row) => row.id !== candidate.id && row.code.toLowerCase() === candidate.code.toLowerCase())) return json({ error: `Mã ${candidate.code} đã có, tải lại trang rồi thử lại giúp em.` }, 409);
    const items = before ? previous.map((row) => (row.id === candidate.id ? candidate : row)) : [...previous, candidate];
    // Cờ trợ giảng lưu riêng ở staff-settings; danh sách giáo viên ghi không kèm cờ.
    const stored = items.map(({ assistantAccess: _flag, ...row }) => row);
    const ok = env.STEPS_LMS_DATA.compareAndPut
      ? await env.STEPS_LMS_DATA.compareAndPut("teachers:steps-demo", JSON.stringify(raw ?? null), JSON.stringify(stored))
      : (await env.STEPS_LMS_DATA.put("teachers:steps-demo", JSON.stringify(stored)), true);
    if (!ok) return json({ error: "Danh sách giáo viên vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi lưu lại giúp em." }, 409);
    if (Boolean(before?.assistantAccess) !== Boolean(candidate.assistantAccess)) {
      const settings = cleanStaffSettings(await env.STEPS_LMS_DATA.get(STAFF_SETTINGS_KEY, "json"));
      const assistantTeacherIds = candidate.assistantAccess ? [...new Set([...settings.assistantTeacherIds, candidate.id])] : settings.assistantTeacherIds.filter((value) => value !== candidate.id);
      await env.STEPS_LMS_DATA.put(STAFF_SETTINGS_KEY, JSON.stringify({ ...settings, assistantTeacherIds }));
    }
    const toggled = Boolean(before?.assistantAccess) !== Boolean(candidate.assistantAccess);
    await writeAudit(env, session, [
      ...auditChanges(before ? [{ ...before, assistantAccess: undefined }] : [], [{ ...candidate, assistantAccess: undefined }], "Teacher", (row) => `giáo viên ${row.fullName}`),
      ...(toggled ? [{ action: "UPDATE" as const, entity: "Teacher", entityId: candidate.id, summary: `${candidate.assistantAccess ? "Bật" : "Tắt"} quyền trợ giảng cho giáo viên ${candidate.fullName}` }] : []),
    ]);
    return json({ ok: true, item: candidate, items });
  }

  if (url.pathname === "/api/payroll-config" && request.method === "GET") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const config = hydratePayrollConfig(await env.STEPS_LMS_DATA.get<DemoPayrollConfig>("payroll-config:steps-demo", "json"));
    return json({ config });
  }

  if (url.pathname === "/api/payroll-config" && request.method === "PUT") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ config?: DemoPayrollConfig }>(request);
    const config = cleanPayrollConfig(body?.config);
    const stored = await env.STEPS_LMS_DATA.get<DemoPayrollConfig>("payroll-config:steps-demo", "json");
    if (!await env.STEPS_LMS_DATA.compareAndPut("payroll-config:steps-demo", JSON.stringify(stored ?? null), JSON.stringify(config))) {
      return json({ error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi thao tác lại giúp em." }, 409);
    }
    // Audit chỉ ghi tên giáo viên bị sửa — không ghi số tiền lương vào nhật ký.
    const previous = stored ?? { teachers: {}, months: {} };
    const changedIds = [...new Set([
      ...Object.keys(config.teachers || {}).filter((id) => JSON.stringify(config.teachers?.[id]) !== JSON.stringify(previous.teachers?.[id])),
      ...Object.keys(config.months || {}).flatMap((month) => Object.keys(config.months?.[month] || {})
        .filter((id) => JSON.stringify(config.months?.[month]?.[id]) !== JSON.stringify(previous.months?.[month]?.[id]))),
    ])];
    if (changedIds.length) {
      const teacherNames = new Map(((await env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json")) || []).map((row) => [row.id, row.fullName]));
      await writeAudit(env, session, [{
        action: "UPDATE",
        entity: "PayrollConfig",
        entityId: "payroll-config",
        summary: `Cập nhật hồ sơ lương: ${changedIds.map((id) => teacherNames.get(id) || id).join(", ")}`,
      }]);
    }
    return json({ ok: true, config });
  }

  // Tải phiếu lương PDF: client gửi đúng số liệu đang hiển thị, máy chủ chỉ vẽ hình.
  if (url.pathname === "/api/payroll/slip-pdf" && request.method === "POST") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const input = cleanPayrollSlipInput((await parseBody<Record<string, unknown>>(request)) || {});
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font vẽ phiếu lương." }, 500);
    const pdf = await buildPayrollSlipPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      { ...input, logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined },
    );
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${payrollSlipDownloadName(input.teacherCode, input.monthKey)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/api/audits" && request.method === "GET") {
    if (session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
    return json({ items: cleanAudits(await env.STEPS_LMS_DATA.get(AUDITS_KEY, "json")) });
  }

  // Chuyển nhóm Kế toán / Hành chính cho nhân sự (chỉ admin).
  if (url.pathname === "/api/staff-groups" && request.method === "PUT") {
    if (!isSuperAdmin(session)) return json({ error: "Chỉ admin đổi nhóm nhân sự." }, 403);
    const body = await parseBody<{ id?: string; group?: string }>(request);
    const id = String(body?.id || "").trim();
    if (!id || (body?.group !== "KT" && body?.group !== "HC")) return json({ error: "Thiếu nhân sự hoặc nhóm." }, 400);
    const current = cleanStaffSettings(await env.STEPS_LMS_DATA.get(STAFF_SETTINGS_KEY, "json"));
    const next = { ...current, groups: { ...current.groups, [id]: body.group as "KT" | "HC" } };
    await env.STEPS_LMS_DATA.put(STAFF_SETTINGS_KEY, JSON.stringify(next));
    await writeAudit(env, session, [{ action: "UPDATE", entity: "User", entityId: id, summary: `Chuyển nhân sự sang nhóm ${body.group === "HC" ? "Hành chính" : "Kế toán"}` }]);
    return json({ ok: true, staffSettings: next });
  }

  if (url.pathname === "/api/audits" && request.method === "PUT") {
    if (!isSuperAdmin(session)) return json({ error: session.role === "ADMIN" ? "Chỉ superadmin quản lý tài khoản Audit." : "FORBIDDEN" }, 403);
    const body = await parseBody<{ items?: DemoAudit[] }>(request); const items = cleanAudits(body?.items);
    const previous = cleanAudits(await env.STEPS_LMS_DATA.get(AUDITS_KEY, "json"));
    await env.STEPS_LMS_DATA.put(AUDITS_KEY, JSON.stringify(items));
    await writeAudit(env, session, auditChanges(previous, items, "User", (row) => `audit ${row.fullName}`));
    return json({ ok: true, items });
  }

  // Đối soát xong theo ngày: khoá phần tiền của ngày đó. Audit / superadmin khoá,
  // chỉ superadmin gỡ. Mọi lần khoá / gỡ ghi nhật ký.
  if (url.pathname === "/api/finance/recon-locks" && request.method === "GET") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    return json({ items: cleanReconLocks(await env.STEPS_LMS_DATA.get(RECON_LOCKS_KEY, "json")) });
  }

  if (url.pathname === "/api/finance/recon-locks" && request.method === "POST") {
    const body = await parseBody<{ date?: string; action?: string }>(request);
    const date = String(body?.date || "");
    const unlock = body?.action === "unlock";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Ngày không hợp lệ." }, 400);
    if (unlock ? !isSuperAdmin(session) : session.role !== "ADMIN") return json({ error: unlock ? "Chỉ superadmin được gỡ đối soát." : "Chỉ Audit / superadmin được bấm đối soát xong." }, 403);
    const stored = await env.STEPS_LMS_DATA.get(RECON_LOCKS_KEY, "json");
    const current = cleanReconLocks(stored);
    const exists = current.some((row) => row.date === date);
    if (!unlock && exists) return json({ error: "Ngày này đã đối soát xong." }, 409);
    if (unlock && !exists) return json({ error: "Ngày này chưa đối soát." }, 409);
    const next = unlock
      ? current.filter((row) => row.date !== date)
      : [...current, { date, lockedAt: new Date().toISOString(), lockedBy: session.email, lockedByName: session.name }].sort((a, b) => b.date.localeCompare(a.date));
    const written = env.STEPS_LMS_DATA.compareAndPut
      ? await env.STEPS_LMS_DATA.compareAndPut(RECON_LOCKS_KEY, JSON.stringify(stored ?? null), JSON.stringify(next))
      : (await env.STEPS_LMS_DATA.put(RECON_LOCKS_KEY, JSON.stringify(next)), true);
    if (!written) {
      return json({ error: "Dữ liệu đối soát vừa thay đổi, anh/chị tải lại trang rồi thao tác lại." }, 409);
    }
    const [y, m, d] = date.split("-");
    await writeAudit(env, session, [{ action: "UPDATE", entity: "Reconciliation", entityId: date, summary: `${unlock ? "Gỡ đối soát" : "Đối soát xong"} ngày ${d}/${m}/${y}` }]);
    return json({ ok: true, items: next });
  }

  if (url.pathname === "/api/accountants" && request.method === "GET") {
    return json({ items: (await env.STEPS_LMS_DATA.get<DemoAccountant[]>("accountants:steps-demo", "json")) ?? defaultAccountants() });
  }

  if (url.pathname === "/api/accountants" && request.method === "PUT") {
    if (!isSuperAdmin(session)) return json({ error: session.role === "ADMIN" ? "Tài khoản Audit không được sửa tài khoản / cấu hình hệ thống." : "FORBIDDEN" }, 403);
    const body = await parseBody<{ items?: DemoAccountant[] }>(request); const items = cleanAccountants(body?.items);
    const previous = (await env.STEPS_LMS_DATA.get<DemoAccountant[]>("accountants:steps-demo", "json")) ?? defaultAccountants();
    await env.STEPS_LMS_DATA.put("accountants:steps-demo", JSON.stringify(items));
    await writeAudit(env, session, auditChanges(previous, items, "User", (row) => `kế toán ${row.fullName}`));
    return json({ ok: true, items });
  }

  if (url.pathname === "/api/assistants" && request.method === "GET") {
    return json({ items: (await env.STEPS_LMS_DATA.get<DemoAssistant[]>("assistants:steps-demo", "json")) ?? defaultAssistants() });
  }

  if (url.pathname === "/api/assistants" && request.method === "PUT") {
    if (!isSuperAdmin(session)) return json({ error: session.role === "ADMIN" ? "Tài khoản Audit không được sửa tài khoản / cấu hình hệ thống." : "FORBIDDEN" }, 403);
    const body = await parseBody<{ items?: DemoAssistant[] }>(request); const items = cleanAssistants(body?.items);
    const previous = (await env.STEPS_LMS_DATA.get<DemoAssistant[]>("assistants:steps-demo", "json")) ?? defaultAssistants();
    await env.STEPS_LMS_DATA.put("assistants:steps-demo", JSON.stringify(items));
    await writeAudit(env, session, auditChanges(previous, items, "User", (row) => `trợ giảng ${row.fullName}`));
    return json({ ok: true, items });
  }

  if (url.pathname === "/api/classes/transfer-student" && request.method === "POST") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ sourceClassId?: string; targetClassId?: string; studentId?: string }>(request);
    const sourceClassId = String(body?.sourceClassId || "").trim();
    const targetClassId = String(body?.targetClassId || "").trim();
    const studentId = String(body?.studentId || "").trim();
    if (!sourceClassId || !targetClassId || !studentId || sourceClassId === targetClassId) return json({ error: "Dữ liệu chuyển lớp không hợp lệ." }, 400);

    const previousClasses = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
    const previousStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
    const sourceClass = previousClasses.find((row) => row.id === sourceClassId);
    const targetClass = previousClasses.find((row) => row.id === targetClassId);
    const student = previousStudents.find((row) => row.id === studentId);
    if (!sourceClass || !targetClass) return json({ error: "Không tìm thấy lớp nguồn hoặc lớp đích." }, 404);
    if (!student) return json({ error: "Không tìm thấy học sinh." }, 404);
    if (targetClass.status === "FINISHED") return json({ error: "Không thể chuyển học sinh vào lớp đã kết thúc." }, 409);
    if (!(sourceClass.studentIds || []).includes(studentId)) return json({ error: "Học sinh không thuộc lớp hiện tại." }, 409);
    if ((targetClass.studentIds || []).includes(studentId)) return json({ error: "Học sinh đã có trong lớp đích." }, 409);
    if ((targetClass.studentIds || []).length >= 200) return json({ error: "Lớp đích đã đạt giới hạn học sinh." }, 409);

    const items = previousClasses.map((row) => row.id === sourceClassId
      ? { ...row, studentIds: row.studentIds.filter((id) => id !== studentId) }
      : row.id === targetClassId
        ? { ...row, studentIds: [...new Set([...row.studentIds, studentId])] }
        : row);
    const targetIsWaiting = isWaitingClass(targetClass);
    // Chỉ cho chuyển giữa hai lớp cùng loại thu phí: tháng ↔ tháng, khóa ↔ khóa.
    // Lớp chờ không thu phí nên vẫn nhận được (đường đưa về chờ riêng).
    if (!targetIsWaiting && !isWaitingClass(sourceClass) && classBillingMode(sourceClass) !== classBillingMode(targetClass)) {
      return json({ error: "Chỉ được chuyển giữa hai lớp cùng loại thu phí (lớp tháng ↔ lớp tháng, lớp khóa ↔ lớp khóa)." }, 409);
    }
    // Chuyển sang lớp thu khóa: đồng bộ số buổi tồn theo số dư phổ biến của các
    // bạn lớp đích; lớp tháng tự tính động theo biên lai/lịch nên không seed.
    // Lớp chờ không có khóa/tháng nên không seed số dư.
    const joinStamp = new Date().toISOString().slice(0, 10);
    // Khoản chênh lệch của kỳ chuyển — tính trước để biết mốc vào lớp đích
    // (đầu kỳ đang chạy) và số tiền phiếu tháng chuyển cần lập.
    const sourceLabel = sourceClass.code || sourceClass.name;
    const targetLabel = targetClass.code || targetClass.name;
    let snapshot = await readFinanceSnapshot(env);
    let finance = snapshot.finance;
    // Xếp lại từ Lớp chờ KHÔNG phải chuyển lớp: Lớp chờ không thu phí nên không
    // có chênh lệch. Quay lại đúng lớp đã học (còn phiếu/biên lai ở lớp đó) thì
    // giữ nguyên mốc vào lớp cũ — phiếu kỳ đang chạy vẫn là học phí của bạn, học
    // phí đồng bộ như các bạn cùng lớp. Vào lớp mới từ Lớp chờ = học viên mới vào lớp.
    const sourceIsWaiting = isWaitingClass(sourceClass);
    // Khoản nợ đang gửi ở Lớp chờ (ngắt phiếu lúc rời lớp) sẽ được cộng vào
    // phiếu của lớp đích kỳ này.
    const parkedCarry = sourceIsWaiting && !targetIsWaiting
      && mergeSepayLedger(snapshot.finance.sepay).receivables.some((row) => row.studentId === studentId
        && row.leftClass?.carryAmount && !row.leftClass.carryTarget);
    const rejoining = sourceIsWaiting && (
      mergeSepayLedger(snapshot.finance.sepay).receivables.some((row) => row.studentId === studentId && row.classId === targetClassId
        && row.status !== "CANCELLED" && String(row.billKey || "").split("|")[0] !== "transfer")
      || mergeSepayLedger(snapshot.finance.sepay).receipts.some((row) => row.studentId === studentId && row.classId === targetClassId)
    );
    const peerBalance = !targetIsWaiting && !rejoining && !parkedCarry && classBillingMode(targetClass) === "COURSE"
      ? classPeerSessionBalance(targetClass, new Set([studentId]), previousStudents)
      : undefined;
    let carry: ReturnType<typeof transferCarryBreakdown> | undefined;
    let sessionRows: DemoLessonSession[] = [];
    if (!sourceIsWaiting && !student.tuitionExempt) {
      sessionRows = cleanLessonSessions(await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json"));
    }
    if (!targetIsWaiting && !sourceIsWaiting && !student.tuitionExempt) {
      carry = transferCarryBreakdown({
        student, sourceClass, targetClass,
        sessions: sessionRows,
        ledger: mergeSepayLedger(snapshot.finance.sepay),
        transferDate: joinStamp,
      });
    }
    // Học viên chuyển lớp được tính học ở lớp đích cả kỳ đang chạy — mốc vào
    // lớp đặt về đầu kỳ để công nợ/buổi đã qua y như các bạn cùng lớp.
    // Riêng người quay lại từ Lớp chờ có khoản nợ gửi: mốc vào lớp là hôm nay,
    // phần đã học trước khi nghỉ nằm trong khoản mang sang (không lập lại tháng cũ).
    const joinDate: string | undefined = sourceIsWaiting
      ? (parkedCarry ? joinStamp : rejoining ? previousStudents.find((row) => row.id === studentId)?.classJoinedAt?.[targetClassId] : joinStamp)
      : joinStamp;
    const students = previousStudents.map((row) => {
      if (row.id !== studentId) return row;
      const sessionBalances = { ...(row.sessionBalances || {}) };
      delete sessionBalances[sourceClassId];
      // Nợ/dư buổi của lớp cũ đã quy ra tiền trong phiếu chuyển lớp — gỡ khỏi
      // tín dụng để khoản mang theo không bị đếm hai lần.
      const tuitionCredits = { ...(row.tuitionCredits || {}) };
      delete tuitionCredits[sourceClassId];
      if (!targetIsWaiting && peerBalance !== undefined) sessionBalances[targetClassId] = Math.round(Number(peerBalance) || 0);
      const classJoinedAt: Record<string, string> = { ...(row.classJoinedAt || {}) };
      if (joinDate) classJoinedAt[targetClassId] = joinDate; else delete classJoinedAt[targetClassId];
      // Rời Lớp chờ: bỏ mốc "ngày về Lớp chờ" — mốc đó là ngày nghỉ học mà doanh
      // số dùng để tính giảm theo buổi thực học.
      if (sourceIsWaiting) delete classJoinedAt[sourceClassId];
      // Vào lớp thật = đang học; về Lớp chờ = chưa xếp lớp.
      const status: StudentStatus = targetIsWaiting ? "UNASSIGNED" : "STUDYING";
      return { ...row, status, sessionBalances, tuitionCredits, classJoinedAt };
    });

    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(items));
    // adminEdit+previous: trạng thái Đang học / Chưa xếp lớp là thay đổi chủ động
    // của thao tác — merge thường lấy field hồ sơ (status) từ bản đang lưu nên
    // học viên xếp lại từ Lớp chờ vẫn bị giữ "Chưa xếp lớp".
    await persistStudentsMerged(env, students, { adminEdit: true, previous: previousStudents });

    // Xếp lại từ Lớp chờ vào đúng lớp đã học: trả phiếu kỳ đang chạy về số đã
    // xuất như các bạn cùng lớp — nếu không phiếu vẫn treo phần khấu trừ lúc nghỉ.
    if (rejoining && !targetIsWaiting && !student.tuitionExempt) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const base = mergeSepayLedger(finance.sepay);
        const { ledger, restored } = restoreLeftClassReceivables(base, [{ studentId, classId: targetClassId }]);
        if (!restored) break;
        const next: DemoFinance = { ...finance, sepay: ledger };
        if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
          finance = next;
          break;
        }
        snapshot = await readFinanceSnapshot(env);
        finance = snapshot.finance;
      }
    }
    // Người về Lớp chờ: ngắt phiếu công nợ còn mở, hoàn phần chưa học của phiếu
    // đã đóng và giữ khoản đã học + nợ cũ để cộng vào phiếu khi quay lại lớp.
    if (targetIsWaiting && !sourceIsWaiting) {
      const iso = new Date().toISOString();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const base = mergeSepayLedger(finance.sepay);
        const result = classBillingMode(sourceClass) === "MONTHLY"
          ? parkLeftClassReceivables(base, student, sourceClass, sessionRows, iso)
          : { ledger: freezeLeftClassReceivables(base, student, sourceClass, sessionRows, iso), refunds: [] as ReturnType<typeof parkLeftClassReceivables>["refunds"], carried: 0 };
        if (result.ledger === base && !result.refunds.length) break;
        const next = withLeftClassRefunds({ ...finance, sepay: result.ledger }, result.refunds, iso);
        if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
          finance = next;
          break;
        }
        snapshot = await readFinanceSnapshot(env);
        finance = snapshot.finance;
      }
    }
    // Quay lại lớp từ Lớp chờ: gắn khoản nợ đang gửi vào phiếu kỳ này.
    if (sourceIsWaiting && !targetIsWaiting && parkedCarry) {
      const now = new Date();
      const pair = classBillingMode(targetClass) === "COURSE"
        ? { studentId, classId: targetClassId, courseIndex: classCurrentCourseIndex(targetClass, now, sessionRows) }
        : { studentId, classId: targetClassId, month: monthKey(now) };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const base = mergeSepayLedger(finance.sepay);
        const { ledger, attached } = attachParkedCarry(base, [pair]);
        if (!attached) break;
        const next: DemoFinance = { ...finance, sepay: ledger };
        if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
          finance = next;
          break;
        }
        snapshot = await readFinanceSnapshot(env);
        finance = snapshot.finance;
      }
    }

    // Kỳ chuyển ở lớp đích không lập phiếu riêng: phụ huynh vẫn trả phiếu kỳ
    // đó của lớp nguồn (giữ nguyên, chốt frozenAt chống hủy mồ côi); phần
    // chênh lệch nằm trong phiếu "transfer|…" neo kỳ sau — âm = khấu trừ phụ
    // huynh (chuyển sang lớp rẻ hơn), dương = thu thêm — gộp vào báo giá của
    // phiếu kỳ neo, không phát hành QR riêng. Chỉ hủy phiếu kỳ sau / phiếu
    // chuyển lớp cũ của lớp nguồn.
    let transferSummary = "";
    if (!targetIsWaiting && !student.tuitionExempt && carry) {
      const iso = new Date().toISOString();
      const newReceivables: SepayReceivable[] = [];
      const newOrders: typeof snapshot.finance.sepay.paymentOrders = [];
      // Phiếu chênh lệch 0đ vẫn lập với trạng thái PAID — nó là dấu "kỳ đang
      // chạy đã được phiếu lớp nguồn bao phủ" để lớp đích không lập phiếu
      // trùng kỳ đó (isTransferCoveredMonth/Course nhận diện qua phiếu này).
      newReceivables.push({
        id: `recv-${crypto.randomUUID()}`,
        receivableCode: `CL${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        studentId,
        studentName: student.fullName,
        billingPeriod: `Chênh lệch chuyển lớp ${sourceLabel}→${targetLabel} · ${carry.anchorLabel}`,
        issueDate: iso.slice(0, 10),
        dueDate: carry.dueDate,
        amountDue: carry.amount,
        amountPaid: 0,
        balanceDue: carry.amount,
        currency: "VND",
        status: carry.amount === 0 ? "PAID" : "OPEN",
        paymentOrderId: "",
        classId: targetClassId,
        billKey: transferBillKey(targetClassId, sourceClassId, carry.anchor),
      });
      const currentPeriodKey = carry.currentPeriod;
      const currentSourceIndex = carry.sourceIndex;
      const partsText = [
        `đã học ${carry.elapsedSourceSessions} buổi ${sourceLabel} × ${carry.sourcePrice.toLocaleString("vi-VN")}đ`,
        `còn ${carry.remainingTargetSessions} buổi ${targetLabel} × ${carry.targetPrice.toLocaleString("vi-VN")}đ`,
        `phiếu ${sourceLabel} ${carry.sourceBillAmount.toLocaleString("vi-VN")}đ`,
      ].join(" · ");
      transferSummary = `chuyển ${sourceLabel}→${targetLabel}: ${partsText} → ${carry.amount >= 0 ? "+" : ""}${carry.amount.toLocaleString("vi-VN")}đ ${carry.anchorLabel}`;
      let cancelledSource = 0;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const base = mergeSepayLedger(snapshot.finance.sepay);
        // Phiếu kỳ đang chạy của lớp nguồn giữ nguyên thu đủ — chốt frozenAt để
        // luật "mồ côi" không hủy khi học viên rời roster. Chỉ hủy phiếu kỳ SAU
        // (lập sẵn không còn học) và phiếu chuyển lớp cũ còn treo.
        const staleIds = new Set<string>();
        const receivables = base.receivables.map((row) => {
          if (row.studentId !== studentId || row.classId !== sourceClassId) return row;
          if (!["DRAFT", "OPEN"].includes(row.status) || row.amountPaid > 0) return row;
          const head = String(row.billKey || "").split("|")[0];
          const isTransferOld = head === "transfer";
          const futurePeriod = head === "month" || head === "months"
            ? (String(row.billKey || "").split("|")[2] || "").split(",").some((key) => /^\d{4}-\d{2}$/.test(key) && key > currentPeriodKey)
            : head === "course"
              ? courseIndexOfBillKey(row.billKey || undefined) > currentSourceIndex
              : false;
          if (isTransferOld || futurePeriod) {
            staleIds.add(row.id);
            return { ...row, balanceDue: 0, status: "CANCELLED" as const };
          }
          // Phiếu kỳ đang chạy/trước đó giữ nguyên — chốt lại chống hủy mồ côi.
          return row.frozenAt ? row : { ...row, frozenAt: iso };
        });
        const next: DemoFinance = {
          ...snapshot.finance,
          sepay: {
            ...base,
            receivables: [...newReceivables, ...receivables],
            paymentOrders: [
              ...newOrders,
              ...base.paymentOrders.map((row) => (staleIds.has(row.receivableId) && row.status === "ACTIVE" ? { ...row, status: "CANCELLED" as const } : row)),
            ],
          },
        };
        if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
          finance = next;
          cancelledSource = staleIds.size;
          break;
        }
        snapshot = await readFinanceSnapshot(env);
        finance = snapshot.finance;
      }
      if (cancelledSource) transferSummary = `${transferSummary} · đã hủy ${cancelledSource} phiếu kỳ sau/cũ của ${sourceLabel}`;
    }
    await writeAudit(env, session, [
      // Log tường minh việc chuyển lớp: rời lớp nguồn + vào lớp đích (kèm ngày
      // trong createdAt) — tra cứu "bạn nào đổi lớp, ngày nào" không mò roster.
      { action: "UPDATE" as DemoAuditAction, entity: "Student", entityId: studentId, summary: `Chuyển lớp: ${student.fullName} (${student.code || studentId}) — ${sourceClass.name || sourceClass.code} → ${targetClass.name || targetClass.code}` },
      ...auditChanges(previousClasses, items, "Class", (row) => `lớp ${row.name}`),
      ...auditChanges(previousStudents, students, "Student", (row) => `học sinh ${row.fullName}`),
      ...(transferSummary ? [{ action: "UPDATE" as DemoAuditAction, entity: "Finance", entityId: studentId, summary: `${student.fullName} ${transferSummary}` }] : []),
    ]);
    return json({ ok: true, items, students, finance });
  }

  // Xoá học viên khỏi lớp → đưa về "Lớp chờ", trạng thái Chưa xếp lớp.
  // Phiếu thu/biên lai/công nợ và lịch sử điểm danh giữ nguyên tuyệt đối.
  if (url.pathname === "/api/classes/remove-student" && request.method === "POST") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ sourceClassId?: string; studentId?: string }>(request);
    const sourceClassId = String(body?.sourceClassId || "").trim();
    const studentId = String(body?.studentId || "").trim();
    if (!sourceClassId || !studentId) return json({ error: "Dữ liệu không hợp lệ." }, 400);

    const ensured = ensureWaitingClass(cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses()));
    const previousClasses = ensured.classes;
    const waiting = ensured.waiting;
    const previousStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
    const sourceClass = previousClasses.find((row) => row.id === sourceClassId);
    const student = previousStudents.find((row) => row.id === studentId);
    if (!sourceClass) return json({ error: "Không tìm thấy lớp nguồn." }, 404);
    if (isWaitingClass(sourceClass)) return json({ error: "Học sinh đã ở Lớp chờ." }, 409);
    if (!student) return json({ error: "Không tìm thấy học sinh." }, 404);
    if (!(sourceClass.studentIds || []).includes(studentId)) return json({ error: "Học sinh không thuộc lớp hiện tại." }, 409);

    const items = previousClasses.map((row) => row.id === sourceClassId
      ? { ...row, studentIds: row.studentIds.filter((id) => id !== studentId) }
      : row.id === waiting.id
        ? { ...row, studentIds: [...new Set([...(row.studentIds || []), studentId])] }
        : row);
    const joinStamp = new Date().toISOString().slice(0, 10);
    const students = previousStudents.map((row) => {
      if (row.id !== studentId) return row;
      const sessionBalances = { ...(row.sessionBalances || {}) };
      delete sessionBalances[sourceClassId];
      const classJoinedAt = { ...(row.classJoinedAt || {}), [waiting.id]: joinStamp };
      return { ...row, status: "UNASSIGNED" as StudentStatus, sessionBalances, classJoinedAt };
    });

    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(items));
    // adminEdit+previous: status UNASSIGNED là thay đổi chủ động của thao tác —
    // không để merge writer-thường khôi phục status cũ từ bản stored.
    await persistStudentsMerged(env, students, { adminEdit: true, previous: previousStudents });
    await writeAudit(env, session, [
      // Log tường minh "xoá khỏi lớp → Lớp chờ" cho chính học viên — auditChanges
      // chỉ ghi generic "Cập nhật lớp/học sinh", tra cứu lịch sử lớp của bạn sẽ mất.
      { action: "UPDATE" as DemoAuditAction, entity: "Student", entityId: studentId, summary: `Xoá ${student.fullName} (${student.code || studentId}) khỏi lớp ${sourceClass.name || sourceClass.code} — đưa về Lớp chờ` },
      ...auditChanges(previousClasses, items, "Class", (row) => `lớp ${row.name}`),
      ...auditChanges(previousStudents, students, "Student", (row) => `học sinh ${row.fullName}`),
    ]);
    // Phiếu còn nợ của lớp vừa rời bị ngắt và mang sang lớp sau; phiếu đã đóng
    // được hoàn phần chưa học bằng phiếu chi tự tạo. Lớp khóa giữ luật đóng băng.
    let snapshot = await readFinanceSnapshot(env);
    const storedSessions = cleanLessonSessions((await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions());
    const iso = new Date().toISOString();
    let finance = snapshot.finance;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const baseLedger = mergeSepayLedger(snapshot.finance.sepay);
      const result = classBillingMode(sourceClass) === "MONTHLY"
        ? parkLeftClassReceivables(baseLedger, student, sourceClass, storedSessions, iso)
        : { ledger: freezeLeftClassReceivables(baseLedger, student, sourceClass, storedSessions, iso), refunds: [] as ReturnType<typeof parkLeftClassReceivables>["refunds"], carried: 0 };
      if (result.ledger === baseLedger && !result.refunds.length) {
        finance = hydrateFinance(snapshot.finance);
        break;
      }
      const next = withLeftClassRefunds({ ...snapshot.finance, sepay: result.ledger }, result.refunds, iso);
      if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
        finance = next;
        break;
      }
      snapshot = await readFinanceSnapshot(env);
      finance = snapshot.finance;
    }
    return json({ ok: true, items, students, finance });
  }

  if (url.pathname === "/api/classes" && request.method === "GET") {
    const items = await withT7ScheduleEffectiveFrom(env, await withAutoBillingAllClasses(env, await withT2RosterCorrection(env, await withS8SaturdayTimeFix(env, await withWaitingClass(env, await withS17ToS28ScheduleFix(env, await withS15ScheduleFix(env, await withS13ScheduleFix(env, await withS12CourseFix(env, await withS28NewCourseStart(
      env,
      cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses()),
    ))))))))));
    return json({ items });
  }

  if (url.pathname === "/api/classes" && request.method === "PUT") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ items?: DemoClass[]; syncFinance?: boolean }>(request);
    // "Lớp chờ" là lớp hệ thống — không cho phép PUT xoá mất.
    const items = ensureWaitingClass(cleanClasses(body?.items)).classes;
    const previous = (await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses();
    // Xoá lớp: chỉ admin (Audit không xoá được).
    if (!isSuperAdmin(session)) {
      const kept = new Set(items.map((row) => row.id));
      if (ensureWaitingClass(cleanClasses(previous)).classes.some((row) => !kept.has(row.id))) return json({ error: "Chỉ admin được xoá lớp." }, 403);
    }
    // Học viên được thêm vào lớp thật thì tự rời "Lớp chờ" — bể chờ chỉ giữ người chưa xếp lớp.
    const previousIdsByClass = new Map(previous.map((row) => [row.id, new Set(row.studentIds || [])]));
    const waitingItem = items.find(isWaitingClass);
    const pulled = new Set<string>();
    if (waitingItem) {
      const waitingIds = new Set(waitingItem.studentIds || []);
      for (const next of items) {
        if (isWaitingClass(next)) continue;
        for (const studentId of next.studentIds || []) {
          if (!previousIdsByClass.get(next.id)?.has(studentId) && waitingIds.has(studentId)) pulled.add(studentId);
        }
      }
      if (pulled.size) waitingItem.studentIds = (waitingItem.studentIds || []).filter((id) => !pulled.has(id));
    }
    // Học viên bị gỡ khỏi lớp thật qua PUT (không qua nút xoá khỏi lớp): nếu
    // sau cập nhật không còn lớp thật nào thì đưa về Lớp chờ — bể chờ giữ
    // người chưa xếp lớp, giống endpoint remove-student.
    const previousClassById = new Map(previous.map((row) => [row.id, row]));
    const inRealClass = new Set(items.filter((row) => !isWaitingClass(row)).flatMap((row) => row.studentIds || []));
    const removedFrom = new Map<string, Set<string>>();
    for (const prev of previous) {
      if (isWaitingClass(prev)) continue;
      const nextIds = new Set(items.find((row) => row.id === prev.id)?.studentIds || []);
      for (const studentId of prev.studentIds || []) {
        if (nextIds.has(studentId)) continue;
        if (!removedFrom.has(studentId)) removedFrom.set(studentId, new Set<string>());
        removedFrom.get(studentId)!.add(prev.id);
      }
    }
    const leftIds = [...removedFrom.keys()].filter((studentId) => !inRealClass.has(studentId));
    if (waitingItem && leftIds.length) {
      waitingItem.studentIds = [...new Set([...(waitingItem.studentIds || []), ...leftIds])];
    }
    // Một học viên không thể vừa ở lớp thật vừa ở Lớp chờ. Máy gửi bản danh sách lớp cũ (vd. bấm lưu lần 2
    // trước khi tải lại) có thể đưa người vừa xếp lớp quay lại Lớp chờ → bị tính "Giảm doanh số" như đã nghỉ.
    // (Lớp đã kết thúc không tính — học viên lớp cũ có thể nằm Lớp chờ đợi xếp khoá mới.)
    if (waitingItem) {
      const studying = new Set(items.filter((row) => !isWaitingClass(row) && row.status !== "FINISHED").flatMap((row) => row.studentIds || []));
      waitingItem.studentIds = (waitingItem.studentIds || []).filter((id) => !studying.has(id));
    }
    const previousStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
    const sessions = cleanLessonSessions((await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions());
    // Log tường minh từng thay đổi roster: ai được xếp vào / gỡ khỏi lớp nào —
    // auditChanges("Class") chỉ ghi "Cập nhật lớp" chung chung, tra cứu lịch sử
    // lớp của một học viên sẽ không thấy mốc xoá/xếp.
    const studentLabel = new Map(previousStudents.map((row) => [row.id, `${row.fullName} (${row.code || row.id})`]));
    const rosterChanges: { action: DemoAuditAction; entity: string; entityId: string; summary: string }[] = [];
    for (const next of items) {
      const prevIds = new Set(previousClassById.get(next.id)?.studentIds || []);
      for (const studentId of (next.studentIds || [])) {
        if (prevIds.has(studentId)) continue;
        const name = studentLabel.get(studentId) || studentId;
        rosterChanges.push({ action: "UPDATE", entity: "Student", entityId: studentId, summary: `Xếp ${name} vào lớp ${next.name || next.code || next.id}${pulled.has(studentId) ? " — từ Lớp chờ" : ""}` });
      }
    }
    for (const [studentId, classIds] of removedFrom) {
      const name = studentLabel.get(studentId) || studentId;
      for (const classId of classIds) {
        const prevCls = previousClassById.get(classId);
        const leftAll = !inRealClass.has(studentId);
        rosterChanges.push({ action: "UPDATE", entity: "Student", entityId: studentId, summary: `Gỡ ${name} khỏi lớp ${prevCls?.name || prevCls?.code || classId}${leftAll ? " — đưa về Lớp chờ" : ""}` });
      }
    }
    await env.STEPS_LMS_DATA.put("classes:steps-demo", JSON.stringify(items));
    await writeAudit(env, session, [...rosterChanges, ...auditChanges(previous, items, "Class", (row) => `lớp ${row.name}`, await auditNamesFor(env, { students: previousStudents, classes: items }))]);
    // Ghi ngày vào lớp cho học viên mới xuất hiện trong studentIds — luật
    // "vào sau ngày 5 thì tháng đó không lập phiếu" dựa vào mốc này.
    const joinStamp = new Date().toISOString().slice(0, 10);
    const joinedAtPatch = new Map<string, Record<string, string>>();
    const rejoinedIds = new Set<string>();
    const rejoinLedger = pulled.size
      ? mergeSepayLedger(hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json")).sepay)
      : null;
    // Học viên còn khoản nợ đang gửi ở Lớp chờ: ngày vào lớp tính lại từ hôm
    // nay, phần đã học trước khi nghỉ do khoản mang sang bao phủ (không lập
    // phiếu tháng cũ lần nữa).
    const carryStudents = new Set(
      (rejoinLedger?.receivables || [])
        .filter((row) => row.leftClass?.carryAmount && !row.leftClass.carryTarget)
        .map((row) => row.studentId),
    );
    const balancePatch = new Map<string, Record<string, number>>();
    const studyingPatch = new Set<string>();
    for (const next of items) {
      const prevIds = new Set(previousClassById.get(next.id)?.studentIds || []);
      const addedIds = (next.studentIds || []).filter((studentId) => !prevIds.has(studentId));
      for (const studentId of addedIds) {
        // Xếp lại từ Lớp chờ vào đúng lớp đã học (còn phiếu/biên lai ở lớp đó):
        // giữ mốc vào lớp cũ — không tính như học viên mới vào giữa kỳ.
        const rejoinDate = pulled.has(studentId) && rejoinLedger && !carryStudents.has(studentId) && (
          rejoinLedger.receivables.some((row) => row.studentId === studentId && row.classId === next.id && row.status !== "CANCELLED" && String(row.billKey || "").split("|")[0] !== "transfer")
          || rejoinLedger.receipts.some((row) => row.studentId === studentId && row.classId === next.id)
        ) ? (previousStudents.find((row) => row.id === studentId)?.classJoinedAt?.[next.id] ?? "") : undefined;
        if (rejoinDate !== undefined) rejoinedIds.add(studentId);
        joinedAtPatch.set(studentId, { ...(joinedAtPatch.get(studentId) || {}), [next.id]: rejoinDate ?? joinStamp });
      }
      // Học viên mới vào lớp thật → Đang học (Lớp chờ giữ nguyên Chưa xếp lớp).
      if (addedIds.length && !isWaitingClass(next)) for (const studentId of addedIds) studyingPatch.add(studentId);
      // Học viên mới vào lớp thu khóa: seed số buổi tồn bằng số dư phổ biến của
      // các bạn để học phí đồng bộ ngay (lớp tháng theo mốc ngày vào, không seed).
      if (addedIds.length && classBillingMode(next) === "COURSE" && !isWaitingClass(next)) {
        const seed = classPeerSessionBalance(next, new Set(addedIds), previousStudents);
        if (seed !== undefined) {
          for (const studentId of addedIds.filter((id) => !rejoinedIds.has(id))) {
            balancePatch.set(studentId, { ...(balancePatch.get(studentId) || {}), [next.id]: seed });
          }
        }
      }
    }
    const leftSet = new Set(leftIds);
    let students = previousStudents;
    if (joinedAtPatch.size || balancePatch.size || studyingPatch.size || removedFrom.size) {
      students = students.map((row) => {
        const joined = joinedAtPatch.get(row.id);
        const balances = balancePatch.get(row.id);
        const studying = studyingPatch.has(row.id);
        const removedClasses = removedFrom.get(row.id);
        const leftAll = leftSet.has(row.id);
        if (!joined && !balances && !studying && !removedClasses && !leftAll) return row;
        const sessionBalances = { ...(row.sessionBalances || {}), ...(balances || {}) };
        // Số buổi tồn của lớp đã rời không còn ý nghĩa — dọn như remove-student.
        if (removedClasses) for (const classId of removedClasses) delete sessionBalances[classId];
        const classJoinedAt: Record<string, string> = { ...(row.classJoinedAt || {}), ...(joined || {}) };
        // Mốc rỗng = học viên quay lại lớp cũ chưa từng có mốc vào lớp → bỏ mốc.
        for (const [classId, date] of Object.entries(classJoinedAt)) if (!date) delete classJoinedAt[classId];
        // Rời Lớp chờ vào lớp thật: bỏ mốc "ngày về Lớp chờ" (ngày nghỉ học).
        if (studying && pulled.has(row.id) && waitingItem) delete classJoinedAt[waitingItem.id];
        // Mốc được đưa về Lớp chờ = ngày rời lớp — doanh số dùng nó chặn buổi
        // lớp chạy sau ngày nghỉ khi tính "thực học".
        if (leftAll && waitingItem) classJoinedAt[waitingItem.id] = joinStamp;
        return {
          ...row,
          status: studying ? "STUDYING" : leftAll ? "UNASSIGNED" : row.status,
          classJoinedAt,
          sessionBalances,
        };
      });
    }
    students = refreshTuitionExemptSessionBalances(students, items, sessions);
    if (JSON.stringify(students) !== JSON.stringify(previousStudents)) {
      // adminEdit+previous: status UNASSIGNED / dọn balance của học viên rời
      // lớp là thay đổi chủ động — không để merge khôi phục giá trị cũ.
      await persistStudentsMerged(env, students, { adminEdit: true, previous: previousStudents });
    }
    // Quay lại lớp từ Lớp chờ: trả phiếu khấu trừ cũ về số đã xuất (dữ liệu
    // trước khi đổi luật) và gắn khoản nợ đang gửi vào phiếu kỳ này.
    const rejoinPairs: Array<{ studentId: string; classId: string }> = [];
    for (const next of items) {
      if (isWaitingClass(next)) continue;
      const prevIds = new Set(previousClassById.get(next.id)?.studentIds || []);
      for (const studentId of next.studentIds || []) {
        if (!prevIds.has(studentId) && pulled.has(studentId)) rejoinPairs.push({ studentId, classId: next.id });
      }
    }
    // Rời lớp / quay lại đều đụng cùng khối tài chính — gom một lần ghi, thử lại
    // khi request khác vừa ghi (CAS).
    if ((removedFrom.size || rejoinPairs.length) && body?.syncFinance !== false) {
      let snapshot = await readFinanceSnapshot(env);
      const iso = new Date().toISOString();
      const attachPairs = rejoinPairs.map((pair) => {
        const cls = items.find((row) => row.id === pair.classId);
        const now = new Date();
        return classBillingMode(cls) === "COURSE"
          ? { ...pair, courseIndex: classCurrentCourseIndex(cls!, now, sessions) }
          : { ...pair, month: monthKey(now) };
      });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const baseLedger = mergeSepayLedger(snapshot.finance.sepay);
        let ledger = baseLedger;
        const refunds: ReturnType<typeof parkLeftClassReceivables>["refunds"] = [];
        for (const [studentId, classIds] of removedFrom) {
          const removedStudent = previousStudents.find((row) => row.id === studentId);
          for (const classId of classIds) {
            const prevCls = previousClassById.get(classId);
            if (!removedStudent || !prevCls) continue;
            if (classBillingMode(prevCls) === "MONTHLY") {
              const parked = parkLeftClassReceivables(ledger, removedStudent, prevCls, sessions, iso);
              ledger = parked.ledger;
              refunds.push(...parked.refunds);
            } else {
              ledger = freezeLeftClassReceivables(ledger, removedStudent, prevCls, sessions, iso);
            }
          }
        }
        ledger = restoreLeftClassReceivables(ledger, rejoinPairs).ledger;
        ledger = attachParkedCarry(ledger, attachPairs).ledger;
        if (ledger === baseLedger && !refunds.length) break;
        const next = withLeftClassRefunds({ ...snapshot.finance, sepay: ledger }, refunds, iso);
        if (await persistFinanceIfUnchanged(env, snapshot.stored, next)) break;
        snapshot = await readFinanceSnapshot(env);
      }
    }
    const finance = body?.syncFinance === false
      ? hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"))
      : await syncedFinance(env, items, students, sessions);
    return json({ ok: true, items, students, finance });
  }

  if (url.pathname === "/api/lesson-sessions" && request.method === "GET") {
    const stored = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
    return json({ items: Array.isArray(stored) ? stored : defaultLessonSessions() });
  }

  if (url.pathname === "/api/lesson-sessions" && request.method === "PUT") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ items?: DemoLessonSession[] }>(request);
    const items = cleanLessonSessions(body?.items);
    const storedSessions = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
    const previous = storedSessions ?? defaultLessonSessions();
    if (!items.length && Array.isArray(storedSessions) && storedSessions.length) {
      return json({ error: "Không thể xoá toàn bộ buổi điểm danh. Hãy tải lại trang rồi lưu lại." }, 400);
    }
    const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
    const previousStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
    const currentFinance = hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"));
    const students = applyAttendanceSessionBalances(previousStudents, classes, previous, items, mergeSepayLedger(currentFinance.sepay));
    await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(items));
    await persistStudentsMerged(env, students);
    await writeAudit(env, session, auditChanges(previous, items, "LessonSession", (row) => sessionAuditLabel(row, classes), await auditNamesFor(env, { students: previousStudents, classes })));
    const finance = await syncedFinance(env, classes);
    return json({ ok: true, items, students, finance });
  }

  if (url.pathname.startsWith("/api/lesson-session/") && request.method === "PATCH") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const id = url.pathname.split("/").pop();
    if (!id) return json({ error: "Invalid session ID" }, 400);
    const body = await parseBody<{ teacherId?: string; isSubstitute?: boolean; note?: string }>(request);
    const previous = cleanLessonSessions((await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions());
    const index = previous.findIndex((row) => row.id === id);
    if (index < 0) return json({ error: "Buổi học không tồn tại" }, 404);
    const before = previous[index];
    const item = { ...previous[index] };
    if (body.teacherId !== undefined) item.teacherId = String(body.teacherId).trim() || item.teacherId;
    if (body.isSubstitute !== undefined) item.isSubstitute = Boolean(body.isSubstitute);
    if (body.note !== undefined) item.note = String(body.note).trim();
    previous[index] = item;
    await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(previous));
    await writeAudit(env, session, auditChanges([before], [item], "LessonSession", (row) => sessionAuditLabel(row), await auditNamesFor(env)));
    return json({ ok: true, item });
  }

  if (url.pathname.startsWith("/api/lesson-session/") && request.method === "DELETE") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const id = url.pathname.split("/").pop();
    if (!id) return json({ error: "Invalid session ID" }, 400);
    const previous = cleanLessonSessions((await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions());
    const index = previous.findIndex((row) => row.id === id);
    if (index < 0) return json({ error: "Buổi học không tồn tại" }, 404);
    const item = previous[index];
    if (!item.isExtra && !item.makeupOf) return json({ error: "Chỉ có thể xóa buổi bù (buổi ngoài lịch)" }, 400);
    previous.splice(index, 1);
    await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(previous));
    await writeAudit(env, session, auditChanges([item], [], "LessonSession", (row) => sessionAuditLabel(row), await auditNamesFor(env)));
    return json({ ok: true });
  }

  // Lịch thêm ngoài lịch lớp (test / kèm speaking, kèm hỗ trợ): lưu riêng,
  // không đụng buổi học, học phí hay công nợ.
  if (url.pathname === "/api/calendar-events" && request.method === "GET") {
    if (!["ADMIN", "ACCOUNTANT", "TEACHER", "ASSISTANT"].includes(session.role)) return json({ ok: true, items: [] });
    const items = cleanCalendarEvents(await env.STEPS_LMS_DATA.get(CALENDAR_EVENTS_KEY, "json"));
    return json({ ok: true, items: session.role === "TEACHER" ? items.filter((row) => row.teacherId === session.teacherId) : items });
  }

  if (url.pathname === "/api/calendar-events" && request.method === "POST") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ item?: Record<string, unknown> }>(request);
    const teachers = (await env.STEPS_LMS_DATA.get<DemoTeacher[]>("teachers:steps-demo", "json")) ?? defaultTeachers();
    const checked = validateCalendarEventInput(body?.item, teachers.map((row) => row.id));
    if ("error" in checked) return json({ error: checked.error }, 400);
    return serializeLessonSessionMutation(async () => {
      const previous = cleanCalendarEvents(await env.STEPS_LMS_DATA.get(CALENDAR_EVENTS_KEY, "json"));
      const id = String(body?.item?.id || "").trim();
      const now = new Date().toISOString();
      const index = id ? previous.findIndex((row) => row.id === id) : -1;
      if (id && index < 0) return json({ error: "Lịch không tồn tại (có thể đã bị xóa)." }, 404);
      // Giáo viên đã có lịch thêm chồng giờ thì không thêm được (trùng với buổi dạy lớp chặn ở trình duyệt).
      const clash = previous.find((row) => row.id !== id && row.teacherId === checked.value.teacherId && row.date === checked.value.date
        && row.startTime < checked.value.endTime && checked.value.startTime < row.endTime);
      if (clash) return json({ error: `Trùng lịch: giáo viên đã có lịch ${CALENDAR_EVENT_LABELS[clash.kind] || "thêm"} ${clash.startTime}–${clash.endTime} ngày này.` }, 409);
      const item = index >= 0
        ? { ...previous[index], ...checked.value, updatedAt: now, updatedBy: session.email }
        : { id: `cal-${crypto.randomUUID()}`, ...checked.value, createdAt: now, createdBy: session.email };
      const next = index >= 0 ? previous.map((row, i) => (i === index ? item : row)) : [...previous, item];
      await env.STEPS_LMS_DATA.put(CALENDAR_EVENTS_KEY, JSON.stringify(next));
      const teacher = teachers.find((row) => row.id === item.teacherId);
      await writeAudit(env, session, [{
        action: index >= 0 ? "UPDATE" : "CREATE", entity: "CalendarEvent", entityId: item.id,
        summary: `${index >= 0 ? "Sửa" : "Thêm"} lịch ${CALENDAR_EVENT_LABELS[item.kind]} · ${teacher?.fullName || item.teacherId} · ${item.date} ${item.startTime}–${item.endTime}`,
      }]);
      return json({ ok: true, item });
    });
  }

  if (url.pathname.startsWith("/api/calendar-events/") && request.method === "DELETE") {
    if (!canManageRoster(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    return serializeLessonSessionMutation(async () => {
      const previous = cleanCalendarEvents(await env.STEPS_LMS_DATA.get(CALENDAR_EVENTS_KEY, "json"));
      const item = previous.find((row) => row.id === id);
      if (!item) return json({ error: "Lịch không tồn tại (có thể đã bị xóa)." }, 404);
      await env.STEPS_LMS_DATA.put(CALENDAR_EVENTS_KEY, JSON.stringify(previous.filter((row) => row.id !== id)));
      await writeAudit(env, session, [{ action: "DELETE", entity: "CalendarEvent", entityId: id, summary: `Xóa lịch ${CALENDAR_EVENT_LABELS[item.kind]} · ${item.date} ${item.startTime}–${item.endTime}` }]);
      return json({ ok: true });
    });
  }

  if (url.pathname === "/api/lesson-sessions/upsert" && request.method === "POST") {
    if (!canManageRoster(session.role) && session.role !== "TEACHER" && session.role !== "ASSISTANT" && session.role !== "ACCOUNTANT") return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{
      item?: DemoLessonSession;
      gradeClearIntents?: Array<{ studentId?: string; vocabulary?: boolean; assessmentColumnIds?: string[] }>;
      removedAssessmentColumnIds?: string[];
    }>(request);
    let item = cleanLessonSessions(body?.item ? [body.item] : [])[0];
    if (!item) return json({ error: "Dữ liệu buổi học không hợp lệ." }, 400);
    const gradeClearIntents = (Array.isArray(body?.gradeClearIntents) ? body.gradeClearIntents : [])
      .slice(0, 200)
      .map((intent) => ({
        studentId: String(intent?.studentId || "").trim().slice(0, 300),
        vocabulary: intent?.vocabulary === true,
        assessmentColumnIds: (Array.isArray(intent?.assessmentColumnIds) ? intent.assessmentColumnIds : [])
          .map((id) => String(id || "").trim().slice(0, 80))
          .filter((id, index, ids) => id && ids.indexOf(id) === index)
          .slice(0, 12),
      }))
      .filter((intent) => intent.studentId && (intent.vocabulary || intent.assessmentColumnIds.length));
    const removedAssessmentColumnIds = (Array.isArray(body?.removedAssessmentColumnIds) ? body.removedAssessmentColumnIds : [])
      .map((id) => String(id || "").trim().slice(0, 80))
      .filter((id, index, ids) => id && ids.indexOf(id) === index)
      .slice(0, 12);

    return serializeLessonSessionMutation(async () => {
      const previous = cleanLessonSessions(
        (await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions(),
      );
      const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
      const cls = classes.find((row) => row.id === item.classId);
      if (!cls) return json({ error: "Không tìm thấy lớp học." }, 404);
      // Giáo viên có phòng ban "Trợ giảng" (hồ sơ lương) được nhập điểm mọi lớp như quyền trợ giảng;
      // lớp của chính mình vẫn đủ quyền giáo viên.
      const teacherForeignClass = session.role === "TEACHER" && cls.teacherId !== session.teacherId && item.teacherId !== session.teacherId;
      const assistantLike = session.role === "ASSISTANT" || (teacherForeignClass && await teacherIsAssistantStaff(env, session.teacherId));
      if (teacherForeignClass && !assistantLike) {
        return json({ error: "FORBIDDEN" }, 403);
      }

      const identity = lessonSessionIdentity(item);
      const index = previous.findIndex((row) => row.id === item.id || lessonSessionIdentity(row) === identity);
      const existing = index >= 0 ? previous[index] : undefined;
      // Trợ giảng không được xoá hay đổi tên cột điểm đã lưu của giáo viên (S29 10/11/2026: lưu của trợ giảng
      // kèm lệnh xoá cột làm mất hết cột điểm giáo viên đã nhập). Chỉ cột trợ giảng vừa thêm mới xoá được.
      if (existing && assistantLike) {
        const storedColumns = new Map((existing.assessmentColumns || []).map((column) => [column.id, column]));
        const allowedRemovals = removedAssessmentColumnIds.filter((id) => !storedColumns.has(id));
        item = {
          ...item,
          assessmentColumns: (item.assessmentColumns || []).map((column) => storedColumns.get(column.id) || column),
        };
        item = mergeLessonSessionUpsert(existing, item, gradeClearIntents, allowedRemovals);
      } else if (existing) item = mergeLessonSessionUpsert(existing, item, gradeClearIntents, removedAssessmentColumnIds);
      const existingAdminOff = Boolean(existing?.isOff && existing.offSource !== "TEACHER");
      // Attendance upserts must never alter an admin-planned day off. Admins
      // can reopen it only from the class holiday configuration (bulk PUT),
      // while teachers cannot bypass the lock by crafting a direct request.
      if (existingAdminOff) {
        return json({ error: "Buổi nghỉ do học vụ cấu hình đã được khóa. Hãy thay đổi tại Cấu hình lịch nghỉ." }, 409);
      }
      if ((session.role === "TEACHER" || session.role === "ACCOUNTANT") && item.offSource === "ADMIN") {
        return json({ error: "Giáo viên và kế toán không thể tạo hoặc sửa lịch nghỉ đã khóa của học vụ." }, 403);
      }
      // Trợ giảng chỉ được nhập điểm và nhận xét: điểm danh, clip và trạng thái
      // nghỉ luôn giữ theo bản giáo viên đã lưu, kể cả khi request tự nặn ra.
      if (assistantLike) {
        if (!existing) return json({ error: "Buổi học chưa được giáo viên điểm danh nên trợ giảng chưa thể nhập điểm." }, 409);
        item.isOff = existing.isOff;
        item.offSource = existing.offSource;
        item.status = existing.status;
        item.attendance = (item.attendance || []).map((entry) => {
          const kept = (existing.attendance || []).find((row) => row.studentId === entry.studentId);
          // Học viên giáo viên chưa điểm danh thì để nguyên trạng chưa điểm danh.
          if (!kept) return { ...entry, status: null, firstStatus: null, late: false, pronunciationVideoDone: false, worksheetDone: false };
          return {
            ...entry,
            status: kept.status,
            firstStatus: kept.firstStatus,
            late: kept.late,
            pronunciationVideoDone: kept.pronunciationVideoDone,
            worksheetDone: kept.worksheetDone,
          };
        });
      }
      // "Học không tính phí" là quyết định thu phí — chỉ quản trị viên bật/tắt;
      // vai trò khác lưu điểm danh giữ nguyên trạng thái đã lưu của buổi.
      if (session.role !== "ADMIN") item.noFee = existing?.noFee;
      // Liên kết dạy bù cũng do quản trị viên tạo — vai trò khác không đổi được.
      if (session.role !== "ADMIN") item.makeupOf = existing?.makeupOf;
      const savedItem = index >= 0 ? { ...item, id: previous[index]!.id } : item;
      // Mốc điểm danh lần đầu: KPI lương chỉ trừ khi lần đầu vượt hạn. Giữ mốc cũ
      // để sửa điểm sau đó không bị tính là trễ lần nữa.
      if (existing?.attendanceSubmittedAt) {
        savedItem.attendanceSubmittedAt = existing.attendanceSubmittedAt;
      } else if (!assistantLike && (savedItem.attendance || []).some((row) => row.status)) {
        savedItem.attendanceSubmittedAt = new Date().toISOString();
      } else {
        savedItem.attendanceSubmittedAt = undefined;
      }
      const items = [...previous];
      if (index >= 0) items[index] = savedItem;
      else items.push(savedItem);

      const previousStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
      const currentFinance = hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"));
      const students = applyAttendanceSessionBalances(previousStudents, classes, previous, items, mergeSepayLedger(currentFinance.sepay));
      // Trạng thái nghỉ/buổi bù đổi → tín dụng buổi nghỉ đổi → phiếu tháng tới
      // của (các) lớp liên quan phải đồng bộ lại ngay.
      const billingTouched = Boolean(
        (existing?.isOff !== savedItem.isOff)
        || ((existing?.offSource || "") !== (savedItem.offSource || ""))
        || ((existing?.makeupOf || "") !== (savedItem.makeupOf || ""))
        || ((existing?.status === "CANCELLED") !== (savedItem.status === "CANCELLED"))
      );
      const billingClassIds = new Set<string>([savedItem.classId]);
      if (savedItem.makeupOf) {
        const off = items.find((row) => row.id === savedItem.makeupOf);
        if (off) billingClassIds.add(off.classId);
      }
      if (existing?.makeupOf) {
        const off = previous.find((row) => row.id === existing.makeupOf);
        if (off) billingClassIds.add(off.classId);
      }
      await env.STEPS_LMS_DATA.put("sessions:steps-demo", JSON.stringify(items));
      await persistStudentsMerged(env, students);
      if (billingTouched) {
        for (const classId of billingClassIds) await resyncClassTuitionBills(env, classId, classes, students, items);
      }
      await writeAudit(env, session, auditChanges(previous, items, "LessonSession", (row) => sessionAuditLabel(row, classes), await auditNamesFor(env, { students, classes })));
      return json({ ok: true, item: savedItem, items, students });
    });
  }

  if (url.pathname === "/api/periodic-reports/upsert" && request.method === "POST") {
    if (session.role !== "ADMIN" && session.role !== "TEACHER") return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<{ item?: DemoPeriodicReport }>(request);
    const stamped = body?.item ? { ...body.item, updatedAt: new Date().toISOString(), updatedBy: session.name } : null;
    const item = cleanPeriodicReports(stamped ? [stamped] : [])[0];
    if (!item) return json({ error: "Dữ liệu báo cáo định kỳ không hợp lệ." }, 400);

    const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
    const cls = classes.find((row) => row.id === item.classId);
    if (!cls) return json({ error: "Không tìm thấy lớp học." }, 404);
    if (!(cls.studentIds || []).includes(item.studentId)) return json({ error: "Học viên không thuộc lớp đã chọn." }, 409);
    if (session.role === "TEACHER" && cls.teacherId !== session.teacherId) return json({ error: "FORBIDDEN" }, 403);

    const previous = cleanPeriodicReports((await env.STEPS_LMS_DATA.get<DemoPeriodicReport[]>("periodic-reports:steps-demo", "json")) ?? []);
    const identity = (row: DemoPeriodicReport) => `${row.classId}|${row.studentId}|${row.periodType}|${row.periodKey}`;
    const index = previous.findIndex((row) => row.id === item.id || identity(row) === identity(item));
    const savedItem = index >= 0 ? { ...item, id: previous[index]!.id } : item;
    const items = [...previous];
    if (index >= 0) items[index] = savedItem;
    else items.push(savedItem);
    await env.STEPS_LMS_DATA.put("periodic-reports:steps-demo", JSON.stringify(items));
    await writeAudit(env, session, auditChanges(previous, items, "PeriodicReport", (row) => `báo cáo định kỳ ${row.periodLabel}`));
    return json({ ok: true, item: savedItem, items });
  }

  if (url.pathname === "/api/audit-logs" && request.method === "GET") {
    if (session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
    return json({ items: (await env.STEPS_LMS_DATA.get<DemoAuditLog[]>("audit:steps-demo", "json")) ?? defaultAuditLogs() });
  }

  if (url.pathname === "/api/finance" && request.method === "GET") {
    if (!canManageFinance(session.role) && session.role !== "STUDENT") return json({ error: "FORBIDDEN" }, 403);
    const finance = await syncedFinance(env, null, null, null, { persist: false });
    if (session.role === "STUDENT") {
      return json({ finance: studentFinanceView(finance, session.studentId) });
    }
    return json({ finance });
  }

  const reconEntryMatch = url.pathname.match(/^\/api\/finance\/recon\/([^/]+)$/);
  if (reconEntryMatch && request.method === "PATCH") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const entryId = decodeURIComponent(reconEntryMatch[1]!);
    const body = await parseBody<{ action?: string; expectedAmount?: number; expectedDate?: string }>(request);
    const action = String(body?.action || "");
    if (action !== "APPROVE" && action !== "UNDO") return json({ error: "Thao tác đối soát không hợp lệ." }, 400);

    const snapshot = await readFinanceSnapshot(env);
    const current = syncTuitionCashbook(snapshot.finance);
    const entry = current.cashbook.find((row) => row.id === entryId);
    if (!entry) return json({ error: "Không tìm thấy phiếu thu chi." }, 404);
    if ((await readReconLockDates(env)).has(entry.date)) return json({ error: lockedDayError(entry.date) }, 409);

    const amount = Math.round(Number(entry.amount) || 0);
    const expectedAmount = Math.round(Number(body?.expectedAmount));
    const expectedDate = String(body?.expectedDate || "");
    if (!Number.isFinite(Number(body?.expectedAmount)) || amount !== expectedAmount || entry.date !== expectedDate) {
      return json({ error: "Phiếu vừa thay đổi số tiền hoặc ngày. Trang đã được giữ nguyên; anh/chị tải lại rồi kiểm tra trước khi duyệt." }, 409);
    }

    const reconciled = rebuildReconEntries(current.cashbook, current.reconEntries).map((row) => {
      if (row.entryId !== entryId) return row;
      if (action === "UNDO") return { entryId, status: "PENDING" as const, amount, date: entry.date };
      return {
        entryId,
        status: "MATCHED" as const,
        amount,
        date: entry.date,
        approvedAt: new Date().toISOString(),
        approvedBy: session.name,
      };
    });
    const finance: DemoFinance = { ...current, reconEntries: reconciled };
    if (!await persistFinanceIfUnchanged(env, snapshot.stored, finance)) {
      return json({ error: "Dữ liệu thu chi vừa được cập nhật ở nơi khác. Không có dữ liệu nào bị ghi đè; anh/chị tải lại rồi thao tác lại." }, 409);
    }
    await writeAudit(env, session, [{
      action: "UPDATE",
      entity: "CashEntry",
      entityId: entryId,
      summary: action === "APPROVE"
        ? `Duyệt khớp ${entry.kind === "OUT" ? "phiếu chi" : "phiếu thu"} ${amount.toLocaleString("vi-VN")}đ · ${entry.description}`
        : `Hoàn tác duyệt ${entry.kind === "OUT" ? "phiếu chi" : "phiếu thu"} ${amount.toLocaleString("vi-VN")}đ · ${entry.description}`,
    }]);
    return json({ ok: true, finance });
  }

  if (url.pathname === "/api/finance" && request.method === "PUT") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Partial<DemoFinance>>(request);
    const snapshot = await readFinanceSnapshot(env);
    const current = syncTuitionCashbook(snapshot.finance);
    const cashbook = Array.isArray(body?.cashbook) ? body.cashbook as DemoCashEntry[] : current.cashbook;
    const debts = Array.isArray(body?.debts) ? body.debts as DemoTuitionDebt[] : current.debts;
    const payroll = Array.isArray(body?.payroll) ? body.payroll : current.payroll;
    const forecasts = cleanFinanceForecasts(Array.isArray(body?.forecasts) ? body.forecasts : current.forecasts);
    const reconInput = Array.isArray(body?.recon) ? body.recon as DemoReconDay[] : current.recon;
    const reconEntriesInput = Array.isArray(body?.reconEntries) ? body.reconEntries as DemoReconEntry[] : current.reconEntries;
    const finance: DemoFinance = {
      debts,
      cashbook,
      payroll,
      forecasts,
      recon: rebuildRecon(cashbook, reconInput),
      reconEntries: rebuildReconEntries(cashbook, reconEntriesInput),
      // Sổ Sepay do server quản lý (webhook, thu tiền, đồng bộ phiếu). Form thu chi gửi
      // cả object finance từ trình duyệt, nên tab mở từ trước có thể mang sổ cũ và ghi
      // đè mọi phiếu vừa được đồng bộ — luôn giữ bản hiện tại của server.
      sepay: current.sepay,
      cashbookSkippedReceiptIds: current.cashbookSkippedReceiptIds,
    };
    if (JSON.stringify(cashbook) !== JSON.stringify(current.cashbook)) {
      const todayLock = await todayLockedError(env);
      if (todayLock) return json({ error: todayLock }, 409);
    }
    const lockHit = lockedCashbookTouch(current.cashbook, cashbook, await readReconLockDates(env));
    if (lockHit) return json({ error: lockedDayError(lockHit) }, 409);
    if (!await persistFinanceIfUnchanged(env, snapshot.stored, finance)) {
      return json({ error: "Dữ liệu thu chi vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi lưu lại giúp em." }, 409);
    }
    const cashNames = await auditNamesFor(env);
    await writeAudit(env, session, [
      ...auditChanges(current.cashbook, cashbook, "CashEntry", (row) => `${row.kind === "OUT" ? "phiếu chi" : "phiếu thu"} ${Math.round(Number(row.amount) || 0).toLocaleString("vi-VN")}đ · ${row.description}`, cashNames)
        .map((change) => ({ ...change, category: /học phí/i.test(change.summary) ? "TUITION" as const : "OTHER" as const })),
      ...auditChanges(current.forecasts, forecasts, "FinanceForecast", (row) => `${row.kind === "IN" ? "khoản dự thu" : "khoản dự chi"} ${row.description}`, cashNames),
    ]);
    return json({ ok: true, finance });
  }

  const cashbookMatch = url.pathname.match(/^\/api\/finance\/cashbook\/([^/]+)$/);
  if (cashbookMatch && request.method === "DELETE") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const entryId = decodeURIComponent(cashbookMatch[1]!);
    const snapshot = await readFinanceSnapshot(env);
    const current = syncTuitionCashbook(snapshot.finance);
    const entry = current.cashbook.find((row) => row.id === entryId);
    if (!entry) return json({ error: "Không tìm thấy phiếu thu chi." }, 404);
    const todayLockDelete = await todayLockedError(env);
    if (todayLockDelete) return json({ error: todayLockDelete }, 409);
    if ((await readReconLockDates(env)).has(entry.date)) return json({ error: lockedDayError(entry.date) }, 409);
    const cashbook = current.cashbook.filter((row) => row.id !== entryId);
    let sepay = mergeSepayLedger(current.sepay);
    let students: DemoStudent[] | undefined;
    if (entry.source === "TUITION" && entry.receiptId) {
      const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
      const currentStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
      const storedSessions = await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json");
      const sessions = cleanLessonSessions(Array.isArray(storedSessions) ? storedSessions : defaultLessonSessions());
      const reversed = reverseTuitionReceipt({
        ledger: sepay,
        receiptId: entry.receiptId,
        students: currentStudents,
        classes,
        sessions,
      });
      if ("error" in reversed) return json({ error: reversed.error }, 409);
      sepay = reversed.ledger;
      students = reversed.students;
    }
    const finance: DemoFinance = {
      ...current,
      sepay,
      cashbook,
      recon: rebuildRecon(cashbook, current.recon),
      reconEntries: rebuildReconEntries(cashbook, current.reconEntries),
      cashbookSkippedReceiptIds: entry.receiptId
        ? [...new Set([...(current.cashbookSkippedReceiptIds || []), entry.receiptId])]
        : current.cashbookSkippedReceiptIds,
    };
    if (!await persistFinanceIfUnchanged(env, snapshot.stored, finance)) {
      return json({ error: "Dữ liệu thu chi vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi xóa lại giúp em." }, 409);
    }
    if (students) await persistStudentsMerged(env, students);
    await writeAudit(env, session, [{
      action: "DELETE",
      entity: "CashEntry",
      entityId: entry.id,
      summary: `Xóa ${entry.kind === "OUT" ? "phiếu chi" : "phiếu thu"} ${entry.amount.toLocaleString("vi-VN")}đ · ${entry.description}`,
    }]);
    return json({ ok: true, finance, students });
  }

  const receiptMatch = url.pathname.match(/^\/api\/finance\/receipts\/([^/]+)$/);
  if (receiptMatch && request.method === "GET") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const receiptId = decodeURIComponent(receiptMatch[1]!);
    const finance = hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"));
    const sepay = mergeSepayLedger(finance.sepay);
    const receipt = sepay.receipts.find((row) => row.id === receiptId);
    if (!receipt) return json({ error: "Không tìm thấy biên lai." }, 404);
    const payment = sepay.payments.find((row) => row.id === receipt.paymentId);
    const receivable = payment ? sepay.receivables.find((row) => row.id === payment.receivableId) : undefined;
    const students = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? defaultStudents());
    const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
    const settings = mergeSettings(await env.STEPS_LMS_DATA.get<DemoSettings>("settings:steps-demo", "json"));
    const student = students.find((row) => row.id === receipt.studentId);
    const cls = classes.find((row) => row.id === (receipt.classId || receivable?.classId));
    const sessions = (await env.STEPS_LMS_DATA.get<DemoLessonSession[]>("sessions:steps-demo", "json")) ?? defaultLessonSessions();
    const charge = cls ? classTuitionCharge(cls, Array.isArray(sessions) ? sessions : defaultLessonSessions(), undefined, courseIndexOfBillKey(receivable?.billKey)) : null;
    const amount = receipt.amount || charge?.amount || 0;
    const original = cls && charge ? charge.billed * classSessionPrice(cls) : amount;
    const [regularRes, mediumRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font biên lai." }, 500);
    const pdf = await buildTuitionReceiptPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      {
        centerName: settings.center.name || "STEPS Education",
        contact: [settings.center.address, settings.center.phone ? `ĐT: ${settings.center.phone}` : null, settings.center.email].filter(Boolean).join(" · "),
        receiptNumber: receipt.receiptNumber,
        paidAt: receipt.issuedAt || payment?.paidAt || new Date().toISOString(),
        studentName: receipt.studentName || student?.fullName || receivable?.studentName || "Học viên",
        studentCode: receipt.studentCode || student?.code || "",
        className: receipt.className || cls?.name || "",
        classCode: cls?.code || "",
        parentName: student?.parentName || "",
        parentPhone: student?.parentPhone1 || student?.phone || student?.parentZalo || "",
        address: student?.address || "",
        originalAmount: original,
        packageAmount: amount,
        collected: amount,
        method: receipt.method || payment?.method || "Chuyển khoản",
        invoiceRef: receipt.receiptNumber,
        coverageFrom: receipt.issuedAt || payment?.paidAt || "",
        collectorName: session.name,
      },
    );
    const filename = receiptDownloadName(receipt.issuedAt || payment?.paidAt || "", receipt.studentCode || student?.code || "HV");
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/api/finance/cashbook-report" && request.method === "POST") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const input = cleanCashbookReportInput((await parseBody<Record<string, unknown>>(request)) || {});
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font báo cáo thu chi." }, 500);
    const pdf = await buildCashbookReportPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      { ...input, logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined },
    );
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${cashbookReportDownloadName(input.period)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // Dashboard › Bổ trợ: PDF học viên vắng có phép trong tháng — chỉ vẽ dữ liệu client gửi.
  if (url.pathname === "/api/dashboard/support-pdf" && request.method === "POST") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const input = cleanSupportReportInput((await parseBody<Record<string, unknown>>(request)) || {});
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font báo cáo." }, 500);
    const pdf = await buildSupportReportPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      { ...input, logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined },
    );
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${supportReportDownloadName(input.month)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // In lịch dạy ra PDF (ngày / tuần / tháng): chỉ vẽ lịch client đã lọc sẵn.
  if (url.pathname === "/api/calendar/print-pdf" && request.method === "POST") {
    if (!canManageFinance(session.role) && session.role !== "TEACHER") return json({ error: "FORBIDDEN" }, 403);
    const input = cleanCalendarPrintInput((await parseBody<Record<string, unknown>>(request)) || {});
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font in lịch." }, 500);
    const pdf = await buildCalendarPrintPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      { ...input, logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined },
    );
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${calendarPrintDownloadName(input)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // Đổi mật khẩu tài khoản quản trị — chỉ chính tài khoản admin (không Audit, không nhân sự khác).
  if (url.pathname === "/api/admin/password" && request.method === "POST") {
    const adminEmail = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    if (session.role !== "ADMIN" || session.auditor || !adminEmail || session.email.toLowerCase() !== adminEmail) return json({ error: "Chỉ tài khoản quản trị được đổi mật khẩu ở đây." }, 403);
    const body = await parseBody<{ current?: string; next?: string }>(request);
    const current = String(body?.current || "");
    const next = String(body?.next || "");
    if (studentLoginLocked(`admin:${adminEmail}`)) return json({ error: "Sai mật khẩu quá nhiều lần — thử lại sau 15 phút." }, 429);
    if (!(await adminPasswordOk(env, current))) {
      recordStudentLoginFail(`admin:${adminEmail}`);
      return json({ error: "Mật khẩu hiện tại không đúng." }, 400);
    }
    if (next.length < 8 || next.length > 128) return json({ error: "Mật khẩu mới cần từ 8 đến 128 ký tự." }, 400);
    if (next === current) return json({ error: "Mật khẩu mới phải khác mật khẩu hiện tại." }, 400);
    await env.STEPS_LMS_DATA.put(ADMIN_PASSWORD_KEY, JSON.stringify({ hash: await hashStudentPassword(next), changedAt: new Date().toISOString() }));
    clearStudentLoginFails(`admin:${adminEmail}`);
    await writeAudit(env, session, [{ action: "UPDATE", entity: "User", entityId: adminEmail, summary: "Đổi mật khẩu tài khoản quản trị" }]).catch(() => undefined);
    return json({ ok: true });
  }

  // Báo cáo thu học phí toàn trung tâm (Đối soát thu chi → Tải báo cáo): chỉ admin (không kế toán, không Audit); chỉ vẽ số liệu client đã tính.
  if (url.pathname === "/api/finance/recon-report-pdf" && request.method === "POST") {
    if (!isSuperAdmin(session)) return json({ error: "FORBIDDEN" }, 403);
    const input = cleanDailyReportInput((await parseBody<Record<string, unknown>>(request)) || {});
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font báo cáo." }, 500);
    const pdf = await buildDailyReportPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      { ...input, logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined },
    );
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${dailyReportDownloadName(input)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // Báo cáo buổi dạy PDF (Báo cáo chấm công / Chấm công của tôi): chỉ vẽ số liệu client đã tính.
  if (url.pathname === "/api/timesheet/report-pdf" && request.method === "POST") {
    if (!canManageFinance(session.role) && session.role !== "TEACHER") return json({ error: "FORBIDDEN" }, 403);
    const input = cleanTimesheetReportInput((await parseBody<Record<string, unknown>>(request)) || {});
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font báo cáo." }, 500);
    const pdf = await buildTimesheetReportPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      { ...input, logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined },
    );
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${timesheetReportDownloadName(input.period)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/api/reports/academic-session" && request.method === "POST") {
    if (session.role !== "ADMIN" && session.role !== "TEACHER" && session.role !== "ASSISTANT") return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Record<string, unknown>>(request) || {};
    const columns = (Array.isArray(body.columns) ? body.columns : []).slice(0, 12).map((column) => {
      const item = (column || {}) as Record<string, unknown>;
      return { id: String(item.id || "").slice(0, 80), name: String(item.name || "Cột điểm").trim().slice(0, 40) || "Cột điểm" };
    });
    const allowedColumnKeys = new Set(["status", "clip", "worksheet", "vocabulary", "note", ...columns.map((column) => `assessment:${column.id}`)]);
    const columnOrder = (Array.isArray(body.columnOrder) ? body.columnOrder : [])
      .map((key) => String(key || "").trim().slice(0, 100))
      .filter((key, index, keys) => allowedColumnKeys.has(key) && keys.indexOf(key) === index)
      .slice(0, 16);
    const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 80).map((row) => {
      const item = (row || {}) as Record<string, unknown>;
      const scores = Array.isArray(item.scores) ? item.scores.map((value) => String(value ?? "").trim().slice(0, 40) || "—") : [];
      return {
        code: String(item.code || "—").trim().slice(0, 40),
        fullName: String(item.fullName || "Học viên").trim().slice(0, 80),
        status: String(item.status || "—").trim().slice(0, 40),
        clipDone: Boolean(item.clipDone),
        worksheetDone: Boolean(item.worksheetDone),
        vocabulary: String(item.vocabulary ?? "—").trim().slice(0, 40) || "—",
        scores,
        // Giữ đủ độ dài ô nhập điểm danh (300) — bản PDF tự xuống dòng, cắt ở
        // đây sẽ mất phần cuối nhận xét mà bản xem trước vẫn hiện đủ.
        note: String(item.note || "—").trim().slice(0, 300),
      };
    });
    const className = String(body.className || "Lớp học").trim().slice(0, 80) || "Lớp học";
    const sequence = String(body.sequence || "—").trim().slice(0, 12) || "—";
    const dateLabel = String(body.dateLabel || "").trim().slice(0, 20);
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font báo cáo học vụ." }, 500);
    const pdf = await buildAcademicReportPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      {
        className,
        sequence,
        dateLabel,
        timeLabel: String(body.timeLabel || "").trim().slice(0, 40),
        teacherName: String(body.teacherName || "Chưa phân công").trim().slice(0, 80),
        showClip: body.showClip !== false,
        showWorksheet: body.showWorksheet === true,
        showVocabulary: body.showVocabulary !== false,
        showNote: body.showNote !== false,
        columnOrder,
        columns,
        rows,
        logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined,
      },
    );
    const filename = academicReportDownloadName(className, dateLabel, sequence);
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/api/reports/periodic-report" && request.method === "POST") {
    if (session.role !== "ADMIN" && session.role !== "TEACHER" && session.role !== "ASSISTANT") return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Record<string, unknown>>(request) || {};
    const scoreOf = (value: unknown) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(10, Math.max(0, number)) : null;
    };
    const rawScores = (body.scores || {}) as Record<string, unknown>;
    const rawComments = (body.skillComments || {}) as Record<string, unknown>;
    const [regularRes, mediumRes, logoRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/steps-wordmark.png", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font báo cáo định kỳ." }, 500);
    const studentCode = String(body.studentCode || "HV").trim().slice(0, 24);
    const periodLabel = String(body.periodLabel || "Báo cáo định kỳ").trim().slice(0, 60) || "Báo cáo định kỳ";
    const pdf = await buildPeriodicReportPdf(
      { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() },
      {
        className: String(body.className || "Lớp học").trim().slice(0, 80) || "Lớp học",
        periodLabel,
        fromLabel: String(body.fromLabel || "").trim().slice(0, 20),
        toLabel: String(body.toLabel || "").trim().slice(0, 20),
        studentName: String(body.studentName || "Học viên").trim().slice(0, 80) || "Học viên",
        studentCode,
        attendance: String(body.attendance || "—").trim().slice(0, 200) || "—",
        attitudeComment: String(body.attitudeComment || "").slice(0, 2000),
        scores: {
          listening: scoreOf(rawScores.listening),
          speaking: scoreOf(rawScores.speaking),
          reading: scoreOf(rawScores.reading),
          writing: scoreOf(rawScores.writing),
        },
        skillComments: {
          listening: String(rawComments.listening || "").slice(0, 1000),
          speaking: String(rawComments.speaking || "").slice(0, 1000),
          reading: String(rawComments.reading || "").slice(0, 1000),
          writing: String(rawComments.writing || "").slice(0, 1000),
        },
        comment: String(body.comment || "").slice(0, 2000),
        logoPng: logoRes.ok ? new Uint8Array(await logoRes.arrayBuffer()) : undefined,
      },
    );
    const filename = periodicReportDownloadName(studentCode, periodLabel);
    const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/api/finance/qr-image" && request.method === "GET") {
    const book = hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"));
    const img = decodeQrImageDataUrl(book.sepay?.settings.qrImageDataUrl || "");
    if (!img) return json({ error: "Chưa cấu hình ảnh QR." }, 404);
    return new Response(img.bytes.buffer as ArrayBuffer, {
      headers: { "Content-Type": img.mimeType, "Cache-Control": "public, max-age=86400" },
    });
  }

  // QR chuyển khoản cho một khoản học phí của chính học viên (Portal → Học phí). Admin dùng khi "Xem Portal".
  const portalQrMatch = url.pathname.match(/^\/api\/portal\/qr\/([^/]+)$/);
  if (portalQrMatch && request.method === "GET") {
    if (session.role !== "STUDENT" && session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
    // Cùng sổ học phí đã đồng bộ như /api/bootstrap (phiếu kỳ hiện tại có thể chưa ghi xuống DB).
    const ledger = mergeSepayLedger((await syncedFinance(env, null, null, null, { persist: false })).sepay);
    // Phiếu kỳ chưa ghi xuống DB được tạo lại mỗi lần đồng bộ (id mới) → tìm thêm theo billKey của chính học viên.
    const billKey = url.searchParams.get("bill") || "";
    const receivable = ledger.receivables.find((row) => row.id === decodeURIComponent(portalQrMatch[1]!))
      || (billKey && session.role === "STUDENT" ? ledger.receivables.find((row) => row.studentId === session.studentId && row.billKey === billKey && row.status !== "CANCELLED") : undefined);
    if (!receivable || receivable.status === "CANCELLED" || (session.role === "STUDENT" && receivable.studentId !== session.studentId)) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    const qrClasses = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? []);
    const qrStudents = cleanStudents((await env.STEPS_LMS_DATA.get<DemoStudent[]>("students:steps-demo", "json")) ?? []);
    const order = ledger.paymentOrders.find((row) => row.id === receivable.paymentOrderId);
    const addInfo = billPaymentCode(qrClasses.find((row) => row.id === receivable.classId) || {}, qrStudents.find((row) => row.id === receivable.studentId) || {}, receivable.billKey)
      || order?.paymentCode || receivable.receivableCode;
    const svg = vietQrSvg({
      bankId: ledger.settings.bank,
      accountNumber: ledger.settings.accountNumber,
      accountName: ledger.settings.accountName,
      amount: Math.max(0, Math.round(Number(receivable.balanceDue) || 0)),
      addInfo,
    });
    if (!svg) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, no-store" } });
  }

  if (url.pathname === "/api/finance/tuition-qr" && request.method === "GET") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const svg = vietQrSvg({
      bankId: url.searchParams.get("bank") || "",
      accountNumber: url.searchParams.get("account") || "",
      accountName: url.searchParams.get("accountName") || "",
      amount: Number(url.searchParams.get("amount") || 0),
      addInfo: url.searchParams.get("addInfo") || "",
    });
    if (!svg) return json({ error: "Không tạo được QR chuyển khoản." }, 400);
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/api/finance/tuition-notice" && request.method === "POST") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Record<string, unknown>>(request) || {};
    // "Tải phiếu" cả lớp: client gửi `notices` — mỗi học viên một phiếu (học phí riêng) —
    // server dựng từng phiếu rồi gộp thành một file PDF nhiều trang.
    const items = (Array.isArray(body.notices) && body.notices.length ? body.notices : [body]) as Record<string, unknown>[];
    if (items.length > 80) return json({ error: "Danh sách quá dài, hãy tải theo nhóm nhỏ hơn." }, 400);
    for (const item of items) {
      if (!Math.round(Number(item.sessions) || 0)) return json({ error: "Kỳ học phí đã chọn không có buổi học để lập phiếu báo." }, 400);
    }
    const qrUrl = String(body.qrUrl || items[0]?.qrUrl || "");
    const uploadedQr = decodeQrImageDataUrl(qrUrl);
    let qrPng = uploadedQr?.mimeType === "image/png" ? uploadedQr.bytes : undefined;
    let qrJpg = uploadedQr?.mimeType === "image/jpeg" ? uploadedQr.bytes : undefined;
    const localQr = qrUrl.replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
    if (!qrPng && !qrJpg && localQr === "/api/finance/qr-image") {
      const book = hydrateFinance(await env.STEPS_LMS_DATA.get<DemoFinance>("finance:steps-demo", "json"));
      const img = decodeQrImageDataUrl(book.sepay?.settings.qrImageDataUrl || "");
      qrPng = img?.mimeType === "image/png" ? img.bytes : undefined;
      qrJpg = img?.mimeType === "image/jpeg" ? img.bytes : undefined;
    }
    if (!qrPng && !qrJpg && (localQr === "/QRcodebank.jpg" || qrUrl.endsWith("/QRcodebank.jpg") || !qrUrl)) {
      const qrRes = await env.ASSETS.fetch(new Request(new URL("/QRcodebank.jpg", request.url)));
      if (qrRes.ok) qrJpg = new Uint8Array(await qrRes.arrayBuffer());
    }
    if (!qrPng && !qrJpg && /^https:\/\/img\.vietqr\.io\//i.test(qrUrl)) {
      try {
        const qrRes = await fetch(qrUrl);
        if (qrRes.ok) qrPng = new Uint8Array(await qrRes.arrayBuffer());
      } catch {
        qrPng = undefined;
      }
    }
    const [regularRes, mediumRes] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Regular.ttf", request.url))),
      env.ASSETS.fetch(new Request(new URL("/fonts/Roboto-Medium.ttf", request.url))),
    ]);
    if (!regularRes.ok || !mediumRes.ok) return json({ error: "Thiếu font phiếu báo." }, 500);
    const fonts = { regular: await regularRes.arrayBuffer(), medium: await mediumRes.arrayBuffer() };
    const className = String(body.className || "Lớp học");
    const period = String(body.period || "");
    const issuedDate = new Intl.DateTimeFormat("vi-VN").format(new Date());
    const parts: Uint8Array[] = [];
    for (const item of items) {
      const studentName = String(item.studentName || "");
      parts.push(await buildTuitionNoticePdf(fonts, {
        centerName: "STEPS LMS",
        branchName: String(item.branchName || "Trung tâm STEPS"),
        label: String(item.label || ""),
        periodLabel: String(item.periodLabel || ""),
        contentLabel: String(item.contentLabel || "Học phí"),
        className: String(item.className || className),
        recipientLeftLabel: studentName ? "Học viên" : "Đối tượng",
        recipientLeftValue: studentName || "Toàn bộ học viên",
        recipientRightLabel: studentName ? "Mã học viên" : "Sĩ số lớp",
        recipientRightValue: studentName ? String(item.studentCode || "—") : `${Math.max(0, Math.round(Number(item.studentCount) || 0))} học viên`,
        tuitionExempt: Boolean(item.tuitionExempt),
        sessions: Math.max(0, Math.round(Number(item.sessions) || 0)),
        unitPrice: Math.max(0, Math.round(Number(item.unitPrice) || 0)),
        tuitionAmount: Math.max(0, Math.round(Number(item.tuitionAmount) || 0)) || undefined,
        offCreditSessions: Math.max(0, Math.round(Number(item.offCreditSessions) || 0)),
        offCreditAmount: Math.max(0, Math.round(Number(item.offCreditAmount) || 0)),
        offCreditLabel: String(item.offCreditLabel || ""),
        offCreditPeriodLabel: String(item.offCreditPeriodLabel || ""),
        carryInSessions: Math.max(0, Math.round(Number(item.carryInSessions) || 0)),
        carryInAmount: Math.max(0, Math.round(Number(item.carryInAmount) || 0)),
        carryInLabel: String(item.carryInLabel || ""),
        carryInPeriodLabel: String(item.carryInPeriodLabel || ""),
        materialsAmount: Math.max(0, Math.round(Number(item.materialsAmount) || 0)),
        materialsLabel: String(item.materialsLabel || "Học liệu"),
        oldDebtSessions: Math.max(0, Math.round(Number(item.oldDebtSessions) || 0)),
        oldDebtAmount: Math.max(0, Math.round(Number(item.oldDebtAmount) || 0)),
        oldDebtLabel: String(item.oldDebtLabel || ""),
        oldDebtPeriodLabel: String(item.oldDebtPeriodLabel || ""),
        transferAmount: Math.round(Number(item.transferAmount) || 0),
        transferLabel: String(item.transferLabel || ""),
        transferPeriodLabel: String(item.transferPeriodLabel || ""),
        preservedApplied: Math.max(0, Math.round(Number(item.preservedApplied) || 0)),
        carryDebtAmount: Math.max(0, Math.round(Number(item.carryDebtAmount) || 0)),
        carryDebtLabel: String(item.carryDebtLabel || ""),
        carryDebtPeriodLabel: String(item.carryDebtPeriodLabel || ""),
        priorPaidAmount: Math.max(0, Math.round(Number(item.priorPaidAmount) || 0)),
        leftClass: item.leftClass && typeof item.leftClass === "object" ? {
          billedSessions: Math.max(0, Math.round(Number((item.leftClass as Record<string, unknown>).billedSessions) || 0)),
          deductionSessions: Math.max(0, Math.round(Number((item.leftClass as Record<string, unknown>).deductionSessions) || 0)),
          deductionAmount: Math.max(0, Math.round(Number((item.leftClass as Record<string, unknown>).deductionAmount) || 0)),
        } : undefined,
        issuedAmount: Math.max(0, Math.round(Number(item.issuedAmount) || 0)) || undefined,
        amount: Math.max(0, Math.round(Number(item.amount) || 0)),
        bankName: String(item.bankName || "Chưa cấu hình"),
        bankId: String(item.bankId || ""),
        accountNumber: String(item.accountNumber || "—"),
        accountName: String(item.accountName || "—"),
        paymentContent: String(item.paymentContent || ""),
        issuedDate,
        qrPng,
        qrJpg,
      }));
    }
    let out: Uint8Array;
    if (parts.length === 1) {
      out = parts[0];
    } else {
      const merged = await PDFDocument.create();
      for (const part of parts) {
        const src = await PDFDocument.load(part, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      out = await merged.save();
    }
    const filename = tuitionNoticeDownloadName(className, period, items.length === 1 ? String(body.studentCode || "") : "");
    const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (url.pathname === "/api/finance/sepay" && request.method === "POST") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Record<string, unknown>>(request) || {};
    let snapshot = await readFinanceSnapshot(env);
    const current = syncTuitionCashbook(snapshot.finance);
    if (String(body.action || "") === "collect") {
      if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
      let collected = await collectTuitionAction(env, snapshot, body, session);
      for (let attempt = 0; collected.conflict && attempt < 3; attempt += 1) {
        snapshot = await readFinanceSnapshot(env);
        collected = await collectTuitionAction(env, snapshot, body, session);
      }
      if (collected.conflict) return json({ error: "Hệ thống đang lưu một phiếu khác, anh/chị bấm Thu học phí lại giúp em." }, 409);
      if (collected.error) return json({ error: collected.error }, 400);
      return json({ ok: true, finance: collected.finance, students: collected.students, zaloMessage: collected.zaloMessage });
    }
    if (String(body.action || "") === "request-payment") {
      if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
      let requested = await requestPaymentAction(env, snapshot, body, session);
      for (let attempt = 0; requested.conflict && attempt < 3; attempt += 1) {
        snapshot = await readFinanceSnapshot(env);
        requested = await requestPaymentAction(env, snapshot, body, session);
      }
      if (requested.conflict) return json({ error: "Hệ thống đang lưu một phiếu khác, anh/chị thử lại giúp em." }, 409);
      if (requested.error) return json({ error: requested.error }, 400);
      return json({ ok: true, finance: requested.finance, receivable: requested.receivable, zaloMessage: requested.zaloMessage });
    }
    if (String(body.action || "") === "assign-review") {
      let assigned = await assignReviewTransactionAction(env, snapshot, body, session);
      for (let attempt = 0; assigned.conflict && attempt < 3; attempt += 1) {
        snapshot = await readFinanceSnapshot(env);
        assigned = await assignReviewTransactionAction(env, snapshot, body, session);
      }
      if (assigned.conflict) return json({ error: "Hệ thống đang lưu một phiếu khác, anh/chị thử lại giúp em." }, 409);
      if (assigned.error) return json({ error: assigned.error }, assigned.status || 400);
      return json({ ok: true, finance: assigned.finance, students: assigned.students });
    }
    if (String(body.action || "") === "collect-anonymous") {
      const collected = await collectAnonymousTransaction(env, snapshot, body, session);
      if (collected.error) return json({ error: collected.error }, collected.status || 400);
      return json({ ok: true, finance: collected.finance });
    }
    if (String(body.action || "") === "resolve-review") {
      const resolved = await resolveReviewTransaction(env, snapshot, body, session);
      if (resolved.error) return json({ error: resolved.error }, resolved.status || 400);
      return json({ ok: true, finance: resolved.finance });
    }
    const next = syncTuitionCashbook(await applySepayAction(current, body));
    if (JSON.stringify(next.cashbook) !== JSON.stringify(current.cashbook) || JSON.stringify(next.sepay) !== JSON.stringify(current.sepay)) {
      const todayLock = await todayLockedError(env);
      if (todayLock) return json({ error: todayLock }, 409);
    }
    const sepayLockHit = lockedCashbookTouch(current.cashbook, next.cashbook, await readReconLockDates(env));
    if (sepayLockHit) return json({ error: lockedDayError(sepayLockHit) }, 409);
    if (!await persistFinanceIfUnchanged(env, snapshot.stored, next)) {
      return json({ error: "Dữ liệu vừa được cập nhật ở nơi khác, anh/chị tải lại trang rồi thao tác lại giúp em." }, 409);
    }
    return json({ ok: true, finance: next });
  }

  // Nhập sao kê BIDV: đọc cột ngày giao dịch (B), ghi có (D), nội dung (F) rồi đẩy
  // từng dòng qua đúng pipeline khớp thanh toán của SePay — khớp mã thì ghi phiếu thu,
  // dòng tiền vào không khớp → hàng đợi Giao dịch lệch. Upload trùng → bỏ qua.
  if (url.pathname === "/api/finance/bank-statement" && request.method === "POST") {
    if (!canManageFinance(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Record<string, unknown>>(request) || {};
    const fileName = String(body.fileName || "sao-ke").slice(0, 120);
    const parsed = parseStatementFile(String(body.fileBase64 || ""));
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    const result = await importBankStatement(env, session, fileName, parsed.rows, String(body.mode || "preview") === "apply" ? "apply" : "preview");
    return json(result.body, result.status);
  }

  if (url.pathname === "/api/settings" && request.method === "PUT") {
    // Hành chính: sửa Thông tin trung tâm, Chi nhánh, Loại lớp, Tiết học. Gói học phí, phòng học giữ nguyên bản đã lưu.
    const officeHc = !isSuperAdmin(session) && await sessionIsOfficeHc(env, session);
    if (!isSuperAdmin(session) && !officeHc) return json({ error: session.role === "ADMIN" ? "Tài khoản Audit không được sửa tài khoản / cấu hình hệ thống." : "FORBIDDEN" }, 403);
    const body = await parseBody<DemoSettings>(request);
    if (!body) return json({ error: "Dữ liệu cấu hình không hợp lệ." }, 400);
    const previous = mergeSettings(await env.STEPS_LMS_DATA.get<DemoSettings>("settings:steps-demo", "json"));
    const settings = cleanSettings(officeHc ? { ...body, tuitionPackages: previous.tuitionPackages, rooms: previous.rooms } : body);
    if (!settings.center.name) return json({ error: "Tên trung tâm là bắt buộc." }, 400);
    await env.STEPS_LMS_DATA.put("settings:steps-demo", JSON.stringify(settings));
    if (JSON.stringify(previous) !== JSON.stringify(settings)) {
      await writeAudit(env, session, [
        { action: "UPDATE", entity: "Settings", entityId: "steps-demo", summary: "Cập nhật cấu hình hệ thống" },
      ]);
    }
    return json({ ok: true, settings });
  }

  if (url.pathname === "/api/syllabuses" && request.method === "GET") {
    const items = await catalog.list();
    const documents = await Promise.all(items.map((meta) => documentFor(meta.id).getOrInit(initialDocument(meta.id))));
    const synced = items.map((meta, index) => {
      const document = documents[index];
      if (!document) return meta;
      return {
        ...meta,
        name: document.meta.name || meta.name,
        description: document.meta.description ?? meta.description,
        level: document.meta.level || meta.level,
        status: document.meta.status || meta.status,
        totalCourseDays: document.meta.totalCourseDays || meta.totalCourseDays,
      };
    });
    await Promise.all(synced.map((meta, index) => {
      const previous = items[index]!;
      if (previous.name === meta.name && previous.description === meta.description && previous.totalCourseDays === meta.totalCourseDays) return Promise.resolve();
      return catalog.upsert(meta);
    }));
    return json({ items: synced });
  }

  if (url.pathname === "/api/syllabuses" && request.method === "POST") {
    if (!canEditPortalContent(session.role)) return json({ error: "FORBIDDEN" }, 403);
    const body = await parseBody<Partial<SyllabusMeta> & { unitCount?: number }>(request);
    if (!body?.name?.trim()) return json({ error: "Tên syllabus là bắt buộc." }, 400);
    try {
      const meta = await catalog.create(body);
      const document: SyllabusDocument = { meta, sections: [], units: [], days: [], lessons: [], resources: [], exercises: [], activities: [] };
      const unitCount = Math.max(0, Math.min(50, Number(body.unitCount) || 0));
      for (let index = 0; index < unitCount; index += 1) {
        const sectionId = `section-${crypto.randomUUID()}`;
        const unitId = `unit-${crypto.randomUUID()}`;
        document.sections.push({ id: sectionId, type: "UNIT", title: `Unit ${index + 1}`, courseDayStart: null, courseDayEnd: null, sortOrder: index + 1, unitId });
        document.units.push({ id: unitId, sectionId, unitNumber: index + 1, name: `Unit ${index + 1}`, topic: "", overview: "", learningObjectives: [], order: index + 1 });
      }
      await documentFor(meta.id).replace(document);
      return json({ ok: true, item: meta, document }, 201);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Không tạo được syllabus." }, 400);
    }
  }

  const syllabusMatch = url.pathname.match(/^\/api\/syllabuses\/([^/]+)(?:\/(actions|duplicate))?$/);
  if (syllabusMatch) {
    const id = decodeURIComponent(syllabusMatch[1]!);
    const operation = syllabusMatch[2];
    const stub = documentFor(id);

    if (!operation && request.method === "GET") {
      const document = await stub.getOrInit(initialDocument(id));
      return document ? json(document) : json({ error: "Không tìm thấy syllabus." }, 404);
    }
    if (!operation && request.method === "DELETE") {
      if (!isSuperAdmin(session)) return json({ error: session.role === "ADMIN" ? "Chỉ quản trị mới xoá được chương trình." : "FORBIDDEN" }, 403);
      // Chương trình đang gắn lớp thì không xoá (học viên lớp đó sẽ mất bài trên Portal) — đổi chương trình của lớp trước.
      const classes = cleanClasses((await env.STEPS_LMS_DATA.get<DemoClass[]>("classes:steps-demo", "json")) ?? defaultClasses());
      const using = classes.filter((row) => row.syllabusId === id);
      if (using.length) return json({ error: `Chương trình đang dùng cho lớp ${using.map((row) => row.code || row.name).join(", ")}. Vào Lớp học đổi chương trình của lớp đó trước rồi mới xoá.`, classes: using.map((row) => row.code || row.name) }, 409);
      const before = await stub.getOrInit(initialDocument(id));
      await Promise.all([stub.clear(), catalog.remove(id)]);
      await writeAudit(env, session, [{ action: "DELETE", entity: "Syllabus", entityId: id, summary: `Xoá chương trình ${before?.meta?.name || id}${before?.meta?.code ? ` (${before.meta.code})` : ""}` }]);
      return json({ ok: true });
    }
    if (operation === "actions" && request.method === "POST") {
      if (!canEditPortalContent(session.role)) return json({ error: "FORBIDDEN" }, 403);
      const input = await parseBody<MutationInput>(request);
      if (!input?.action) return json({ error: "Thiếu thao tác." }, 400);
      try {
        if (input.action === "updateMeta" && typeof input.code === "string") {
          const code = input.code.trim().toUpperCase();
          const duplicate = (await catalog.list()).some((item) => item.id !== id && item.code.toUpperCase() === code);
          if (duplicate) throw new Error("Mã syllabus đã tồn tại.");
        }
        const result = await stub.mutate(input);
        await catalog.upsert(result.document.meta);
        return json(result);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Không lưu được dữ liệu." }, 400);
      }
    }
    if (operation === "duplicate" && request.method === "POST") {
      if (session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
      const source = await stub.getOrInit(initialDocument(id));
      if (!source) return json({ error: "Không tìm thấy syllabus." }, 404);
      const body = await parseBody<{ name?: string; code?: string }>(request);
      try {
        const meta = await catalog.create({ ...source.meta, id: undefined, name: body?.name?.trim() || `${source.meta.name} (bản sao)`, code: body?.code?.trim() || `${source.meta.code}-COPY`, status: "DRAFT" });
        const document = cloneSyllabus(source, meta);
        await documentFor(meta.id).replace(document);
        return json({ ok: true, item: meta, document }, 201);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Không nhân bản được syllabus." }, 400);
      }
    }
  }

  if (url.pathname === "/api/bootstrap" && request.method === "GET") {
    const core = await bootstrapCore(env);
    const bootstrapPayload = await bootstrapPayloadFor(env, core, session);
    // Học viên thật chỉ nhận dữ liệu của chính mình (tài khoản demo giữ nguyên bản trình diễn).
    if (session.role === "STUDENT" && session.studentId !== "student-demo") {
      return json(studentBootstrapView(bootstrapPayload as unknown as Record<string, unknown>, session.studentId));
    }
    // Phần riêng người dùng stringify mỗi lần (nhỏ); phần dùng chung (~16MB) stringify một lần
    // cho mỗi vai trò và mỗi bản core, ghép lại thành đúng một object JSON như trước.
    const variant = bootstrapVariantOf(session);
    // app.js mới xin bản nhẹ (?split=1); app.js cũ còn trong cache / portal-studio nhận bản đầy đủ như trước.
    const split = url.searchParams.get("split") === "1";
    if (split) bootstrapRecentSessions.set(variant, { session, at: Date.now() });
    const sharedJson = bootstrapSharedJsonOf(core, variant, bootstrapPayload, split).json;
    const { user, student: studentPart, progress: progressPart, periodicReports: reportsPart } = bootstrapPayload;
    const personal = JSON.stringify(repairLegacyEncoding({ user, student: studentPart, progress: progressPart, periodicReports: reportsPart }));
    return new Response(`${personal.slice(0, -1)},${sharedJson.slice(1)}`, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...securityHeaders },
    });
  }

  if (url.pathname === "/api/bootstrap/rest" && request.method === "GET") {
    const entry = bootstrapRestJson.get(url.searchParams.get("token") || "");
    // Token của vai trò khác hoặc đã hết hạn → app.js tải lại bản đầy đủ.
    if (!entry || entry.variant !== bootstrapVariantOf(session)) return json({ error: "BOOTSTRAP_REST_EXPIRED" }, 409);
    return new Response(entry.json, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...securityHeaders } });
  }

  if (url.pathname === "/api/portal/read-check" && request.method === "POST") {
    if (session.role !== "STUDENT" && session.role !== "ADMIN") return json({ error: "FORBIDDEN" }, 403);
    return handleReadAloudCheck(request, env as unknown as Parameters<typeof handleReadAloudCheck>[1], `${session.role}:${session.studentId}:${session.email}`, json);
  }

  if (url.pathname === "/api/media" && request.method === "POST") {
    if (!canEditPortalContent(session.role)) return json({ error: "FORBIDDEN" }, 403);
    return handlePortalMediaUpload(request, env.MEDIA, json);
  }

  if (url.pathname === "/api/progress" && request.method === "POST") {
    const body = await parseBody<{ itemId?: string; completed?: boolean }>(request);
    if (!body?.itemId || typeof body.completed !== "boolean" || body.itemId.length > 100) {
      return json({ error: "Dữ liệu tiến độ không hợp lệ." }, 400);
    }

    const key = `progress:${session.studentId}`;
    const progress = (await env.STEPS_LMS_DATA.get<Record<string, boolean>>(key, "json")) ?? {};
    progress[body.itemId] = body.completed;
    await env.STEPS_LMS_DATA.put(key, JSON.stringify(progress));
    return json({ ok: true, progress });
  }

  if (url.pathname === "/api/activity-attempts" && request.method === "POST") {
    const body = await parseBody<ActivityAttemptInput>(request);
    if (!body?.syllabusId || !body.activityId || !Number.isFinite(body.score) || !Number.isFinite(body.accuracy)) {
      return json({ error: "Kết quả game không hợp lệ." }, 400);
    }
    const document = await documentFor(body.syllabusId).getOrInit(initialDocument(body.syllabusId));
    const activity = document?.activities?.find((item) => item.id === body.activityId && item.status === "PUBLISHED");
    if (!document || !activity) return json({ error: "Không tìm thấy hoạt động đã xuất bản." }, 404);
    const key = `activity-attempts:${session.studentId}`;
    const attempts = (await env.STEPS_LMS_DATA.get<Record<string, unknown>[]>(key, "json")) ?? [];
    const attempt = {
      id: `attempt-${crypto.randomUUID()}`,
      studentId: session.studentId,
      syllabusId: body.syllabusId,
      activityId: body.activityId,
      score: Math.max(0, Math.min(100, Number(body.score))),
      accuracy: Math.max(0, Math.min(100, Number(body.accuracy))),
      durationSeconds: Math.max(0, Number(body.durationSeconds) || 0),
      answers: Array.isArray(body.answers) ? body.answers.slice(0, 100) : [],
      completedAt: new Date().toISOString(),
    };
    const passed = attempt.score >= activity.passingScore;
    const progressKey = `progress:${session.studentId}`;
    const activityProgress = (await env.STEPS_LMS_DATA.get<Record<string, boolean>>(progressKey, "json")) ?? {};
    if (passed) activityProgress[activity.id] = true;
    await Promise.all([
      env.STEPS_LMS_DATA.put(key, JSON.stringify([attempt, ...attempts].slice(0, 100)),),
      env.STEPS_LMS_DATA.put(progressKey, JSON.stringify(activityProgress)),
    ]);
    return json({ ok: true, attempt, passed, progress: activityProgress }, 201);
  }

  return json({ error: "NOT_FOUND" }, 404);
}

async function serveApp(request: Request, env: DemoEnv) {
  const assetUrl = new URL(request.url);
  // Fetch the root document so Workers Assets returns 200 instead of redirecting
  // /index.html to /. The browser keeps the SPA route on refresh/deep links.
  assetUrl.pathname = "/";
  return env.ASSETS.fetch(new Request(assetUrl, request));
}

function isStaticAssetPath(pathname: string) {
  return pathname !== "/" && /\.[a-z0-9]+$/i.test(pathname);
}

const worker = {
  async fetch(request: Request, env: DemoEnv): Promise<Response> {
    const url = new URL(request.url);
    // API chỉ đọc cho trợ lý AI: tách hẳn khỏi handleApi (không cookie, không gia hạn
    // phiên, không ghi gì) — xem readonly-api.ts.
    if (url.pathname === READONLY_PREFIX || url.pathname.startsWith(`${READONLY_PREFIX}/`)) {
      return handleReadonlyApi(request, env, url);
    }
    // API thao tác cho trợ lý: chỉ nhập sao kê (xem trước → anh Vũ đồng ý → xác nhận).
    if (url.pathname === OPS_PREFIX || url.pathname.startsWith(`${OPS_PREFIX}/`)) {
      trackKvWrites(env.STEPS_LMS_DATA);
      bumpDataGeneration();
      const actor = { email: "muse-api", name: "Muse (trợ lý AI)", role: "ADMIN" as const };
      return handleOpsApi(request, env, url, {
        parseStatementFile,
        parseStatementRows: statementRowsFromJson,
        importBankStatement: (fileName, rows, mode, expectedStored) => importBankStatement(env, actor, fileName, rows, mode, expectedStored),
        reviewQueue: () => opsReviewQueue(env),
        reviewAction: (input, mode, expectedStored) => opsReviewAction(env, actor, input, mode, expectedStored),
      });
    }
    if (url.pathname.startsWith("/api/")) {
      trackKvWrites(env.STEPS_LMS_DATA);
      // Request ghi (kể cả ghi giáo trình / tệp học liệu) có thể đổi dữ liệu mở web — tăng thế hệ
      // trước và sau khi xử lý để /api/bootstrap không trả bản dựng sẵn đã cũ.
      const writes = request.method !== "GET" && request.method !== "HEAD";
      if (writes) bumpDataGeneration();
      try {
        const response = await handleApi(request, env, url);
        return renewSessionIfNeeded(request, env, url, response);
      } finally {
        if (writes) bumpDataGeneration();
      }
    }
    if (!isStaticAssetPath(url.pathname)) return serveApp(request, env);
    return env.ASSETS.fetch(request);
  },
};

export default worker;
export { SyllabusCatalog, SyllabusDocumentObject };
