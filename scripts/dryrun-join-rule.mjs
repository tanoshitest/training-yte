// Dry-run: chạy syncTuitionReceivables + tuitionCollectionCharge code MỚI
// trên dữ liệu production thật, so sánh với phiếu đang có — không ghi gì.
import { syncTuitionReceivables, tuitionCollectionCharge, classBillingMode } from "../cloudflare/tuition-billing.ts";
import { emptySepayLedger } from "../cloudflare/sepay-engine.ts";

const BASE = process.env.STEPS_PROD_URL || "http://sqwjepnuzk3jz7x4xmap9hcn.149.28.131.241.sslip.io";

async function main() {
  const email = process.env.STEPS_PROD_EMAIL;
  const password = process.env.STEPS_PROD_PASSWORD;
  const login = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] || "";
  if (!login.ok || !cookie) throw new Error(`LOGIN_FAILED ${login.status}`);

  const data = await (await fetch(`${BASE}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  const finance = ((await (await fetch(`${BASE}/api/finance`, { headers: { Cookie: cookie } })).json()).finance) || {};
  const ledger = finance.sepay || emptySepayLedger();
  const classes = data.classes || [];
  const students = data.students || [];
  const sessions = data.lessonSessions || [];

  // 1. Ai đã có classJoinedAt trên prod?
  const withJoin = students.filter((s) => Object.keys(s.classJoinedAt || {}).length);
  console.log(`Học viên có classJoinedAt: ${withJoin.length}`);
  for (const s of withJoin.slice(0, 20)) console.log(`  ${s.code} ${s.fullName}`, s.classJoinedAt);

  // 2. Chạy sync mới → so với receivables hiện tại.
  const synced = syncTuitionReceivables(ledger, classes, students, sessions);
  const before = new Map((ledger.receivables || []).map((r) => [r.id, r]));
  const after = new Map((synced.receivables || []).map((r) => [r.id, r]));
  const changed = [];
  for (const [id, row] of after) {
    const old = before.get(id);
    if (!old) { changed.push({ kind: "CREATED", id, studentId: row.studentId, billKey: row.billKey, amountDue: row.amountDue }); continue; }
    const diffs = {};
    for (const k of ["status", "amountDue", "balanceDue", "billKey", "billingPeriod"]) {
      if (JSON.stringify(old[k]) !== JSON.stringify(row[k])) diffs[k] = [old[k], row[k]];
    }
    if (Object.keys(diffs).length) changed.push({ kind: "CHANGED", id, studentId: row.studentId, billKey: row.billKey, diffs });
  }
  console.log(`\nReceivables: trước ${before.size} → sau ${after.size}; khác biệt ${changed.length}`);
  for (const c of changed.slice(0, 40)) console.log(" ", JSON.stringify(c));

  // 3. Payment orders bị hủy/tạo mới
  const ordersBefore = new Map((ledger.paymentOrders || []).map((o) => [o.id, o.status]));
  const orderDiffs = (synced.paymentOrders || []).filter((o) => ordersBefore.get(o.id) !== o.status)
    .map((o) => ({ id: o.id, status: [ordersBefore.get(o.id), o.status] }));
  const newOrders = (synced.paymentOrders || []).filter((o) => !ordersBefore.has(o.id)).length;
  console.log(`\nPaymentOrders: status đổi ${orderDiffs.length}, tạo mới ${newOrders}`);
  for (const d of orderDiffs.slice(0, 20)) console.log(" ", JSON.stringify(d));

  // 4. Sanity: với lớp MONTHLY, charge hiện tại của từng học viên (phát hiện deferred/carryIn)
  const byStudent = new Map(students.map((s) => [s.id, s]));
  const anomalies = [];
  for (const cls of classes) {
    if (classBillingMode(cls) !== "MONTHLY" || cls.billingEnabled === false) continue;
    for (const sid of cls.studentIds || []) {
      const st = byStudent.get(sid);
      if (!st || st.tuitionExempt) continue;
      const charge = tuitionCollectionCharge(st, cls, sessions, ledger);
      if (charge.carryInSessions || (charge.months?.length && charge.amount === 0)) {
        anomalies.push({ student: `${st.code} ${st.fullName}`, cls: cls.code, months: charge.months, billed: charge.billed, carryIn: charge.carryInSessions, amount: charge.amount });
      }
    }
  }
  console.log(`\nHọc viên monthly bị ảnh hưởng rule vào lớp: ${anomalies.length}`);
  for (const a of anomalies) console.log(" ", JSON.stringify(a));
}

main().catch((e) => { console.error(e); process.exit(1); });
