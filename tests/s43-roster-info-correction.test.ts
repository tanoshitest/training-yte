import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass, DemoLessonSession } from "../cloudflare/operations-types";
import type { DemoFinance } from "../cloudflare/finance-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { emptySepayLedger } from "../cloudflare/sepay-engine";
import {
  S43_CLASS_ID,
  S43_WITHDRAWN_STUDENT_ID,
  purgeWithdrawnStudent,
  s43RosterInfoCorrection,
  s43RosterSwapCorrection,
} from "../cloudflare/s43-roster-info-correction";

function student(id: string, code: string, fullName: string, extra: Partial<DemoStudent> = {}): DemoStudent {
  return { id, code, fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING", ...extra };
}

function s43Class(studentIds: string[]): DemoClass {
  return {
    id: S43_CLASS_ID, code: "S43", name: "S43", classTypeId: "standard", branchId: "b", teacherId: "t",
    roomId: "r", syllabusId: "", status: "ACTIVE", studentIds,
    tuitionPackageId: "", billingMode: "MONTHLY", sessionPrice: 60_000,
    schedules: [], note: "", billingEnabled: true,
  };
}

const OTHER: DemoClass = { ...s43Class([]), id: "class-other", code: "S99", name: "S99" };

test("Học viên có sẵn: chỉ điền trường trống, giữ nguyên dữ liệu web", () => {
  const web = [
    student("s-nhat", "HV0959", "Nguyễn Hoàng Nhật"),
    // HV1006 đã có CCCD + địa chỉ trên web — không được ghi đè.
    student("s-chi", "HV1006", "Nguyễn Trần Linh Chi", {
      phone: "0387770009", parentPhone1: "0396245575", parentName: "Trần Thị Thơm",
      nationalId: "042093000233", address: "Phường Thành Sen - Hà Tĩnh",
    }),
    student("s-other", "HV0001", "Học viên lớp khác", { id: "s-other" }),
  ];
  const classes = [s43Class(["s-nhat", "s-chi"]), OTHER];
  const { students } = s43RosterInfoCorrection(web, classes);

  const nhat = students.find((row) => row.code === "HV0959")!;
  assert.equal(nhat.dateOfBirth, "2020-10-10");
  assert.equal(nhat.parentPhone2, "0911093435");
  assert.equal(nhat.nationalId, "042191001477");
  assert.match(nhat.address, /Lê Văn Huân/);

  const chi = students.find((row) => row.code === "HV1006")!;
  assert.equal(chi.dateOfBirth, "2020-07-03"); // chỉ thêm ngày sinh
  assert.equal(chi.nationalId, "042093000233"); // giữ web
  assert.equal(chi.address, "Phường Thành Sen - Hà Tĩnh"); // giữ web
  assert.equal(chi.parentPhone1, "0396245575"); // giữ web
});

test("Không ghi đè trường web đã có giá trị", () => {
  const web = [
    student("s-hung", "HV0962", "Bùi Văn Thế Hưng", {
      dateOfBirth: "1999-01-01", parentPhone2: "0900000000",
      nationalId: "999999999999", address: "Địa chỉ web",
    }),
  ];
  const { students } = s43RosterInfoCorrection(web, [s43Class(["s-hung"])]);
  const hung = students.find((row) => row.code === "HV0962")!;
  assert.equal(hung.dateOfBirth, "1999-01-01");
  assert.equal(hung.parentPhone2, "0900000000");
  assert.equal(hung.nationalId, "999999999999");
  assert.equal(hung.address, "Địa chỉ web");
});

test("5 bạn chưa có hồ sơ được tạo mới và xếp vào S43", () => {
  const web = [student("s-nhat", "HV0959", "Nguyễn Hoàng Nhật")];
  const classes = [s43Class(["s-nhat"]), OTHER];
  const { students, classes: nextClasses } = s43RosterInfoCorrection(web, classes);

  const s43 = nextClasses.find((cls) => cls.id === S43_CLASS_ID)!;
  assert.equal(s43.studentIds.length, 6); // 1 cũ + 5 mới

  const expected = [
    ["HV1009", "Nguyễn Minh Triết", "0972727792", "0823590534", "Nguyễn Thị Thảo", "042192004974"],
    ["HV1010", "Nguyễn Quang Khôi", "0946612268", "0945776577", "Lê Thị Thu Hiền", "042193010574"],
    ["HV1011", "Dương Kim Anh Đức", "0941283822", "0943388866", "Dương Thị Bê Phương", "042195009326"],
    ["HV1012", "Nguyễn Thị Trâm Anh", "0949966955", "0975404524", "Nguyễn Văn Thảo", "042084001992"],
    ["HV1013", "Nguyễn Khánh Ngọc", "0849827998", "0961786573", "Nguyễn Thị Chương", "042187012832"],
  ] as const;
  for (const [code, name, p1, p2, parent, cccd] of expected) {
    const row = students.find((stu) => stu.code === code);
    assert.ok(row, `thiếu hồ sơ ${code}`);
    assert.equal(row.fullName, name);
    assert.equal(row.parentPhone1, p1);
    assert.equal(row.parentPhone2, p2);
    assert.equal(row.parentName, parent);
    assert.equal(row.nationalId, cccd);
    assert.equal(row.status, "STUDYING");
    assert.ok(s43.studentIds.includes(row.id), `${code} chưa vào lớp`);
  }
  // Lớp khác không bị đụng.
  assert.deepEqual(nextClasses.find((cls) => cls.id === "class-other")!.studentIds, []);
});

test("Bạn trùng mã đã tồn tại (id khác) được xếp lớp, không tạo trùng", () => {
  const web = [
    student("s-triet-ui", "HV1009", "Nguyễn Minh Triết"),
    student("s-nhat", "HV0959", "Nguyễn Hoàng Nhật"),
  ];
  const { students, classes } = s43RosterInfoCorrection(web, [s43Class(["s-nhat"])]);
  assert.equal(students.filter((row) => row.code === "HV1009").length, 1);
  const s43 = classes.find((cls) => cls.id === S43_CLASS_ID)!;
  assert.ok(s43.studentIds.includes("s-triet-ui")); // xếp id thật, không phải student-import-1009
  assert.equal(s43.studentIds.includes("student-import-1009"), false);
});

test("Chạy lại không đổi gì thêm (idempotent)", () => {
  const web = [student("s-nhat", "HV0959", "Nguyễn Hoàng Nhật")];
  const once = s43RosterInfoCorrection(web, [s43Class(["s-nhat"])]);
  const twice = s43RosterInfoCorrection(once.students, once.classes);
  assert.deepEqual(twice, once);
});

const NAM = S43_WITHDRAWN_STUDENT_ID;

test("Purge Đức Nam: xoá hồ sơ, gỡ khỏi roster mọi lớp, gỡ điểm danh", () => {
  const nam = student(NAM, "HVXXXX", "Trần Đức Nam");
  const keep = student("s-nhat", "HV0959", "Nguyễn Hoàng Nhật");
  const classes = [s43Class([NAM, "s-nhat"]), { ...OTHER, studentIds: [NAM, "s-other"] }];
  const sessions: DemoLessonSession[] = [{
    id: "sess-1", classId: S43_CLASS_ID, date: "2026-09-20", startTime: "15:00", endTime: "17:00",
    teacherId: "t", roomId: "r", status: "COMPLETED", isExtra: false, recurrenceKey: "k", note: "",
    attendance: [
      { studentId: NAM, status: "PRESENT", lessonRating: "A", homeworkRating: "FULL_100", pronunciationVideoDone: false, note: "" },
      { studentId: "s-nhat", status: "PRESENT", lessonRating: "A", homeworkRating: "FULL_100", pronunciationVideoDone: false, note: "" },
    ],
  }];
  const out = purgeWithdrawnStudent(NAM, { students: [nam, keep], classes, sessions, finance: null });
  assert.deepEqual(out.students.map((s) => s.id), ["s-nhat"]);
  assert.deepEqual(out.classes.find((c) => c.id === S43_CLASS_ID)!.studentIds, ["s-nhat"]);
  assert.deepEqual(out.classes.find((c) => c.id === "class-other")!.studentIds, ["s-other"]);
  assert.deepEqual(out.sessions[0]!.attendance!.map((r) => r.studentId), ["s-nhat"]);
});

test("Purge Đức Nam: hủy phiếu OPEN + đơn QR treo, giữ phiếu đã PAID", () => {
  const ledger = emptySepayLedger();
  const finance = {
    sepay: {
      ...ledger,
      receivables: [
        { id: "r-open", receivableCode: "HP57B92R", studentId: NAM, studentName: "Trần Đức Nam", billingPeriod: "Khóa 24 buổi · S43", issueDate: "2026-09-27", dueDate: "2026-09-27", amountDue: 1560000, amountPaid: 0, balanceDue: 1560000, currency: "VND", status: "OPEN", paymentOrderId: "po-1" },
        { id: "r-paid", receivableCode: "HP00PAID", studentId: NAM, studentName: "Trần Đức Nam", billingPeriod: "T8", issueDate: "2026-08-01", dueDate: "2026-08-01", amountDue: 500000, amountPaid: 500000, balanceDue: 0, currency: "VND", status: "PAID", paymentOrderId: "po-2" },
        { id: "r-other", receivableCode: "HP000001", studentId: "s-nhat", studentName: "Nhật", billingPeriod: "T10", issueDate: "2026-10-01", dueDate: "2026-10-01", amountDue: 100, amountPaid: 0, balanceDue: 100, currency: "VND", status: "OPEN", paymentOrderId: "po-3" },
      ],
      paymentOrders: [
        { id: "po-1", receivableId: "r-open", studentId: NAM, paymentCode: "HP57B92R", amount: 1560000, qrUrl: "", status: "ACTIVE", createdAt: "2026-09-27" },
        { id: "po-3", receivableId: "r-other", studentId: "s-nhat", paymentCode: "HP000001", amount: 100, qrUrl: "", status: "ACTIVE", createdAt: "2026-10-01" },
      ],
    },
  } as unknown as DemoFinance;
  const out = purgeWithdrawnStudent(NAM, { students: [], classes: [], sessions: [], finance });
  const [rOpen, rPaid, rOther] = out.finance!.sepay!.receivables;
  assert.equal(rOpen!.status, "CANCELLED");
  assert.equal(rOpen!.balanceDue, 0);
  assert.equal(rPaid!.status, "PAID"); // lịch sử tiền thật giữ nguyên
  assert.equal(rOther!.status, "OPEN"); // người khác không bị đụng
  const [po1, po3] = out.finance!.sepay!.paymentOrders;
  assert.equal(po1!.status, "CANCELLED");
  assert.equal(po3!.status, "ACTIVE");
});

test("Purge idempotent: chạy lại không đổi gì thêm", () => {
  const nam = student(NAM, "HVXXXX", "Trần Đức Nam");
  const once = purgeWithdrawnStudent(NAM, { students: [nam], classes: [s43Class([NAM])], sessions: [], finance: null });
  const twice = purgeWithdrawnStudent(NAM, once);
  assert.deepEqual(twice, once);
});

test("Roster swap S43: gỡ 3 bạn xếp nhầm khỏi riêng S43, đưa HV1011–13 vào lớp", () => {
  // Trạng thái prod: 3 bạn sai trong roster S43 + vẫn đang học lớp khác; hồ sơ
  // HV1011–13 tồn tại nhưng chưa vào S43.
  const tram = student("s-tram", "HV0396", "Bảo Trâm");
  const uyen = student("s-uyen", "HV0129", "Tú Uyên");
  const khang = student("s-khang", "HV0145", "Nguyên Khang");
  const keep = student("s-nhat", "HV0959", "Nguyễn Hoàng Nhật");
  const duc = student("s-duc", "HV1011", "Dương Kim Anh Đức");
  const anh = student("s-anh", "HV1012", "Nguyễn Thị Trâm Anh");
  const ngoc = student("s-ngoc", "HV1013", "Nguyễn Khánh Ngọc");
  // Minh Triết + Quang Khôi (HV1009/1010) đã ở trong lớp trên prod.
  const triet = student("s-triet", "HV1009", "Nguyễn Minh Triết");
  const khoi = student("s-khoi", "HV1010", "Nguyễn Quang Khôi");
  const classes = [
    s43Class(["s-nhat", "s-triet", "s-khoi", "s-tram", "s-uyen", "s-khang"]),
    { ...OTHER, studentIds: ["s-tram", "s-uyen", "s-khang"] },
  ];
  const sessions: DemoLessonSession[] = [{
    id: "sess-1", classId: S43_CLASS_ID, date: "2026-10-05", startTime: "15:00", endTime: "17:00",
    teacherId: "t", roomId: "r", status: "COMPLETED", isExtra: false, recurrenceKey: "k", note: "",
    attendance: [
      { studentId: "s-tram", status: "PRESENT", lessonRating: "A", homeworkRating: "FULL_100", pronunciationVideoDone: false, note: "" },
      { studentId: "s-nhat", status: "PRESENT", lessonRating: "A", homeworkRating: "FULL_100", pronunciationVideoDone: false, note: "" },
    ],
  }];
  const ledger = emptySepayLedger();
  const finance = {
    sepay: {
      ...ledger,
      receivables: [
        // Phiếu S43 chưa thu của bạn bị xếp nhầm → hủy.
        { id: "r-tram-s43", receivableCode: "HP-S43", studentId: "s-tram", studentName: "Bảo Trâm", billingPeriod: "Khóa · S43", issueDate: "2026-10-01", dueDate: "2026-10-01", amountDue: 1_560_000, amountPaid: 0, balanceDue: 1_560_000, currency: "VND", status: "OPEN", paymentOrderId: "po-s43", classId: S43_CLASS_ID },
        // Phiếu của lớp khác (S30) → giữ nguyên.
        { id: "r-tram-s30", receivableCode: "HP-S30", studentId: "s-tram", studentName: "Bảo Trâm", billingPeriod: "Khóa · S30", issueDate: "2026-10-01", dueDate: "2026-10-01", amountDue: 3_480_000, amountPaid: 0, balanceDue: 3_480_000, currency: "VND", status: "OPEN", paymentOrderId: "po-s30", classId: "class-other" },
        { id: "r-nhat", receivableCode: "HP-NHAT", studentId: "s-nhat", studentName: "Nhật", billingPeriod: "Khóa · S43", issueDate: "2026-10-01", dueDate: "2026-10-01", amountDue: 1_560_000, amountPaid: 0, balanceDue: 1_560_000, currency: "VND", status: "OPEN", paymentOrderId: "po-nhat", classId: S43_CLASS_ID },
      ],
      paymentOrders: [
        { id: "po-s43", receivableId: "r-tram-s43", studentId: "s-tram", paymentCode: "HP-S43", amount: 1_560_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-10-01" },
        { id: "po-s30", receivableId: "r-tram-s30", studentId: "s-tram", paymentCode: "HP-S30", amount: 3_480_000, qrUrl: "", status: "ACTIVE", createdAt: "2026-10-01" },
      ],
    },
  } as unknown as DemoFinance;

  const out = s43RosterSwapCorrection({
    students: [tram, uyen, khang, keep, duc, anh, ngoc, triet, khoi], classes, sessions, finance,
  });

  const s43 = out.classes.find((cls) => cls.id === S43_CLASS_ID)!;
  // 3 bạn sai ra khỏi S43; Đức/Anh/Ngọc vào thay ở cuối.
  assert.deepEqual(s43.studentIds, ["s-nhat", "s-triet", "s-khoi", "s-duc", "s-anh", "s-ngoc"]);
  // Lớp khác của 3 bạn giữ nguyên.
  assert.deepEqual(out.classes.find((cls) => cls.id === "class-other")!.studentIds, ["s-tram", "s-uyen", "s-khang"]);
  // Điểm danh S43 gỡ bạn sai, giữ người ở lại.
  assert.deepEqual(out.sessions[0]!.attendance!.map((row) => row.studentId), ["s-nhat"]);
  // Phiếu S43 của bạn sai bị hủy + đơn QR hủy; phiếu lớp khác và phiếu bạn đúng giữ.
  const byId = new Map(out.finance!.sepay!.receivables.map((row) => [row.id, row]));
  assert.equal(byId.get("r-tram-s43")!.status, "CANCELLED");
  assert.equal(byId.get("r-tram-s43")!.balanceDue, 0);
  assert.equal(byId.get("r-tram-s30")!.status, "OPEN");
  assert.equal(byId.get("r-nhat")!.status, "OPEN");
  const orderById = new Map(out.finance!.sepay!.paymentOrders.map((row) => [row.id, row]));
  assert.equal(orderById.get("po-s43")!.status, "CANCELLED");
  assert.equal(orderById.get("po-s30")!.status, "ACTIVE");
});

test("Roster swap S43: tạo hồ sơ mới khi thiếu + idempotent", () => {
  const out = s43RosterSwapCorrection({
    students: [student("s-nhat", "HV0959", "Nguyễn Hoàng Nhật")],
    classes: [s43Class(["s-nhat"])],
    sessions: [],
    finance: null,
  });
  const s43 = out.classes.find((cls) => cls.id === S43_CLASS_ID)!;
  // HV1009/HV1010 cũng được đưa vào vì nằm trong S43_NEW_STUDENTS.
  assert.equal(s43.studentIds.length, 6);
  for (const code of ["HV1011", "HV1012", "HV1013"]) {
    assert.ok(out.students.some((row) => row.code === code), `thiếu hồ sơ ${code}`);
  }
  const twice = s43RosterSwapCorrection(out);
  assert.deepEqual(twice.students, out.students);
  assert.deepEqual(twice.classes, out.classes);
});
