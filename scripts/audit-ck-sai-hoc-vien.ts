/**
 * CHỈ ĐỌC — không ghi gì. Rà mọi khoản thu từ chuyển khoản (sao kê / SePay): nội dung CK
 * có mã chỉ ra học viên nào (HP{lớp}{HV}, HV…, hoặc mã phiếu HPxxxxxx) mà tiền lại ghi cho
 * học viên KHÁC → in ra để xử lý. Cũng báo các dòng có nhiều mã trỏ về nhiều học viên khác
 * nhau (thường do file "Tải kết quả" chèn thêm mã rồi tải lại).
 * FROM=2026-10-01 (mặc định: tất cả) để giới hạn theo ngày ghi nhận.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { studentsRepository } from "../cloudflare/storage/students-repository";
import { classesRepository } from "../cloudflare/storage/classes-repository";
import { financeRepository } from "../cloudflare/storage/finance-repository";
import { mergeSepayLedger } from "../cloudflare/sepay-engine";

const FROM = process.env.FROM || "";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const vnd = (n: unknown) => `${Math.round(Number(n) || 0).toLocaleString("vi-VN")}đ`;
const vnTime = (iso: string) => { const d = new Date(new Date(iso).getTime() + 7 * 3600_000); return isNaN(d.getTime()) ? String(iso) : d.toISOString().slice(0, 16).replace("T", " "); };

(async () => {
  const students: any[] = await (studentsRepository as any).read(prisma);
  const classes: any[] = await (classesRepository as any).read(prisma);
  const finance: any = await (financeRepository as any).read(prisma);
  const ledger: any = mergeSepayLedger(finance.sepay);
  const byCode = new Map(students.map((s) => [String(s.code || "").toUpperCase(), s]));
  const byId = new Map(students.map((s) => [s.id, s]));
  const orderByCode = new Map<string, any>();
  for (const o of ledger.paymentOrders) if (!orderByCode.has(String(o.paymentCode).toUpperCase())) orderByCode.set(String(o.paymentCode).toUpperCase(), o);
  const recvById = new Map(ledger.receivables.map((r: any) => [r.id, r]));
  const txById = new Map(ledger.bankTransactions.map((t: any) => [t.id, t]));
  const clsCode = (id: string) => classes.find((c) => c.id === id)?.code || "-";

  /** Mọi học viên mà nội dung CK "chỉ đích danh": theo thứ tự xuất hiện. */
  const namedStudents = (content: string) => {
    const up = String(content || "").toUpperCase();
    const out: { token: string; studentId: string; how: string }[] = [];
    for (const m of up.matchAll(/HP[A-Z0-9]{6,12}/g)) {
      const token = m[0];
      const friendly = /^HP([A-Z0-9]+?)(HV\d{3,5})/.exec(token);
      if (friendly && byCode.has(friendly[2])) { out.push({ token: `HP${friendly[1]}${friendly[2]}`, studentId: byCode.get(friendly[2]).id, how: "mã HP+HV" }); continue; }
      for (let len = Math.min(token.length, 12); len >= 8; len -= 1) {
        const order = orderByCode.get(token.slice(0, len));
        if (order) { const r: any = recvById.get(order.receivableId); out.push({ token: token.slice(0, len), studentId: r?.studentId || order.studentId, how: "mã phiếu" }); break; }
      }
    }
    for (const m of up.matchAll(/HV\d{3,5}/g)) {
      const s = byCode.get(m[0]);
      if (s && !out.some((x) => x.studentId === s.id)) out.push({ token: m[0], studentId: s.id, how: "mã HV" });
    }
    return out;
  };

  const wrong: string[] = [];
  const multi: string[] = [];
  let checked = 0;
  for (const p of ledger.payments) {
    const tx: any = txById.get(p.bankTransactionId);
    if (!tx) continue; // thu tay, không có nội dung CK
    if (FROM && String(p.paidAt) < FROM) continue;
    checked += 1;
    const named = namedStudents(tx.content);
    const r: any = recvById.get(p.receivableId);
    const payee = byId.get(p.studentId);
    const receipt = ledger.receipts.find((x: any) => x.paymentId === p.id);
    const voided = p.status === "VOIDED" || p.status === "REFUNDED";
    const line = `${vnTime(tx.transactionDate || p.paidAt)} | ${vnd(p.allocatedAmount)} | ghi cho ${payee?.code} ${payee?.fullName} (${clsCode(r?.classId)}, ${r?.billingPeriod || "-"})${receipt ? ` | BL ${receipt.receiptNumber}${receipt.status === "ISSUED" ? " (đã vào sổ)" : ""}` : ""}${voided ? " | ĐÃ XOÁ" : ""}\n      CK: ${String(tx.content).slice(0, 160)}\n      Nội dung chỉ: ${named.map((n) => { const s = byId.get(n.studentId); return `${n.token} → ${s?.code} ${s?.fullName} [${n.how}]`; }).join(" ; ")}`;
    const ids = [...new Set(named.map((n) => n.studentId))];
    if (named.length && !ids.includes(p.studentId)) wrong.push(line);
    else if (ids.length > 1) multi.push(line);
  }
  console.log(`Đã rà ${checked} khoản thu từ chuyển khoản${FROM ? ` từ ${FROM}` : ""}.`);
  console.log(`\n### GHI SAI HỌC VIÊN (mã trong nội dung không phải của người được ghi): ${wrong.length}`);
  wrong.forEach((l, i) => console.log(`${i + 1}. ${l}`));
  console.log(`\n### NỘI DUNG CÓ MÃ CỦA NHIỀU HỌC VIÊN (cần xem lại): ${multi.length}`);
  multi.forEach((l, i) => console.log(`${i + 1}. ${l}`));

  // Rủi ro dữ liệu có thể làm khớp nhầm người ở các lần sau.
  console.log("\n### RỦI RO DỮ LIỆU");
  const group = (rows: any[], key: (x: any) => string) => { const m = new Map<string, any[]>(); for (const x of rows) { const k = key(x); if (k) m.set(k, [...(m.get(k) || []), x]); } return [...m].filter(([, v]) => v.length > 1); };
  for (const [k, v] of group(students, (s) => String(s.code || "").toUpperCase())) console.log(`Mã HV trùng ${k}: ${v.map((s) => `${s.fullName} (${s.status || ""})`).join(" | ")}`);
  for (const [k, v] of group(classes, (c) => String(c.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))) console.log(`Mã lớp trùng ${k}: ${v.map((c) => c.name).join(" | ")}`);
  for (const o of ledger.paymentOrders) {
    if (o.status !== "ACTIVE") continue;
    const m = /^HP([A-Z0-9]+?)(HV\d{3,5})$/.exec(String(o.paymentCode).toUpperCase());
    if (!m) continue;
    const r: any = recvById.get(o.receivableId);
    const owner = byId.get(r?.studentId || o.studentId);
    if (!owner) console.log(`Mã phiếu ${o.paymentCode} còn mở nhưng học viên ${r?.studentName || ""} không còn trên hệ thống (nợ ${vnd(r?.balanceDue)})`);
    else if (String(owner.code || "").toUpperCase() !== m[2]) console.log(`Mã phiếu ${o.paymentCode} đang thuộc ${owner.code} ${owner.fullName} (không phải ${m[2]})`);
  }
  console.log("(hết)");
  await prisma.$disconnect();
})().catch(async (e) => { console.error("LỖI:", e.message); await prisma.$disconnect(); process.exit(1); });
