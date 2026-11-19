import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

import type { BlockRepository } from "../cloudflare/storage/block-repository";
import { auditRepository, periodicReportsRepository } from "../cloudflare/storage/audit-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { accountantsRepository, assistantsRepository, teachersRepository } from "../cloudflare/storage/people-repository";
import { readBlock, writeBlock } from "../cloudflare/storage/relational-kv";
import { sessionsRepository } from "../cloudflare/storage/sessions-repository";
import { settingsRepository } from "../cloudflare/storage/settings-repository";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { diffJson } from "./kv-relational-diff";

/**
 * Chuyển các khối JSON trong `vps_app_state` sang bảng quan hệ.
 *
 * Nguyên tắc: **chỉ chép, không tính**. Mọi giá trị đang lưu được chép nguyên vẹn;
 * không tái tính số dư buổi, công nợ hay tiền đã thu từ công thức.
 *
 * Chạy lại nhiều lần cho kết quả y hệt (idempotent) vì tầng repository ghi theo
 * phần thay đổi. Dữ liệu nguồn trong `vps_app_state` không bị script chạm tới.
 *
 *   tsx scripts/migrate-kv-to-relational.ts                  chuyển rồi đối chiếu
 *   tsx scripts/migrate-kv-to-relational.ts --verify         chỉ đối chiếu
 *   tsx scripts/migrate-kv-to-relational.ts --only-if-empty  chỉ nạp nhóm chưa có dữ liệu
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const verifyOnly = process.argv.includes("--verify");
/**
 * Dùng khi khởi động môi trường local: chỉ nạp nhóm nào chưa từng được ghi sang bảng
 * quan hệ. Nhóm đã có dữ liệu thì bỏ qua, vì khối JSON cũ lúc đó đã lạc hậu và nạp đè
 * sẽ xoá mất những gì vừa làm trên tầng mới.
 */
const onlyIfEmpty = process.argv.includes("--only-if-empty");

/** Thứ tự chuyển theo phụ thuộc: cấu hình → nhân sự → học viên → lớp → buổi học → tài chính → nhật ký. */
const groups: { label: string; repository: BlockRepository<never> }[] = [
  { label: "Cấu hình trung tâm", repository: settingsRepository as unknown as BlockRepository<never> },
  { label: "Giáo viên", repository: teachersRepository as unknown as BlockRepository<never> },
  { label: "Kế toán", repository: accountantsRepository as unknown as BlockRepository<never> },
  { label: "Trợ giảng", repository: assistantsRepository as unknown as BlockRepository<never> },
  { label: "Học viên", repository: studentsRepository as unknown as BlockRepository<never> },
  { label: "Lớp học", repository: classesRepository as unknown as BlockRepository<never> },
  { label: "Buổi học và điểm danh", repository: sessionsRepository as unknown as BlockRepository<never> },
  { label: "Tài chính và sổ SePay", repository: financeRepository as unknown as BlockRepository<never> },
  { label: "Nhật ký", repository: auditRepository as unknown as BlockRepository<never> },
  { label: "Báo cáo định kỳ", repository: periodicReportsRepository as unknown as BlockRepository<never> },
];

function stateKey(key: string) {
  return `kv:${encodeURIComponent(key)}`;
}

/**
 * Chuyển nốt những gì còn lại trong `vps_app_state`: danh mục và nội dung syllabus
 * (kho của Durable Object) cùng các cờ đánh dấu bước xử lý dữ liệu chạy một lần.
 * Sau bước này ứng dụng chạy ở chế độ `relational` không còn đọc/ghi bảng đó nữa.
 */
