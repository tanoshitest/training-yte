import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import { T15_CLASS_ID, t15PreviousMonthDebtAmount } from "../cloudflare/t15-production-correction";
import { monthlyRemainingSessions, syncTuitionReceivables, tuitionCollectionCharge } from "../cloudflare/tuition-billing";
import type { SepayReceivable } from "../cloudflare/sepay-engine";

const NOW = new Date("2026-10-05T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return { id, code: code || id.toUpperCase(), fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING" };
}

/** T15 thật: T6 16:30 + CN 07:00, 60k/buổi → tháng 10 có đúng 9 suất. */
const T15 = ((): DemoClass => ({
  id: T15_CLASS_ID, code: "T15", name: "T15-2018-3.1",
  classTypeId: "standard", branchId: "branch", teacherId: "teacher", roomId: "",
  syllabusId: "", status: "ACTIVE", studentIds: [], tuitionPackageId: "",
  billingMode: "MONTHLY", sessionPrice: 60_000,
  schedules: [
    { weekday: 5, periodId: "fri", startTime: "16:30", endTime: "18:30" },
    { weekday: 0, periodId: "sun", startTime: "07:00", endTime: "09:00" },
  ],
  note: "", billingEnabled: false,
}))();

test("T15 tháng 10: 9 suất × 60k = 540k cho mọi học viên — không khấu trừ", () => {
  const quote = tuitionCollectionCharge(student("quynh-huong", "Quỳnh Hương", "HV0775"), T15, [], emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.items[0]?.originalBilled, 9);
  assert.equal(quote.creditSessions, 0);
  assert.equal(quote.items[0]?.billed, 9);
  assert.equal(quote.amount, 540_000);
});

test("T15 nợ cũ tháng 10: Gia Khang, Minh Vy, Bảo Long +480k mỗi bạn (Đăng Khoa chỉ 540k)", () => {
  for (const [id, name, code] of [
    ["gia-khang", "Trương Gia Khang", "HV0779"],
    ["minh-vy", "Minh Vy", "HV0781"],
    ["bao-long", "Bảo Long", "HV0788"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T15, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 1_020_000, name);
  }
  // 13 bạn còn lại chỉ thu 540k.
  for (const [id, name, code] of [
    ["quynh-huong", "Quỳnh Hương", "HV0775"],
    ["yen-nhi", "Nguyễn Phan Yến Nhi", "HV0774"],
    ["minh-phuc", "Nguyễn Minh Phúc", "HV0778"],
    ["dinh-khoa", "Trần Đình Khoa", "HV0776"],
    ["trung-kien", "Trung Kiên", "HV0782"],
    ["bao-chau", "Nguyễn Thị Bảo Châu", "HV0777"],
    ["nhat-dang", "Nhật Đăng", "HV0773"],
    ["hoang-an", "Hoàng An", "HV0780"],
    ["minh-dung", "Ngô Minh Dũng", "HV0783"],
    ["nguyen-an", "Nguyễn Nguyên An", "HV0784"],
    ["phuong-vy", "Trương Thị Phương Vy", "HV0785"],
    ["bao-vy", "Nguyễn Bảo Vy", "HV0787"],
    ["vinh-khang", "Vĩnh Khang", "HV0789"],
    ["dang-khoa", "Hoàng Đăng Khoa", "HV0786"],
  ] as const) {
    const q = tuitionCollectionCharge(student(id, name, code), T15, [], emptySepayLedger(), NOW);
    assert.equal(q.amount, 540_000, name);
  }
  // Không rò nợ sang tháng/lớp khác.
  assert.equal(t15PreviousMonthDebtAmount(student("gia-khang", "Trương Gia Khang", "HV0779"), T15, ["2026-11"]), 0);
  assert.equal(t15PreviousMonthDebtAmount(student("gia-khang", "Trương Gia Khang", "HV0779"), { id: "class-import-t14" }, ["2026-10"]), 0);
});

function openReceivable(studentId: string, months: string, amount = 500_000): SepayReceivable {
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
    classId: T15_CLASS_ID,
    billKey: `month|${T15_CLASS_ID}|${months}`,
  };
}

