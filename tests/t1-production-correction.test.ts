import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import {
  T1_CLASS_ID,
  t1OctoberMinimumCreditSessions,
  t1PreviousMonthDebtAmount,
} from "../cloudflare/t1-production-correction";
import { tuitionCollectionCharge } from "../cloudflare/tuition-billing";

const NOW = new Date("2026-10-05T12:00:00+07:00");

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

/** Lớp T1 thật: thu theo tháng, 50k/buổi, lịch T2 + T5 16:30. */
function productionLikeT1Class(): DemoClass {
  return {
    id: T1_CLASS_ID,
    code: "T1",
    name: "T1-2012-9.1",
    classTypeId: "standard",
    branchId: "branch",
    teacherId: "teacher",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["y-nhi", "ha-vy", "ha-giang", "paid-member", "unpaid-member"],
    tuitionPackageId: "",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [
      { weekday: 1, periodId: "mon", startTime: "16:30", endTime: "18:30" },
      { weekday: 3, periodId: "wed", startTime: "16:30", endTime: "18:30" },
    ],
    note: "",
    billingEnabled: false,
  };
}

function septemberOff(id: string, date: string, offSource: "TEACHER" | "ADMIN"): DemoLessonSession {
  return {
    id,
    classId: T1_CLASS_ID,
    date,
    startTime: "16:30",
    endTime: "18:30",
    teacherId: "teacher",
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: `${T1_CLASS_ID}|${date}|16:30`,
    isOff: true,
    offSource,
    attendance: [],
  };
}

/** Tháng 9 thật của T1: 1 buổi GV nghỉ (07/09) + 2 buổi học vụ nghỉ. */
function septemberSessions(): DemoLessonSession[] {
  return [
    septemberOff("admin-off-1", "2026-09-02", "ADMIN"),
    septemberOff("teacher-off", "2026-09-07", "TEACHER"),
    septemberOff("admin-off-2", "2026-09-21", "ADMIN"),
  ];
}

test("nợ cũ phiếu tháng 10 T1 đúng từng học viên được chỉ định", () => {
  const cls = productionLikeT1Class();
  assert.equal(t1PreviousMonthDebtAmount(student("y-nhi", "Dương Thị Ý Nhi", "HV0559"), cls, ["2026-10"]), 1_958_000);
  assert.equal(t1PreviousMonthDebtAmount(student("ha-vy", "Tran Hà Vy", "HV0556"), cls, ["2026-10"]), 350_000);
  // Hà Giang Excel xác nhận không nợ — đã gỡ dòng nợ 1.110k gán nhầm trước đó.
  assert.equal(t1PreviousMonthDebtAmount(student("ha-giang", "Hoàng Hà Giang", "HV0537"), cls, ["2026-10"]), 0);
  assert.equal(t1PreviousMonthDebtAmount(student("paid-member", "Nguyễn Thị Thuỳ Nhi", "HV0546"), cls, ["2026-10"]), 0);
  assert.equal(t1PreviousMonthDebtAmount(student("y-nhi", "Dương Thị Ý Nhi", "HV0559"), cls, ["2026-11"]), 0);
  assert.equal(t1PreviousMonthDebtAmount(student("y-nhi", "Dương Thị Ý Nhi", "HV0559"), { id: "class-import-t2" }, ["2026-10"]), 0);
});

test("hai buổi khấu trừ tháng 10 chỉ áp cho lớp T1", () => {
  const cls = productionLikeT1Class();
  assert.equal(t1OctoberMinimumCreditSessions(student("a", "Ai Đó"), cls, "2026-10"), 2);
  assert.equal(t1OctoberMinimumCreditSessions(student("a", "Ai Đó"), cls, "2026-11"), 0);
  assert.equal(t1OctoberMinimumCreditSessions(student("a", "Ai Đó"), { id: "class-import-t3" }, "2026-10"), 0);
});

test("phiếu tháng 10 T1: đã thu T9 hay chưa đều còn 300k", () => {
  const cls = productionLikeT1Class();
  const sessions = septemberSessions();
  const paid = {
    ...student("paid-member", "Nguyễn Khánh Huyền", "HV0538"),
    tuitionPaidThrough: { [T1_CLASS_ID]: "2026-09" },
  };
  const paidQuote = tuitionCollectionCharge(paid, cls, sessions, emptySepayLedger(), NOW);
  assert.deepEqual(paidQuote.months, ["2026-10"]);
  assert.equal(paidQuote.items[0]?.originalBilled, 8);
  assert.equal(paidQuote.creditSessions, 2);
  assert.equal(paidQuote.amount, 300_000, "8 buổi − 2 buổi nghỉ tháng 9 = 6 buổi × 50k");

  const unpaid = student("unpaid-member", "Anh Đức", "HV0558");
  const unpaidQuote = tuitionCollectionCharge(unpaid, cls, sessions, emptySepayLedger(), NOW);
  assert.deepEqual(unpaidQuote.months, ["2026-10"]);
  assert.equal(unpaidQuote.amount, 300_000, "chưa thu T9 vẫn được trừ đúng 2 buổi theo quyết định của lớp");
});

test("phiếu tháng 10 T1 của 2 bạn nợ cũ đúng tổng, Hà Giang chỉ 300k", () => {
  const cls = productionLikeT1Class();
  const sessions = septemberSessions();
  for (const [id, name, code, total] of [
    ["y-nhi", "Dương Thị Ý Nhi", "HV0559", 2_258_000],
    ["ha-vy", "Tran Hà Vy", "HV0556", 650_000],
  ] as const) {
    const quote = tuitionCollectionCharge(student(id, name, code), cls, sessions, emptySepayLedger(), NOW);
    assert.deepEqual(quote.months, ["2026-10"]);
    assert.equal(quote.oldDebtAmount, total - 300_000, name);
    assert.equal(quote.oldDebtLabel, "Nợ cũ tháng trước");
    assert.equal(quote.amount, total, name);
  }
  const haGiang = tuitionCollectionCharge(student("ha-giang", "Hoàng Hà Giang", "HV0537"), cls, sessions, emptySepayLedger(), NOW);
  assert.equal(haGiang.oldDebtAmount, 0);
  assert.equal(haGiang.amount, 300_000);
});
