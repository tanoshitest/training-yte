import { emptySepayLedger, mergeSepayLedger, type SepayLedger } from "./sepay-engine";

export type TuitionDebtStatus = "OWING" | "CLEAR";
export type CashEntryKind = "IN" | "OUT";
export type CashEntrySource = "TUITION" | "MANUAL";
export type ReconStatus = "MATCHED" | "PENDING" | "MISMATCH";
export type ReconEntryStatus = "MATCHED" | "PENDING";
export type FinanceForecastKind = "IN" | "OUT";
export type FinanceForecastStatus = "PLANNED" | "SETTLED";

export interface DemoTuitionDebt {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  classId: string;
  className: string;
  packageName: string;
  totalAmount: number;
  paidAmount: number;
  remainingSessions: number;
  status: TuitionDebtStatus;
}

export interface DemoCashEntry {
  id: string;
  date: string;
  voucherDate?: string; // Ngày chứng từ từ Excel (ngày chuyển khoản thực tế)
  kind: CashEntryKind;
  source: CashEntrySource;
  category: string;
  description: string;
  amount: number;
  method: string;
  branchId?: string;
  studentName?: string;
  tuitionId?: string;
  receiptId?: string;
  /** Dòng sổ quỹ sinh từ một giao dịch ngân hàng không gắn phiếu học phí: thu vô danh
   * (chưa xác định học viên) hoặc khoản chi đọc từ sao kê — để đối chiếu / IT gán lại sau. */
  bankTransactionId?: string;
}

export interface DemoReconDay {
  date: string;
  tuitionIn: number;
  manualIn: number;
  manualOut: number;
  net: number;
  status: ReconStatus;
  note: string;
}

/** Đối soát từng nghiệp vụ thu chi: kế toán duyệt từng phiếu, hoàn tác thì phiếu về Chưa khớp. */
export interface DemoReconEntry {
  entryId: string;
  status: ReconEntryStatus;
  /** Số tiền và ngày lúc duyệt: phiếu bị sửa sau khi duyệt thì phải đối soát lại. */
  amount: number;
  date: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface DemoPayrollRow {
  id: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  sessions: number;
  hours: number;
  baseSalary: number;
  commission: number;
  tax: number;
  net: number;
}

/**
 * Hợp đồng lao động: đóng BH NLD + giảm trừ gia cảnh, thuế lũy tiến.
 * Hợp đồng dịch vụ/thời vụ: không BH, không giảm trừ, khấu trừ 10% khi đủ ngưỡng.
 * `contractType` là trường cũ, vẫn đọc để dữ liệu lương đang có không bị lệch.
 */
export type PayrollContractType = "LABOR" | "SERVICE";
/** Trả lương theo giờ (lấy giờ từ chấm công) hoặc theo tháng (lấy ngày công từ chấm công). */
export type PayrollPayMode = "HOURLY" | "MONTHLY";
/** TT toàn thời gian, BTG bán thời gian, NN người nước ngoài, CSH cộng sự, DV dịch vụ. */
export type PayrollContractKind = "TT" | "BTG" | "NN" | "CSH" | "DV";
export type PayrollContractStatus = "DRAFT" | "ACTIVE" | "EXPIRED";

/** Thông tin hợp đồng/nhân sự cố định của giáo viên trên bảng lương. */
export interface DemoPayrollContract {
  department?: string;
  contractType?: PayrollContractType;
  /** Số người phụ thuộc — mỗi người giảm trừ 6,2 triệu/tháng. */
  dependents?: number;