async function migrateSyllabusAndFlags() {
  console.log("\n== Syllabus và cờ xử lý dữ liệu ==");

  const catalogRow = await prisma.vpsAppState.findUnique({ where: { key: "do:catalog:steps-demo:items" } });
  const catalogItems = Array.isArray(catalogRow?.value) ? catalogRow.value as Record<string, unknown>[] : [];
  if (catalogItems.length) {
    const rows = catalogItems.map((item, position) => ({
      id: String(item.id ?? ""),
      position,
      code: String(item.code ?? ""),
      name: String(item.name ?? ""),
      levelId: item.levelId === null || item.levelId === undefined ? null : String(item.levelId),
      level: String(item.level ?? ""),
      description: String(item.description ?? ""),
      status: String(item.status ?? ""),
      totalCourseDays: Math.round(Number(item.totalCourseDays) || 0),
      sortOrder: Math.round(Number(item.sortOrder) || 0),
      createdAt: String(item.createdAt ?? ""),
      updatedAt: String(item.updatedAt ?? ""),
    }));
    for (const row of rows) {
      await prisma.opsSyllabusCatalogItem.upsert({ where: { id: row.id }, create: row, update: row });
    }
    console.log(`  Danh mục syllabus: ${rows.length} mục`);
  } else {
    console.log("  Danh mục syllabus: không có dữ liệu nguồn");
  }

  const documentRows = await prisma.vpsAppState.findMany({
    where: { key: { startsWith: "do:document:" } },
    orderBy: { key: "asc" },
  });
  for (const row of documentRows) {
    const syllabusId = decodeURIComponent(row.key.slice("do:document:".length).replace(/:document$/, ""));
    const document = JSON.parse(JSON.stringify(row.value));
    await prisma.opsSyllabusDocument.upsert({
      where: { syllabusId },
      create: { syllabusId, document },
      update: { document },
    });
    const size = JSON.stringify(row.value).length;
    console.log(`  Nội dung syllabus ${syllabusId}: ${Math.round(size / 1024)} KB`);
  }

  const flagRows = await prisma.vpsAppState.findMany({
    where: { key: { startsWith: "kv:migration" } },
    orderBy: { key: "asc" },
  });
  for (const row of flagRows) {
    const key = decodeURIComponent(row.key.slice("kv:".length));
    const ranAt = String(row.value ?? "");
    await prisma.opsDataMigration.upsert({ where: { key }, create: { key, ranAt }, update: { ranAt } });
  }
  console.log(`  Cờ xử lý dữ liệu: ${flagRows.length} cờ`);
}

async function readSource(key: string) {
  const row = await prisma.vpsAppState.findUnique({ where: { key: stateKey(key) } });
  return row ? (row.value as unknown) : undefined;
}

