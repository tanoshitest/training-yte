import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import {
  effectivePaidThrough,
  T3_CLASS_ID,
  t3PreviousMonthDebtAmount,
  t3EffectivePaidThrough,
} from "../cloudflare/t3-production-correction";
import {
  studentRemainingSessions,
  tuitionCollectionCharge,
} from "../cloudflare/tuition-billing";

const NOW = new Date("2026-10-01T12:00:00+07:00");

function student(id: string, fullName: string, code?: string): DemoStudent {
  return {
    id,
    code: code || id.toUpperCase(),
    fullName,
    phone: "",
    address: "",
    school: "",
    parentZalo: "",
    status: "STUDYING",
  };
}

/** Lớp T3 thật: thu theo tháng, 50k/buổi, lịch T3 + CN. */
function productionLikeT3Class(): DemoClass {
  return {
    id: T3_CLASS_ID,
    code: "T3",
    name: "T3-2013-8.1",
    classTypeId: "standard",
    branchId: "branch",
    teacherId: "teacher",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["phuong-linh", "kim-oanh", "kieu-oanh", "quynh-trang", "gia-huy", "paid-member"],
    tuitionPackageId: "",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [
      { weekday: 2, periodId: "tue", startTime: "19:00", endTime: "20:30" },
      { weekday: 0, periodId: "sun", startTime: "19:00", endTime: "20:30" },
    ],
    note: "",
    billingEnabled: false,
  };
}

/** Buổi 01/09 học vụ cho nghỉ — lớp T3 tháng 9 chỉ tính phí 8 buổi. */
function adminOffSeptember(): DemoLessonSession {
  return {
    id: "admin-off",
    classId: T3_CLASS_ID,
    date: "2026-09-01",
    startTime: "19:00",
    endTime: "20:30",
    teacherId: "teacher",
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: `${T3_CLASS_ID}|2026-09-01|19:00`,
    note: "Nghỉ học vụ",
    isOff: true,
    offSource: "ADMIN",
    attendance: [],
  };
}

test("nợ tháng 9 của T3 chỉ cộng cho đúng 4 học viên trên phiếu tháng 10", () => {
  const cls = productionLikeT3Class();
  for (const [id, name, code] of [
    ["phuong-linh", "Trương Thị Phương Linh", "HV0579"],
    ["kieu-oanh", "Hồ Kiều Oanh", "HV0582"],
    ["quynh-trang", "Hoàng Thị Quỳnh Trang", "HV0583"],
    ["gia-huy", "Gia Huy", "HV0593"],
  ] as const) {
    assert.equal(t3PreviousMonthDebtAmount(student(id, name, code), cls, ["2026-10"]), 400_000, name);
  }
  assert.equal(t3PreviousMonthDebtAmount(student("paid-member", "Học viên đã đóng", "HV0570"), cls, ["2026-10"]), 0);
  assert.equal(t3PreviousMonthDebtAmount(student("phuong-linh", "Trương Thị Phương Linh", "HV0579"), cls, ["2026-11"]), 0);
  assert.equal(t3PreviousMonthDebtAmount(student("phuong-linh", "Trương Thị Phương Linh", "HV0579"), { id: "class-khac" }, ["2026-10"]), 0);
});

test("riêng Kim Oanh của T3 được tính là đã đóng tháng 9", () => {
  const cls = productionLikeT3Class();
  const kimOanh = student("kim-oanh", "Phạm Kim Oanh", "HV0581");
  assert.equal(t3EffectivePaidThrough(kimOanh, cls, undefined), "2026-09");
  assert.equal(t3EffectivePaidThrough(kimOanh, cls, "2026-10"), "2026-10", "không kéo lùi mốc đã có");
  assert.equal(t3EffectivePaidThrough(student("phuong-linh", "Trương Thị Phương Linh", "HV0579"), cls, undefined), undefined);
  assert.equal(t3EffectivePaidThrough(kimOanh, { id: "class-khac" }, undefined), undefined);
});

test("effectivePaidThrough gộp cả ngoại lệ T2 và T3", () => {
  const t3 = productionLikeT3Class();
  const t2 = { id: "class-import-t2" } as DemoClass;
  assert.equal(effectivePaidThrough(student("kim-oanh", "Phạm Kim Oanh", "HV0581"), t3, undefined), "2026-09");
  assert.equal(effectivePaidThrough(student("thuy", "Thúy", "HV0942"), t2, undefined), "2026-09");
  assert.equal(effectivePaidThrough(student("a", "Học viên khác"), t3, "2026-08"), "2026-08");
});

test("phiếu T3 của 4 bạn nợ là phiếu tháng 10 một tháng cộng nợ cũ 400k", () => {
  const cls = productionLikeT3Class();
  const sessions = [adminOffSeptember()];
  for (const [id, name, code] of [
    ["phuong-linh", "Trương Thị Phương Linh", "HV0579"],
    ["kieu-oanh", "Hồ Kiều Oanh", "HV0582"],
    ["quynh-trang", "Hoàng Thị Quỳnh Trang", "HV0583"],
    ["gia-huy", "Gia Huy", "HV0593"],
  ] as const) {
    const target = student(id, name, code);
    const quote = tuitionCollectionCharge(target, cls, sessions, emptySepayLedger(), NOW);
    assert.deepEqual(quote.months, ["2026-10"], `${name}: phiếu một tháng để phiếu in hiển thị đúng`);
    assert.equal(quote.amount, 800_000, `${name}: tháng 10 (8 buổi 400k) + nợ cũ tháng 9 (400k)`);
    assert.equal(studentRemainingSessions(target, cls, sessions, emptySepayLedger(), NOW), -8, name);
  }
});

test("Kim Oanh chỉ nợ tháng 10 vì đã đóng tháng 9", () => {
  const cls = productionLikeT3Class();
  const sessions = [adminOffSeptember()];
  const kimOanh = student("kim-oanh", "Phạm Kim Oanh", "HV0581");
  const quote = tuitionCollectionCharge(kimOanh, cls, sessions, emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"]);
  assert.equal(quote.amount, 400_000);
  assert.equal(studentRemainingSessions(kimOanh, cls, sessions, emptySepayLedger(), NOW), 0);
});

test("học viên T3 đã đóng tháng 9 chỉ còn nợ tháng 10; học viên mới không bị gán nợ tháng 9", () => {
  const cls = productionLikeT3Class();
  const sessions = [adminOffSeptember()];
  const paid = {
    ...student("paid-member", "Học viên đã đóng", "HV0570"),
    tuitionPaidThrough: { [T3_CLASS_ID]: "2026-09" },
  };
  const paidQuote = tuitionCollectionCharge(paid, cls, sessions, emptySepayLedger(), NOW);
  assert.deepEqual(paidQuote.months, ["2026-10"]);
  assert.equal(paidQuote.amount, 400_000);

  const newcomer = student("newcomer", "Học viên mới", "HV0999");
  const quote = tuitionCollectionCharge(newcomer, cls, sessions, emptySepayLedger(), NOW);
  assert.deepEqual(quote.months, ["2026-10"], "không có mốc vào lớp thì chỉ tính tháng hiện tại");
  assert.equal(quote.amount, 400_000);
});
