import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import {
  T7_CLASS_ID,
  t7OctoberMinimumCreditSessions,
  t7PreviousMonthDebtAmount,
} from "../cloudflare/t7-production-correction";
import { T8_CLASS_ID, t8PreviousMonthDebtAmount } from "../cloudflare/t8-production-correction";
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

/** Lớp T7 thật: thu theo tháng, 50k/buổi, lịch T6 15:00 + CN 18:30. */
function productionLikeT7Class(): DemoClass {
  return {
    id: T7_CLASS_ID,
    code: "T7",
    name: "T7- 2015-6.1",
    classTypeId: "standard",
    branchId: "branch",
    teacherId: "teacher",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["dinh-nam", "minh-duc", "paid-member", "unpaid-member"],
    tuitionPackageId: "",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [
      { weekday: 5, periodId: "fri", startTime: "15:00", endTime: "17:00", effectiveFrom: "2026-09-07" },
      { weekday: 0, periodId: "sun", startTime: "18:30", endTime: "20:30" },
    ],
    note: "",
  };
}

/** Lớp T8 thật: thu theo tháng, 50k/buổi, lịch T4 15:00 + CN 14:30. */
function productionLikeT8Class(): DemoClass {
  return {
    id: T8_CLASS_ID,
    code: "T8",
    name: "T8-2015-6.2",
    classTypeId: "standard",
    branchId: "branch",
    teacherId: "teacher",
    roomId: "",
    syllabusId: "",
    status: "ACTIVE",
    studentIds: ["huyen-trang", "thao-nguyen", "thao-nguyen-khac", "paid-member"],
    tuitionPackageId: "",
    billingMode: "MONTHLY",
    sessionPrice: 50_000,
    schedules: [
      { weekday: 3, periodId: "thu", startTime: "15:00", endTime: "17:00" },
      { weekday: 0, periodId: "sun", startTime: "14:30", endTime: "16:30" },
    ],
    note: "",
    billingEnabled: false,
  };
}

function teacherOff(classId: string, date: string): DemoLessonSession {
  return {
    id: `${classId}|${date}`,
    classId,
    date,
    startTime: "15:00",
    endTime: "17:00",
    teacherId: "teacher",
    roomId: "",
    status: "SCHEDULED",
    isExtra: false,
    recurrenceKey: `${classId}|${date}|15:00`,
    isOff: true,
    offSource: "TEACHER",
    attendance: [],
  };
}

test("nợ cũ phiếu tháng 10 T7 chỉ có Đình Nam 750k và Minh Đức 350k", () => {
  const cls = productionLikeT7Class();
  assert.equal(t7PreviousMonthDebtAmount(student("dinh-nam", "Trần Đình Nam", "HV0652"), cls, ["2026-10"]), 750_000);
  assert.equal(t7PreviousMonthDebtAmount(student("minh-duc", "Đồng Minh Đức", "HV0643"), cls, ["2026-10"]), 350_000);
  assert.equal(t7PreviousMonthDebtAmount(student("cam-nhung", "Nguyễn Thị Cẩm Nhung", "HV0641"), cls, ["2026-10"]), 0);
  assert.equal(t7PreviousMonthDebtAmount(student("hoang-anh", "Hoàng Anh", "HV0663"), cls, ["2026-10"]), 0);
  assert.equal(t7PreviousMonthDebtAmount(student("khanh-huyen", "Trần Thị Khánh Huyền", "HV0665"), cls, ["2026-10"]), 0);
  assert.equal(t7PreviousMonthDebtAmount(student("paid-member", "Nguyễn Viết Bảo Nam", "HV0662"), cls, ["2026-10"]), 0);
  assert.equal(t7PreviousMonthDebtAmount(student("dinh-nam", "Trần Đình Nam", "HV0652"), cls, ["2026-11"]), 0);
  assert.equal(t7PreviousMonthDebtAmount(student("dinh-nam", "Trần Đình Nam", "HV0652"), { id: T8_CLASS_ID }, ["2026-10"]), 0);
});

test("nợ cũ phiếu tháng 10 T8: đúng Trần Thảo Nguyên, không nhầm Nguyễn Trần Thảo Nguyên", () => {
  const cls = productionLikeT8Class();
  assert.equal(t8PreviousMonthDebtAmount(student("huyen-trang", "Trần Huyền Trang", "HV0657"), cls, ["2026-10"]), 350_000);
  assert.equal(t8PreviousMonthDebtAmount(student("thao-nguyen", "Trần Thảo Nguyên", "HV0667"), cls, ["2026-10"]), 350_000);
  // HV0666 Nguyễn Trần Thảo Nguyên trùng đuôi tên nhưng khác mã — không được cộng nợ.
  assert.equal(t8PreviousMonthDebtAmount(student("thao-nguyen-khac", "Nguyễn Trần Thảo Nguyên", "HV0666"), cls, ["2026-10"]), 0);
  assert.equal(t8PreviousMonthDebtAmount(student("paid-member", "Trần Thị Hà Vy", "HV0656"), cls, ["2026-10"]), 0);
  assert.equal(t8PreviousMonthDebtAmount(student("huyen-trang", "Trần Huyền Trang", "HV0657"), cls, ["2026-11"]), 0);
});