/** Đếm bản ghi trong khối nguồn để đối chiếu với số dòng đã ghi. */
function countSource(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} phần tử`;
  if (value && typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => Array.isArray(item))
      .map(([name, item]) => `${name}=${(item as unknown[]).length}`);
    return parts.length ? parts.join(", ") : "1 đối tượng";
  }
  return "không có dữ liệu";
}

async function migrateGroup(label: string, repository: BlockRepository<never>) {
  const source = await readSource(repository.key);
  if (source === undefined) {
    console.log(`\n== ${label} (${repository.key}) ==\n  Khối nguồn không tồn tại — bỏ qua, không tạo bảng rỗng giả.`);
    return;
  }
  if (onlyIfEmpty) {
    const existing = await prisma.opsStorageBlock.findUnique({ where: { key: repository.key }, select: { key: true } });
    if (existing) {
      console.log(`\n== ${label} (${repository.key}) ==\n  Đã có dữ liệu trong bảng quan hệ — giữ nguyên, không nạp đè.`);
      return;
    }
  }
  console.log(`\n== ${label} (${repository.key}) ==`);
  console.log(`  Nguồn: ${countSource(source)}`);
  const started = Date.now();
  await writeBlock(prisma, repository, source as never);
  console.log(`  Đã ghi trong ${Date.now() - started}ms`);
}

async function verifyGroup(label: string, repository: BlockRepository<never>) {
  const source = await readSource(repository.key);
  if (source === undefined) return { label, skipped: true, differences: 0 };
  const rebuilt = await readBlock(prisma, repository);
  const differences = diffJson(source, rebuilt);
  if (differences.length === 0) {
    console.log(`  ${label}: khớp tuyệt đối`);
  } else {
    console.log(`  ${label}: ${differences.length} khác biệt`);
    for (const difference of differences.slice(0, 20)) {
      console.log(`    ${difference.path}\n      gốc:     ${difference.left}\n      dựng lại: ${difference.right}`);
    }
  }
  return { label, skipped: false, differences: differences.length };
}

async function reportRowCounts() {
  const [
    students, balances, credits, paidThrough, classes, classStudents, schedules, materialFees,
    sessions, attendanceColumns, columnOrder, attendance, scores,
    teachers, accountants, assistants, branches, classTypes, packages, periods, rooms,
    debts, cashEntries, reconDays, reconEntries, payroll, forecasts, skipped,
    receivables, orders, bankTransactions, payments, receipts, invoices, sepayCredits, webhookLogs,
    auditLogs, periodicReports,
  ] = await Promise.all([
    prisma.opsStudent.count(), prisma.opsStudentSessionBalance.count(), prisma.opsStudentTuitionCredit.count(), prisma.opsStudentTuitionPaidThrough.count(),
    prisma.opsClass.count(), prisma.opsClassStudent.count(), prisma.opsClassSchedule.count(), prisma.opsClassMaterialFee.count(),
    prisma.opsLessonSession.count(), prisma.opsSessionAssessmentColumn.count(), prisma.opsSessionAttendanceColumn.count(), prisma.opsAttendance.count(), prisma.opsAttendanceScore.count(),
    prisma.opsTeacher.count(), prisma.opsAccountant.count(), prisma.opsAssistant.count(), prisma.opsBranch.count(), prisma.opsClassType.count(), prisma.opsTuitionPackage.count(), prisma.opsLessonPeriod.count(), prisma.opsRoom.count(),
    prisma.opsTuitionDebt.count(), prisma.opsCashEntry.count(), prisma.opsReconDay.count(), prisma.opsReconEntry.count(), prisma.opsPayrollRow.count(), prisma.opsFinanceForecast.count(), prisma.opsCashbookSkippedReceipt.count(),
    prisma.opsSepayReceivable.count(), prisma.opsSepayPaymentOrder.count(), prisma.opsSepayBankTransaction.count(), prisma.opsSepayPayment.count(), prisma.opsSepayReceipt.count(), prisma.opsSepayInvoice.count(), prisma.opsSepayCredit.count(), prisma.opsSepayWebhookLog.count(),
    prisma.opsAuditLog.count(), prisma.opsPeriodicReport.count(),
  ]);

  console.log("\n== Số dòng trong bảng quan hệ ==");
  const table = [
    ["Học viên", students], ["Số dư buổi", balances], ["Tín dụng buổi", credits], ["Tháng đã đóng", paidThrough],
    ["Lớp học", classes], ["Ghi danh", classStudents], ["Lịch học", schedules], ["Phí học liệu", materialFees],
    ["Buổi học", sessions], ["Cột đánh giá", attendanceColumns], ["Thứ tự cột", columnOrder], ["Điểm danh", attendance], ["Điểm theo cột", scores],
    ["Giáo viên", teachers], ["Kế toán", accountants], ["Trợ giảng", assistants],
    ["Chi nhánh", branches], ["Loại lớp", classTypes], ["Gói học phí", packages], ["Ca học", periods], ["Phòng học", rooms],
    ["Công nợ", debts], ["Phiếu thu chi", cashEntries], ["Đối soát ngày", reconDays], ["Dòng đối soát", reconEntries],
    ["Bảng lương", payroll], ["Dự thu dự chi", forecasts], ["Biên lai đã bỏ khỏi sổ", skipped],
    ["Khoản phải thu", receivables], ["Lệnh thu", orders], ["Giao dịch ngân hàng", bankTransactions],
    ["Thanh toán", payments], ["Biên lai", receipts], ["Hóa đơn điện tử", invoices], ["Tín dụng SePay", sepayCredits], ["Webhook log", webhookLogs],
    ["Nhật ký", auditLogs], ["Báo cáo định kỳ", periodicReports],
  ] as const;
  for (const [name, count] of table) console.log(`  ${name.padEnd(26, " ")} ${count}`);
}

/** Đã chuyển syllabus sang bảng riêng hay chưa — dùng cho chế độ nạp-nếu-trống. */
async function syllabusAlreadyMoved() {
  const [catalog, documents] = await Promise.all([
    prisma.opsSyllabusCatalogItem.count(),
    prisma.opsSyllabusDocument.count(),
  ]);
  return catalog > 0 || documents > 0;
}

async function main() {
  if (!verifyOnly) {
    for (const group of groups) await migrateGroup(group.label, group.repository);
    if (onlyIfEmpty && await syllabusAlreadyMoved()) {
      console.log("\n== Syllabus và cờ xử lý dữ liệu ==\n  Đã có dữ liệu — giữ nguyên, không nạp đè.");
    } else {
      await migrateSyllabusAndFlags();
    }
  }

  // Ở chế độ nạp-nếu-trống, các nhóm đã dùng từ trước sẽ khác khối JSON cũ là chuyện
  // bình thường, nên không đối chiếu để khỏi báo động giả lúc khởi động.
  if (onlyIfEmpty) {
    await reportRowCounts();
    return;
  }

  console.log("\n== Đối chiếu khối JSON gốc với bản dựng lại từ bảng quan hệ ==");
  const results = [];
  for (const group of groups) results.push(await verifyGroup(group.label, group.repository));

  await reportRowCounts();

  const failed = results.filter((result) => result.differences > 0);
  if (failed.length) {
    console.log(`\nKẾT QUẢ: ${failed.length}/${results.length} nhóm còn khác biệt — ${failed.map((item) => item.label).join(", ")}`);
    console.log(
      "Lưu ý: sau khi ứng dụng đã chạy ở chế độ relational, các khối JSON trong vps_app_state\n"
      + "đứng yên còn bảng quan hệ tiếp tục thay đổi, nên khác biệt ở đây là bình thường.\n"
      + "Phép đối chiếu này chỉ có ý nghĩa ngay sau khi vừa chuyển dữ liệu.",
    );
  } else {
    console.log(`\nKẾT QUẢ: toàn bộ ${results.filter((item) => !item.skipped).length} nhóm khớp tuyệt đối.`);
  }
  process.exitCode = failed.length ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