  contractKind?: PayrollContractKind;
  payMode?: PayrollPayMode;
  status?: PayrollContractStatus;
  contractNo?: string;
  signedDate?: string;
  startDate?: string;
  endDate?: string;
  jobTitle?: string;
  workLocation?: string;
  /** K — mức lương đóng bảo hiểm (lương tháng). Bỏ trống thì = đơn giá giờ × 8 giờ × ngày công chuẩn của tháng. */
  insuranceSalary?: number;
  /** Hệ số lương riêng — đơn giá giờ = giờ công chuẩn của trung tâm × hệ số này; bỏ trống = 1. */
  salaryCoefficient?: number;
  /** Số giờ dạy cam kết mỗi tháng (100%). Phụ cấp nhân theo giờ thực tế / giờ cam kết; bỏ trống = nhận đủ phụ cấp. */
  committedHours?: number;
  /** Phụ cấp ăn trưa mỗi ngày làm việc (ghi đè chính sách). */
  mealAllowancePerDay?: number;
  /** Cá nhân hoá phụ cấp (nguyên mức tháng); bỏ trống thì lấy theo chính sách trong Cấu hình. `mealAllowance` là trường cũ, không còn dùng. */
  mealAllowance?: number;
  phoneAllowance?: number;
  fuelAllowance?: number;
  uniformAllowance?: number;
  nationalId?: string;
  dateOfBirth?: string;
  taxCode?: string;
  socialInsuranceNo?: string;
  bankAccount?: string;
  bankName?: string;
  note?: string;
}

/** Các khoản biến động nhập tay theo tháng lương của từng giáo viên. */
export interface DemoPayrollMonthInputs {
  allowance?: number;
  advance?: number;
  /** Số NGÀY nghỉ phép năm của tháng (vẫn hưởng lương — chỉ ghi nhận, không trừ ngày công). */
  paidLeaveDays?: number;
  /** Số NGÀY nghỉ không lương kế toán cấu hình cho tháng đó — trừ nguyên ngày vào ngày công chuẩn. */
  unpaidLeaveDays?: number;
  /** Ngày công chốt tay tháng đó — bỏ trống thì = ngày công chuẩn − unpaidLeaveDays. */
  paidDays?: number;
  /** Giờ công chốt tay của lương giờ — bỏ trống thì lấy giờ từ chấm công (trợ giảng không có lịch dạy dùng ô này). */
  hours?: number;
  note?: string;
}

export interface DemoPayrollTaxBracket {
  /** Trần thu nhập tính thuế của bậc; null là bậc cuối. */
  upTo: number | null;
  rate: number;
}

/** Chính sách lương dùng chung: áp cho mọi giáo viên, riêng từng HĐ có thể ghi đè. */
export interface DemoPayrollPolicy {
  effectiveFrom?: string;
  /** Số ngày công chuẩn tham chiếu của tháng (in trên hợp đồng); bảng lương luôn tự tính lại theo lịch tháng. */
  standardDays?: number;
  /** Giờ công chuẩn của trung tâm: số tiền trả cho 1 giờ dạy chuẩn (đồng/giờ). Đơn giá giờ giáo viên = mức này × hệ số lương. */
  standardHourlyRate?: number;
  personalDeduction?: number;
  dependentDeduction?: number;
  employeeInsuranceRate?: number;
  employerInsuranceRate?: number;
  foreignEmployeeInsuranceRate?: number;
  foreignEmployerInsuranceRate?: number;
  /** Khấu trừ thuế dịch vụ khi thu nhập đạt ngưỡng này. */
  serviceTaxThreshold?: number;
  serviceTaxRate?: number;
  /** Phụ cấp ăn trưa mỗi ngày làm việc: × số ngày làm việc của tháng (trừ Chủ nhật). */
  mealAllowancePerDay?: number;
  /** Phụ cấp nguyên mức tháng. `mealAllowance` (theo tháng) là trường cũ, không còn dùng để tính. */
  mealAllowance?: number;
  phoneAllowance?: number;
  fuelAllowance?: number;
  uniformAllowance?: number;
  /** Số giờ tối đa để điểm danh một buổi được tính đúng hạn. */
  attendanceDeadlineHours?: number;
  taxBrackets?: DemoPayrollTaxBracket[];
}

/** Khóa `payroll-config:steps-demo`: hồ sơ lương giáo viên + khoản nhập theo tháng. */
export interface DemoPayrollConfig {
  teachers?: Record<string, DemoPayrollContract>;
  /** months["2026-10"][teacherId] = khoản biến động của tháng đó. */
  months?: Record<string, Record<string, DemoPayrollMonthInputs>>;
  policy?: DemoPayrollPolicy;
}

export function defaultPayrollPolicy(): Required<Pick<DemoPayrollPolicy,
  | "standardDays" | "standardHourlyRate" | "personalDeduction" | "dependentDeduction"
  | "employeeInsuranceRate" | "employerInsuranceRate" | "foreignEmployeeInsuranceRate"
  | "foreignEmployerInsuranceRate" | "serviceTaxThreshold" | "serviceTaxRate"
  | "mealAllowance" | "mealAllowancePerDay" | "phoneAllowance" | "fuelAllowance" | "uniformAllowance"
  | "attendanceDeadlineHours" | "taxBrackets">> & DemoPayrollPolicy {
  return {
    effectiveFrom: "2026-10-01",
    standardDays: 26,
    standardHourlyRate: 0,
    personalDeduction: 15_500_000,
    dependentDeduction: 6_200_000,
    employeeInsuranceRate: 0.105,
    employerInsuranceRate: 0.215,
    foreignEmployeeInsuranceRate: 0.095,
    foreignEmployerInsuranceRate: 0.205,
    serviceTaxThreshold: 5_000_000,
    serviceTaxRate: 0.1,
    mealAllowance: 1_200_000,
    mealAllowancePerDay: 40_000,
    phoneAllowance: 300_000,
    fuelAllowance: 500_000,
    uniformAllowance: 400_000,
    attendanceDeadlineHours: 24,
    taxBrackets: [
      { upTo: 10_000_000, rate: 0.05 },
      { upTo: 30_000_000, rate: 0.1 },
      { upTo: 60_000_000, rate: 0.2 },
      { upTo: 100_000_000, rate: 0.3 },
      { upTo: null, rate: 0.35 },
    ],
  };
}

const PAYROLL_POLICY_NUMERIC_KEYS = [
  "standardDays", "standardHourlyRate", "personalDeduction", "dependentDeduction",
  "employeeInsuranceRate", "employerInsuranceRate", "foreignEmployeeInsuranceRate",
  "foreignEmployerInsuranceRate", "serviceTaxThreshold", "serviceTaxRate",
  "mealAllowance", "mealAllowancePerDay", "phoneAllowance", "fuelAllowance", "uniformAllowance",
  "attendanceDeadlineHours",
] as const;

function hydratePayrollPolicy(value?: DemoPayrollPolicy | null): DemoPayrollPolicy {
  const next: DemoPayrollPolicy = { ...defaultPayrollPolicy() };
  if (!value || typeof value !== "object") return next;
  if (typeof value.effectiveFrom === "string" && value.effectiveFrom.trim()) next.effectiveFrom = value.effectiveFrom;
  for (const key of PAYROLL_POLICY_NUMERIC_KEYS) {
    const input = Number(value[key]);
    if (Number.isFinite(input)) next[key] = Math.max(0, input);
  }
  if (Array.isArray(value.taxBrackets) && value.taxBrackets.length) {
    const rows = value.taxBrackets
      .filter((row) => row && typeof row === "object" && Number.isFinite(Number(row.rate)))
      .slice(0, 10)
      .map((row) => ({
        upTo: row.upTo === null || row.upTo === undefined ? null : Math.max(0, Math.round(Number(row.upTo) || 0)),
        rate: Math.max(0, Math.min(1, Number(row.rate) || 0)),
      }));
    if (rows.length) next.taxBrackets = rows;
  }
  return next;
}

export function hydratePayrollConfig(value?: DemoPayrollConfig | null): DemoPayrollConfig {
  return {
    teachers: value?.teachers && typeof value.teachers === "object" ? value.teachers : {},
    months: value?.months && typeof value.months === "object" ? value.months : {},
    policy: hydratePayrollPolicy(value?.policy),
  };
}

export interface DemoFinanceForecast {
  id: string;
  kind: FinanceForecastKind;
  category: string;
  description: string;
  amount: number;
  dueDate: string;
  status: FinanceForecastStatus;
  branchId?: string;
  createdAt?: string;
  updatedAt?: string;
  settledAt?: string;
}

export interface DemoFinance {
  debts: DemoTuitionDebt[];
  cashbook: DemoCashEntry[];
  recon: DemoReconDay[];
  reconEntries: DemoReconEntry[];
  payroll: DemoPayrollRow[];
  forecasts: DemoFinanceForecast[];
  sepay?: SepayLedger;
  /** Biên lai đã được người dùng chủ động xóa khỏi sổ thu chi, không tự phục hồi lại. */
  cashbookSkippedReceiptIds?: string[];
}

export function defaultFinance(): DemoFinance {
  return {
    debts: [
      { id: "debt-1", studentId: "student-demo-1", studentCode: "HV0001", studentName: "Nguyễn Minh Anh", classId: "class-demo-starters-a", className: "STEPS Starters A", packageName: "Gói 48 buổi", totalAmount: 9000000, paidAmount: 4500000, remainingSessions: 8, status: "OWING" },
      { id: "debt-2", studentId: "student-demo-2", studentCode: "HV0002", studentName: "Trần Gia Hân", classId: "class-demo-movers-b", className: "STEPS Movers B", packageName: "Gói 24 buổi", totalAmount: 4800000, paidAmount: 4800000, remainingSessions: 18, status: "CLEAR" },
    ],
    cashbook: [
      { id: "cash-1", date: "2026-09-04", kind: "IN", source: "TUITION", category: "Học phí", description: "Thu học phí gói 48 buổi", amount: 4500000, method: "Chuyển khoản", studentName: "Nguyễn Minh Anh", tuitionId: "debt-1" },
      { id: "cash-2", date: "2026-09-04", kind: "OUT", source: "MANUAL", category: "Văn phòng phẩm", description: "Mua giấy in và bút chấm bài", amount: 320000, method: "Tiền mặt" },
      { id: "cash-3", date: "2026-09-03", kind: "IN", source: "TUITION", category: "Học phí", description: "Thu học phí gói 24 buổi", amount: 4800000, method: "Tiền mặt", studentName: "Trần Gia Hân", tuitionId: "debt-2" },
      { id: "cash-4", date: "2026-09-03", kind: "OUT", source: "MANUAL", category: "Điện nước", description: "Hóa đơn điện tháng 8", amount: 1850000, method: "Chuyển khoản" },
      { id: "cash-5", date: "2026-09-02", kind: "OUT", source: "MANUAL", category: "Marketing", description: "In tờ rơi khai giảng", amount: 750000, method: "Chuyển khoản" },
    ],
    recon: [
      { date: "2026-09-04", tuitionIn: 4500000, manualIn: 0, manualOut: 320000, net: 4180000, status: "PENDING", note: "Chờ admin đối soát cuối ngày." },
      { date: "2026-09-03", tuitionIn: 4800000, manualIn: 0, manualOut: 1850000, net: 2950000, status: "MATCHED", note: "Khớp sổ. Admin đã duyệt." },
      { date: "2026-09-02", tuitionIn: 0, manualIn: 0, manualOut: 750000, net: -750000, status: "MISMATCH", note: "Thiếu phiếu thu học phí so với biên lai." },
    ],
    reconEntries: [],
    payroll: [
      { id: "pay-1", teacherId: "teacher-demo-1", teacherCode: "GV0001", teacherName: "Ms. Linh", sessions: 16, hours: 24, baseSalary: 8400000, commission: 450000, tax: 885000, net: 7965000 },
      { id: "pay-2", teacherId: "teacher-demo-2", teacherCode: "GV0002", teacherName: "Mr. Nam", sessions: 12, hours: 18, baseSalary: 6300000, commission: 280000, tax: 658000, net: 5922000 },
    ],
    forecasts: [],
    sepay: mergeSepayLedger(emptySepayLedger()),
  };
}

export function hydrateFinance(value?: DemoFinance | null): DemoFinance {
  const base = defaultFinance();
  if (!value) return base;
  return {
    ...base,
    ...value,
    sepay: mergeSepayLedger(value.sepay),
  };
}

export function rebuildRecon(cashbook: DemoCashEntry[], previous: DemoReconDay[] = []): DemoReconDay[] {
  const byDate = new Map<string, DemoCashEntry[]>();
  for (const row of cashbook) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, rows]) => {
    const tuitionIn = rows.filter((item) => item.source === "TUITION" && item.kind === "IN").reduce((sum, item) => sum + item.amount, 0);
    const manualIn = rows.filter((item) => item.source === "MANUAL" && item.kind === "IN").reduce((sum, item) => sum + item.amount, 0);
    const manualOut = rows.filter((item) => item.kind === "OUT").reduce((sum, item) => sum + item.amount, 0);
    const kept = previous.find((item) => item.date === date);
    const changed = Boolean(kept && (kept.tuitionIn !== tuitionIn || kept.manualIn !== manualIn || kept.manualOut !== manualOut));
    return {
      date,
      tuitionIn,
      manualIn,
      manualOut,
      net: tuitionIn + manualIn - manualOut,
      status: changed ? "PENDING" : kept?.status ?? "PENDING",
      note: changed ? "Phát sinh mới. Cần đối soát lại." : kept?.note ?? "Chưa đối soát.",
    };
  });
}