test("phiếu tháng 10 T7 sửa lại: 9 buổi không khấu trừ còn 450k, kể cả bạn chưa thu T9", () => {
  const cls = productionLikeT7Class();
  const sessions = [teacherOff(T7_CLASS_ID, "2026-09-25")];
  const paid = {
    ...student("paid-member", "Trần Gia An", "HV0635"),
    tuitionPaidThrough: { [T7_CLASS_ID]: "2026-09" },
  };
  const paidQuote = tuitionCollectionCharge(paid, cls, sessions, emptySepayLedger(), NOW);
  assert.deepEqual(paidQuote.months, ["2026-10"]);
  assert.equal(paidQuote.items[0]?.originalBilled, 9, "T7 tháng 10 có 9 suất lịch");
  assert.equal(paidQuote.creditSessions, 0);
  assert.equal(paidQuote.amount, 450_000);

  const unpaid = student("unpaid-member", "Học viên khác", "HV0999");
  const unpaidQuote = tuitionCollectionCharge(unpaid, cls, sessions, emptySepayLedger(), NOW);
  assert.equal(unpaidQuote.creditSessions, 0);
  assert.equal(unpaidQuote.amount, 450_000);
});

test("phiếu tháng 10 T7 sửa lại: Đình Nam 1.200k, Minh Đức 800k, còn lại 450k", () => {
  const cls = productionLikeT7Class();
  const sessions = [teacherOff(T7_CLASS_ID, "2026-09-25")];
  for (const [id, name, code, total] of [
    ["dinh-nam", "Trần Đình Nam", "HV0652", 1_200_000],
    ["minh-duc", "Đồng Minh Đức", "HV0643", 800_000],
  ] as const) {
    const quote = tuitionCollectionCharge(student(id, name, code), cls, sessions, emptySepayLedger(), NOW);
    assert.equal(quote.oldDebtAmount, total - 450_000, name);
    assert.equal(quote.amount, total, name);
  }
  for (const [id, name, code] of [
    ["cam-nhung", "Nguyễn Thị Cẩm Nhung", "HV0641"],
    ["hoang-anh", "Hoàng Anh", "HV0663"],
    ["khanh-huyen", "Trần Thị Khánh Huyền", "HV0665"],
  ] as const) {
    const quote = tuitionCollectionCharge(student(id, name, code), cls, sessions, emptySepayLedger(), NOW);
    assert.equal(quote.oldDebtAmount, 0, name);
    assert.equal(quote.amount, 450_000, name);
  }
});

test("phiếu tháng 10 T8: 8 buổi không khấu trừ, hai bạn nợ cũ 750k tổng", () => {
  const cls = productionLikeT8Class();
  const paid = {
    ...student("paid-member", "Hoàng Xuân Hiệp", "HV0636"),
    tuitionPaidThrough: { [T8_CLASS_ID]: "2026-09" },
  };
  const paidQuote = tuitionCollectionCharge(paid, cls, [], emptySepayLedger(), NOW);
  assert.deepEqual(paidQuote.months, ["2026-10"]);
  assert.equal(paidQuote.items[0]?.originalBilled, 8, "T8 tháng 10 có 8 suất lịch");
  assert.equal(paidQuote.creditSessions, 0);
  assert.equal(paidQuote.amount, 400_000);

  for (const [id, name, code] of [
    ["huyen-trang", "Trần Huyền Trang", "HV0657"],
    ["thao-nguyen", "Trần Thảo Nguyên", "HV0667"],
  ] as const) {
    const quote = tuitionCollectionCharge(student(id, name, code), cls, [], emptySepayLedger(), NOW);
    assert.equal(quote.oldDebtAmount, 350_000, name);
    assert.equal(quote.amount, 750_000, name);
  }
});

test("T7 tháng 10 sửa lại không còn khấu trừ buổi nào", () => {
  const t7 = productionLikeT7Class();
  const t8 = productionLikeT8Class();
  assert.equal(t7OctoberMinimumCreditSessions(student("a", "Ai Đó"), t7, "2026-10"), 0);
  assert.equal(t7OctoberMinimumCreditSessions(student("a", "Ai Đó"), t7, "2026-11"), 0);
  assert.equal(t7OctoberMinimumCreditSessions(student("a", "Ai Đó"), t8, "2026-10"), 0);
});