test("T15: khoản tháng trước sót trên production không đếm kép vào công nợ của 17 bạn", () => {
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("quynh-huong", "2026-09"),
      openReceivable("gia-khang", "2026-09"),
      openReceivable("bao-long", "2026-08"),
      openReceivable("hoc-vien-la", "2026-09"),
    ],
    paymentOrders: [],
  };
  assert.equal(tuitionCollectionCharge(student("quynh-huong", "Quỳnh Hương", "HV0775"), T15, [], ledger as any, NOW).amount, 540_000);
  assert.equal(tuitionCollectionCharge(student("gia-khang", "Trương Gia Khang", "HV0779"), T15, [], ledger as any, NOW).amount, 1_020_000);
  assert.equal(tuitionCollectionCharge(student("bao-long", "Bảo Long", "HV0788"), T15, [], ledger as any, NOW).amount, 1_020_000);
  // Bạn ngoài danh sách 17 người không được che — phiếu sót vẫn đếm bình thường.
  assert.notEqual(tuitionCollectionCharge(student("hoc-vien-la", "Học Viên Lạ", "HV0800"), T15, [], ledger as any, NOW).amount, 540_000);
});

test("T15: sync hủy phiếu tháng trước sót của 17 bạn, giữ nguyên phiếu tháng 10", () => {
  const cls = { ...T15, billingEnabled: true, studentIds: ["quynh-huong", "gia-khang"] };
  const ledger = {
    ...emptySepayLedger(),
    receivables: [
      openReceivable("quynh-huong", "2026-09"),
      openReceivable("quynh-huong", "2026-10", 540_000),
      openReceivable("gia-khang", "2026-09"),
      openReceivable("gia-khang", "2026-10", 1_020_000),
    ],
    paymentOrders: [],
  };
  const students = [student("quynh-huong", "Quỳnh Hương", "HV0775"), student("gia-khang", "Trương Gia Khang", "HV0779")];
  const next = syncTuitionReceivables(ledger as any, [cls], students, [], NOW);
  const byBill = (id: string, month: string) => next.receivables.find((row) => row.studentId === id && row.billKey === `month|${T15_CLASS_ID}|${month}`);
  assert.equal(byBill("quynh-huong", "2026-09")?.status, "CANCELLED", "phiếu T9 sót bị hủy — Excel chỉ còn nợ T10");
  assert.equal(byBill("quynh-huong", "2026-10")?.amountDue, 540_000);
  assert.equal(byBill("gia-khang", "2026-09")?.status, "CANCELLED");
  assert.equal(byBill("gia-khang", "2026-10")?.amountDue, 1_020_000);
});

test("T15 số buổi tồn = buổi đã học chưa đóng + nợ cũ quy ra buổi; đóng xong trừ dần về 0", () => {
  const cls = { ...T15, billingEnabled: true, studentIds: ["gia-khang", "khac"] };
  const giaKhang = { ...student("gia-khang", "Trương Gia Khang", "HV0779"), classJoinedAt: { [T15_CLASS_ID]: "2026-09-01" } };
  // Tới 05/10 đã qua 2 buổi T10 (02/10 T6, 04/10 CN); nợ cũ 480k = 8 buổi.
  // Tháng 9 superseded — buổi T9 không đếm kép, nghĩa vụ nằm trong 8 buổi nợ.
  assert.equal(monthlyRemainingSessions(giaKhang, cls, [], emptySepayLedger(), NOW), -(2 + 8));
  // Đóng phiếu T10 gộp nợ (1.020k = 9 buổi tháng + 8 buổi nợ): tồn nhảy dương
  // rồi trừ dần về 0 khi học hết tháng.
  const paidKhang = { ...giaKhang, tuitionPaidThrough: { [T15_CLASS_ID]: "2026-10" } };
  const octSlots = 9;
  assert.equal(monthlyRemainingSessions(paidKhang, cls, [], emptySepayLedger(), NOW), octSlots + 8 - (2 + 8));
  assert.equal(monthlyRemainingSessions(paidKhang, cls, [], emptySepayLedger(), new Date("2026-11-01T12:00:00+07:00")), 0);
  // Bạn không nợ, đã đóng T9: chỉ còn buổi T10 đã qua.
  const normal = { ...student("khac", "Học Viên Khác", "HV0800"), tuitionPaidThrough: { [T15_CLASS_ID]: "2026-09" } };
  assert.equal(monthlyRemainingSessions(normal, cls, [], emptySepayLedger(), NOW), -2);
});