/**
 * Mỗi phiếu thu chi là một dòng đối soát riêng. Giữ lại dấu đã duyệt khi phiếu không đổi,
 * còn phiếu mới hoặc phiếu bị sửa số tiền/ngày thì quay về Chưa khớp để kế toán duyệt lại.
 */
export function rebuildReconEntries(cashbook: DemoCashEntry[], previous: DemoReconEntry[] = []): DemoReconEntry[] {
  const kept = new Map((previous || []).map((row) => [String(row.entryId), row]));
  return cashbook.map((row) => {
    const amount = Math.round(Number(row.amount) || 0);
    const before = kept.get(row.id);
    const unchanged = Boolean(before && before.amount === amount && before.date === row.date);
    if (before?.status === "MATCHED" && unchanged) {
      return {
        entryId: row.id,
        status: "MATCHED" as const,
        amount,
        date: row.date,
        approvedAt: before.approvedAt,
        approvedBy: before.approvedBy,
      };
    }
    return { entryId: row.id, status: "PENDING" as const, amount, date: row.date };
  });
}

function cashbookDate(value: string | undefined, fallback: string | undefined) {
  const selected = /^\d{4}-\d{2}-\d{2}/.exec(String(value || ""))?.[0]
    || /^\d{4}-\d{2}-\d{2}/.exec(String(fallback || ""))?.[0];
  return selected || new Date().toISOString().slice(0, 10);
}

