import {
  chargedSessionsSinceSeptember,
  classBillingMode,
  classSessionPrice,
  classTuitionCharge,
  paidSessionsSinceSeptember,
  sessionChargesTuition,
} from "../cloudflare/tuition-billing";
import { emptySepayLedger } from "../cloudflare/sepay-engine";

const BASE = process.env.STEPS_PROD_URL || "http://sqwjepnuzk3jz7x4xmap9hcn.149.28.131.241.sslip.io";
const CODE = (process.argv[2] || "S1").toUpperCase().replace(/\s+/g, "");
const MONTH = process.argv[3] || "2026-09";

async function main() {
  const email = process.env.STEPS_PROD_EMAIL;
  const password = process.env.STEPS_PROD_PASSWORD;
  if (!email || !password) throw new Error("Thiếu STEPS_PROD_EMAIL / STEPS_PROD_PASSWORD.");
  const login = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] || "";
  if (!login.ok || !cookie) throw new Error(`LOGIN_FAILED ${login.status}`);

  const data = await (await fetch(`${BASE}/api/bootstrap`, { headers: { Cookie: cookie } })).json() as any;
  const finance = ((await (await fetch(`${BASE}/api/finance`, { headers: { Cookie: cookie } })).json()) as any).finance || {};
  const ledger = finance.sepay || emptySepayLedger();

  const cls = (data.classes || []).find((row: any) => String(row.code || "").toUpperCase().replace(/\s+/g, "") === CODE);
  if (!cls) throw new Error(`Không tìm thấy lớp mã ${CODE}.`);
  const allSessions = data.lessonSessions || [];
  const classSessions = allSessions
    .filter((row: any) => row.classId === cls.id)
    .sort((a: any, b: any) => `${a.date}|${a.startTime}`.localeCompare(`${b.date}|${b.startTime}`));

  const charged = classSessions.filter((row: any) => sessionChargesTuition(row));
  const receipts = (ledger.receipts || []).filter((row: any) => row.classId === cls.id);
  const students = (cls.studentIds || [])
    .map((id: string) => (data.students || []).find((row: any) => row.id === id))
    .filter(Boolean);

  console.log(JSON.stringify({
    cls: {
      code: cls.code,
      name: cls.name,
      billingModeRaw: cls.billingMode ?? null,
      billingModeHieuLuc: classBillingMode(cls),
      sessionPrice: classSessionPrice(cls),
      courseSessions: cls.courseSessions ?? null,
      studentCount: students.length,
    },
    buoiDaTinhPhi: {
      tong: charged.length,
      danhSach: charged.map((row: any) => ({
        date: row.date,
        status: row.status,
        isOff: Boolean(row.isOff),
        offSource: row.offSource || "",
        soHocVienDiemDanh: (row.attendance || []).length,
      })),
    },
    thangHienTai: {
      key: MONTH,
      buoiTinhPhiTrongThang: classTuitionCharge(cls, allSessions, MONTH).billed,
      soTien: classTuitionCharge(cls, allSessions, MONTH).amount,
    },
    bienLaiCuaLop: receipts.map((row: any) => ({
      studentId: row.studentId,
      amount: row.amount,
      billingPeriod: row.billingPeriod,
      billingMode: row.billingMode,
      issuedAt: row.issuedAt,
    })),
    hocVien: students.map((row: any) => ({
      code: row.code,
      name: row.fullName,
      soDuHienThi: Math.round(Number(row.sessionBalances?.[cls.id]) || 0),
      daDongQuyRaBuoi: paidSessionsSinceSeptember(row, cls, allSessions, ledger),
      daTinhPhiTu0109: chargedSessionsSinceSeptember(row.id, cls, allSessions),
      tinhLaiSePhaiLa: paidSessionsSinceSeptember(row, cls, allSessions, ledger) - chargedSessionsSinceSeptember(row.id, cls, allSessions),
      tuitionPaidThrough: row.tuitionPaidThrough?.[cls.id] || null,
      credits: row.tuitionCredits?.[cls.id] || 0,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
