/**
 * Dựng tham số `loai_hoc_phi` cho hai mẫu ZBS học phí: cho phụ huynh biết khoản này thu
 * theo tháng hay theo buổi (theo khóa) và khoảng ngày nó bao phủ.
 *
 * Nguồn sự thật là `billKey` của khoản phải thu (cùng khoá `tuition-billing.ts` dùng để
 * lập phiếu), không suy từ chuỗi `billingPeriod` hiển thị.
 * - `month|<lớp>|YYYY-MM` / `months|<lớp>|YYYY-MM,YYYY-MM`: thu theo tháng, khoảng từ
 *   ngày 1 của tháng đầu đến ngày cuối của tháng cuối.
 * - `course|<lớp>[|k]`: thu theo buổi (khóa k), khoảng từ buổi đầu đến buổi cuối của khóa.
 */
import type { DemoClass, DemoLessonSession } from "./operations-types";
import type { SepayReceipt, SepayReceivable } from "./sepay-engine";
import { classBillingMode, classCourseSessionsForCourse, courseIndexOfBillKey } from "./tuition-billing";

type Mode = "MONTHLY" | "COURSE";
type Range = { from: string; to: string };

function modeOf(receivable: SepayReceivable | undefined, receipt: SepayReceipt | undefined, cls: DemoClass | undefined): Mode {
  const head = String(receivable?.billKey || "").split("|")[0];
  if (head === "month" || head === "months") return "MONTHLY";
  if (head === "course") return "COURSE";
  return receipt?.billingMode || classBillingMode(cls);
}

function monthsOf(receivable: SepayReceivable | undefined, receipt: SepayReceipt | undefined): string[] {
  const parts = String(receivable?.billKey || "").split("|");
  const fromKey = parts[0] === "month" || parts[0] === "months" ? (parts[2] || "").split(",") : [];
  const fromText = [...String(receipt?.billingPeriod || receivable?.billingPeriod || "").matchAll(/Tháng\s+(0[1-9]|1[0-2])\/(\d{4})/g)]
    .map((match) => `${match[2]}-${match[1]}`);
  return (fromKey.length ? fromKey : fromText).filter((key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key)).sort();
}

function monthRange(months: string[]): Range | null {
  if (!months.length) return null;
  const first = months[0];
  const last = months[months.length - 1];
  const [year, month] = last.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${first}-01`, to: `${last}-${String(lastDay).padStart(2, "0")}` };
}

function courseRange(receivable: SepayReceivable | undefined, cls: DemoClass | undefined, sessions: DemoLessonSession[]): Range | null {
  if (!cls) return null;
  const dates = classCourseSessionsForCourse(cls, sessions, courseIndexOfBillKey(receivable?.billKey)).map((row) => row.date).sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

/** `2026-09-01` → `01/09/26` (năm 2 chữ số để nhãn luôn nằm trong 30 ký tự của tham số ZBS). */
function shortDate(key: string) {
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

/** Luôn ghi đủ hai đầu: `Theo tháng dd/MM/yy-dd/MM/yy` là 28 ký tự, không phụ thuộc cùng/khác năm. */
function formatRange({ from, to }: Range) {
  return `${shortDate(from)}-${shortDate(to)}`;
}

export function tuitionKindLabel(input: {
  receivable?: SepayReceivable;
  receipt?: SepayReceipt;
  cls?: DemoClass;
  sessions: DemoLessonSession[];
}): string {
  const mode = modeOf(input.receivable, input.receipt, input.cls);
  const range = mode === "MONTHLY"
    ? monthRange(monthsOf(input.receivable, input.receipt))
    : courseRange(input.receivable, input.cls, input.sessions);
  const kind = mode === "MONTHLY" ? "Theo tháng" : "Theo khóa";
  return range ? `${kind} ${formatRange(range)}` : kind;
}