/**
 * Cashbook là màn hình tổng hợp, còn receipt là chứng từ nguồn của học phí.
 * Đồng bộ bằng receiptId để các khoản đã thu luôn hiện đúng một lần trong Thu chi.
 */
export function syncTuitionCashbook(finance: DemoFinance): DemoFinance {
  const ledger = mergeSepayLedger(finance.sepay);
  const skipped = new Set(finance.cashbookSkippedReceiptIds || []);
  // Biên lai UNRECORDED (ghi nhận đã thu nội bộ, chưa xuất phiếu thu) không sinh
  // dòng sổ quỹ — và dòng đã lỡ sinh trước đó cũng bị gỡ khỏi Thu chi.
  const unrecorded = new Set((ledger.receipts || [])
    .filter((receipt) => receipt.id && receipt.status !== "ISSUED")
    .map((receipt) => receipt.id));
  const cashbook = (finance.cashbook || [])
    .filter((row) => !row.receiptId || !unrecorded.has(row.receiptId))
    .map((row) => ({ ...row }));
  const linkedReceiptIds = new Set(cashbook.map((row) => row.receiptId).filter(Boolean));
  const claimedLegacyIds = new Set<string>();
  const recovered: DemoCashEntry[] = [];
  const paymentById = new Map((ledger.payments || []).map((row) => [row.id, row]));
  const bankTransactionById = new Map((ledger.bankTransactions || []).map((row) => [row.id, row]));
  const receivableById = new Map((ledger.receivables || []).map((row) => [row.id, row]));
  // Phiếu sổ cũ chưa link biên lai — index theo "số tiền|ngày" để mỗi biên lai
  // tra trong O(1) thay vì quét lại toàn bộ sổ quỹ cho từng biên lai.
  const legacyByKey = new Map<string, DemoCashEntry[]>();
  for (const row of cashbook) {
    if (row.receiptId || row.source !== "TUITION") continue;
    const key = `${Number(row.amount)}|${row.date}`;
    const list = legacyByKey.get(key) || [];
    list.push(row);
    legacyByKey.set(key, list);
  }

  for (const receipt of ledger.receipts || []) {
    if (!receipt.id || receipt.status !== "ISSUED" || skipped.has(receipt.id) || linkedReceiptIds.has(receipt.id)) continue;
    const payment = paymentById.get(receipt.paymentId);
    const receivableId = payment?.receivableId || "";
    const receivable = receivableById.get(receivableId);
    const voucherDate = payment?.bankTransactionId
      ? bankTransactionById.get(payment.bankTransactionId)?.transactionDate
      : undefined;
    const receiptDate = cashbookDate(receipt.issuedAt, payment?.paidAt);
    const legacy = (legacyByKey.get(`${Number(receipt.amount)}|${receiptDate}`) || []).find((row) =>
      !row.receiptId
      && !claimedLegacyIds.has(row.id)
      && (!receivableId || row.tuitionId === receivableId),
    );
    if (legacy) {
      legacy.receiptId = receipt.id;
      if (!legacy.voucherDate && voucherDate) legacy.voucherDate = voucherDate;
      claimedLegacyIds.add(legacy.id);
      linkedReceiptIds.add(receipt.id);
      continue;
    }

    const billingPeriod = String(receipt.billingPeriod || receivable?.billingPeriod || "").trim();
    recovered.push({
      id: `cash-receipt-${receipt.id}`,
      date: receiptDate,
      voucherDate,
      kind: "IN",
      source: "TUITION",
      category: "Học phí",
      description: String(receipt.note || "").trim() || `Thu học phí${billingPeriod ? ` ${billingPeriod}` : ""}`,
      amount: Math.max(0, Math.round(Number(receipt.amount) || 0)),
      method: String(receipt.method || payment?.method || "Chuyển khoản"),
      studentName: String(receipt.studentName || receivable?.studentName || "Học viên"),
      tuitionId: receivableId || undefined,
      receiptId: receipt.id,
    });
    linkedReceiptIds.add(receipt.id);
  }

  const nextCashbook = [...recovered, ...cashbook];
  return {
    ...finance,
    sepay: ledger,
    cashbook: nextCashbook,
    recon: rebuildRecon(nextCashbook, finance.recon),
    reconEntries: rebuildReconEntries(nextCashbook, finance.reconEntries),
    cashbookSkippedReceiptIds: [...skipped],
  };
}
