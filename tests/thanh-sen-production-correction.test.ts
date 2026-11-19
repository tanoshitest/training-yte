import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger, type SepayReceivable } from "../cloudflare/sepay-engine";
import {
  S1_CLASS_ID,
  thanhSenPreviousMonthDebtAmount,
} from "../cloudflare/thanh-sen-production-correction";
import { syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";

const NOW = new Date("2026-10-07T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

function monthlyClass(id: string, code: string, name: string, price: number, weekdays: number[]): DemoClass {
  return {
    id, code, name,
    classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
    syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
    billingMode: "MONTHLY", sessionPrice: price,
    schedules: weekdays.map((weekday, index) => ({
      weekday, periodId: `d${weekday}`, startTime: "17:00", endTime: "19:00",
    })),
    note: "", billingEnabled: false,
  };
}

const S1 = monthlyClass(S1_CLASS_ID, "S1", "S1-9.1-2012", 65_000, [2, 6]);      // T3+T7 → 9 buổi T10
const S3 = monthlyClass("class-import-s3", "S3", "s3- 8.1- 2013", 75_000, [4, 6]); // T5+T7 → 10 buổi
const S4 = monthlyClass("class-import-s4", "S4", "S4-7.1-2014", 65_000, [4, 6]);   // 10 buổi
const S5 = monthlyClass("class-import-s5", "S5", "S5- 7.2-2014", 65_000, [0, 3]);  // CN+T4 → 8 buổi
const S8 = monthlyClass("class-import-s8", "S8", "S8-6.2-2015", 65_000, [1, 6]);   // T2+T7 → 9 buổi
const S31 = monthlyClass("class-import-s31", "S31", "S31- Steps - Ket 2014", 80_000, [1, 6]); // 9 buổi
const S38 = monthlyClass("class-import-s38", "S38", "S38-5.4", 65_000, [3, 6]);    // T4+T7 → 9 buổi

function openReceivable(studentId: string, classId: string, months: string, amount: number): SepayReceivable {
  const keys = months.split(",");
  return {
    id: `recv-${studentId}-${months}`,
    receivableCode: "PT-TEST",
    studentId,
    studentName: "",
    billingPeriod: `Tháng ${months}`,
    issueDate: "2026-09-01",
    dueDate: "2026-09-10",
    amountDue: amount,
    amountPaid: 0,
    balanceDue: amount,
    currency: "VND",
    status: "OPEN",
    paymentOrderId: `order-${studentId}-${months}`,
    classId,
    billKey: `${keys.length > 1 ? "months" : "month"}|${classId}|${months}`,
  };
}

test("Thành Sen: nợ cũ gắn đúng phiếu tháng 10 theo Excel", () => {
  const cases: Array<[DemoClass, string, string, string, number, number]> = [
    // [lớp, id, tên, mã HV, nợ cũ, tổng phiếu T10]
    [S1, "khanh-ngoc", "Khánh Ngọc", "HV0009", 915_000, 1_500_000],
    [S1, "phuong-nhi", "Phương Nhi", "HV0010", 455_000, 1_040_000],
    [S1, "tuong-vy", "Tường Vy", "HV0016", 915_000, 1_500_000],
    [S3, "bao-an", "Bảo An", "HV0035", 600_000, 1_350_000],
    // Bảo Trâm vào lớp sau ngày snapshot nên vá theo tên, mã HV chưa chốt.
    [S3, "bao-tram", "Bảo Trâm", "HV9999", 75_000, 825_000],
    [S4, "thai-bao", "Thái Bảo", "HV0042", 455_000, 1_105_000],
    [S5, "linh-nhi", "Linh Nhi", "HV0061", 5_000, 525_000],
    [S8, "tran-gia-bao", "Trần Gia Bảo", "HV0100", 455_000, 1_040_000],
    [S8, "thao-nguyen", "Phan Thị Thảo Nguyên", "HV0101", 1_495_000, 2_080_000],
    [S31, "bao-huan", "Bảo Huân", "HV0409", 240_000, 960_000],
    [S38, "minh-thu", "Minh Thư", "HV0479", 1_159_000, 1_744_000],
  ];
  for (const [cls, id, name, code, debt, total] of cases) {
    const q = tuitionCollectionCharge(student(id, name, code), cls, [], emptySepayLedger(), NOW);
    assert.deepEqual(q.months, ["2026-10"], `${cls.code} ${name}`);
    assert.equal(q.oldDebtAmount, debt, `${cls.code} ${name}`);
    assert.equal(q.amount, total, `${cls.code} ${name}`);
  }
});

test("Thành Sen: Trà My (S4) đóng dư 25k — nợ cũ âm, phiếu T10 còn 625k", () => {
  const q = tuitionCollectionCharge(student("tra-my", "Trà My", "HV0056"), S4, [], emptySepayLedger(), NOW);
  assert.equal(q.oldDebtAmount, -25_000);
  assert.equal(q.amount, 625_000);
});

test("Thành Sen: nợ không rò sang tháng 11, lớp khác, hoặc bạn không nợ", () => {
  assert.equal(thanhSenPreviousMonthDebtAmount(student("kn", "Khánh Ngọc", "HV0009"), S1, ["2026-11"]), 0);
  assert.equal(thanhSenPreviousMonthDebtAmount(student("kn", "Khánh Ngọc", "HV0009"), S3, ["2026-10"]), 0);
  // Cùng tên nhưng lớp khác không dính vá S3 — vá chỉ áp trong class-import-s3.
  assert.equal(thanhSenPreviousMonthDebtAmount(student("bt4", "Bảo Trâm", "HV0048"), S4, ["2026-10"]), 0);
  const q = tuitionCollectionCharge(student("khanh-an", "Khánh An", "HV0001"), S1, [], emptySepayLedger(), NOW);
  assert.equal(q.oldDebtAmount, 0);
  assert.equal(q.amount, 585_000);
  // Minh Khang (S8) nghỉ học — bỏ qua, không gắn nợ.
  const mk = tuitionCollectionCharge(student("minh-khang", "Minh Khang", "HV0115"), S8, [], emptySepayLedger(), NOW);
  assert.equal(mk.oldDebtAmount, 0);
  assert.equal(mk.amount, 585_000);
});

test("Thành Sen: phiếu sót tháng trước không gộp lại vào báo giá — sync hủy phiếu sót", () => {
  const cls = { ...S5, billingEnabled: true, studentIds: ["gia-bao", "truc-linh"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("gia-bao", S5.id, "2026-09", 520_000),
      openReceivable("gia-bao", S5.id, "2026-10", 520_000),
      openReceivable("truc-linh", S5.id, "2026-10", 520_000),
    ],
    paymentOrders: [],
  };
  const students = [
    student("gia-bao", "Gia Bảo", "HV0057"),
    student("truc-linh", "Trúc Linh", "HV0058"),
  ];
  const synced = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byId = new Map(synced.receivables.map((row: any) => [row.id, row]));
  assert.equal((byId.get("recv-gia-bao-2026-09") as any)?.status, "CANCELLED");
  assert.equal((byId.get("recv-gia-bao-2026-10") as any)?.status, "OPEN");
  assert.equal((byId.get("recv-gia-bao-2026-10") as any)?.amountDue, 1_040_000);
  assert.equal((byId.get("recv-truc-linh-2026-10") as any)?.amountDue, 520_000);
});

test("Thành Sen: Tuấn Dũng (S1) T9 đã xong theo Excel — báo giá chỉ còn tháng 10", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [openReceivable("tuan-dung", S1.id, "2026-09,2026-10", 1_100_000)],
    paymentOrders: [],
  };
  const q = tuitionCollectionCharge(student("tuan-dung", "Tuấn Dũng", "HV0020"), S1, [], ledger as any, NOW);
  assert.deepEqual(q.months, ["2026-10"]);
  assert.equal(q.oldDebtAmount, 0);
  assert.equal(q.amount, 585_000);
});

test("Thành Sen: lớp không có nợ vẫn giữ học phí gốc (S31 720k, S8 9 buổi 585k)", () => {
  const baoNgo = tuitionCollectionCharge(student("bao-ngoc", "Bảo Ngọc", "HV0410"), S31, [], emptySepayLedger(), NOW);
  assert.equal(baoNgo.amount, 720_000);
  assert.equal(baoNgo.oldDebtAmount, 0);
  const haLe = tuitionCollectionCharge(student("ha-le", "Hà Lê", "HV0947"), S8, [], emptySepayLedger(), NOW);
  assert.equal(haLe.amount, 585_000);
});
