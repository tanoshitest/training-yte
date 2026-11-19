import assert from "node:assert/strict";
import test from "node:test";

import type { DemoClass } from "../cloudflare/operations-types";
import type { DemoStudent } from "../cloudflare/people-types";
import { S45_CLASS_ID, s45RosterInfoCorrection } from "../cloudflare/s45-roster-info-correction";

function student(id: string, code: string, fullName: string, extra: Partial<DemoStudent> = {}): DemoStudent {
  return { id, code, fullName, phone: "", address: "", school: "", parentZalo: "", status: "STUDYING", ...extra };
}

function s45Class(studentIds: string[]): DemoClass {
  return {
    id: S45_CLASS_ID, code: "S45", name: "S45", classTypeId: "standard", branchId: "b", teacherId: "t",
    roomId: "r", syllabusId: "", status: "ACTIVE", studentIds,
    tuitionPackageId: "", billingMode: "COURSE", sessionPrice: 65_000,
    schedules: [], note: "", billingEnabled: true,
  };
}

const OTHER: DemoClass = { ...s45Class([]), id: "class-other", code: "S99", name: "S99" };

test("Học viên có sẵn: chỉ điền trường trống, giữ nguyên dữ liệu web", () => {
  const web = [
    student("s-chau", "HV0990", "Nguyễn Thái Minh Châu", { parentPhone1: "0916903597", parentName: "Lê Thảo" }),
    student("s-nhi", "HV0993", "Trần Lê Tiểu Nhi", { parentPhone1: "0912272227" }),
    student("s-other", "HV0001", "Học viên lớp khác"),
  ];
  const classes = [s45Class(["s-chau", "s-nhi"]), OTHER];
  const { students } = s45RosterInfoCorrection(web, classes);

  const chau = students.find((row) => row.code === "HV0990")!;
  assert.equal(chau.fullName, "Nguyễn Thái Minh Châu"); // Excel ghi Thái — giữ nguyên
  assert.equal(chau.dateOfBirth, "2020-03-25");
  assert.equal(chau.parentPhone2, "0936042668");
  assert.equal(chau.nationalId, "042189008717");
  assert.match(chau.address, /Tổ Dân Phố 25/);
  assert.equal(chau.parentPhone1, "0916903597"); // giữ web
  assert.equal(chau.parentName, "Lê Thảo"); // giữ web

  const nhi = students.find((row) => row.code === "HV0993")!;
  assert.equal(nhi.dateOfBirth, "2020-05-02");
  assert.equal(nhi.nationalId, "040194035429");
  assert.match(nhi.address, /Lý Tự Trọng/);
});

test("Ô v1 ghi nhầm được thay bằng giá trị Excel đúng", () => {
  const web = [
    // Trạng thái sau khi migration v1 chạy: Minh Châu bị đổi tên + SĐT2/CCCD sai.
    student("s-chau", "HV0990", "Nguyễn Thị Minh Châu", {
      dateOfBirth: "2020-03-25", parentPhone2: "0930426688",
      nationalId: "042198008717", address: "Tổ Dân Phố 25, Phường Thanh Sen, Tỉnh Hà Tĩnh",
    }),
    student("s-khoa", "HV0994", "Đặng Văn Anh Khoa", {
      dateOfBirth: "2020-09-14", parentPhone2: "0976252521", nationalId: "042089051581",
    }),
    // Trường hợp người dùng tự sửa khác giá trị v1 — không được đè.
    student("s-ngan", "HV0973", "Nguyễn Diệu Ngân", { nationalId: "999999999999" }),
  ];
  const { students } = s45RosterInfoCorrection(web, [s45Class(["s-chau", "s-khoa", "s-ngan"])]);

  const chau = students.find((row) => row.code === "HV0990")!;
  assert.equal(chau.fullName, "Nguyễn Thái Minh Châu"); // revert tên v1 sửa nhầm
  assert.equal(chau.parentPhone2, "0936042668");
  assert.equal(chau.nationalId, "042189008717");

  const khoa = students.find((row) => row.code === "HV0994")!;
  assert.equal(khoa.dateOfBirth, "2020-09-24");
  assert.equal(khoa.parentPhone2, "0375052518");
  assert.equal(khoa.nationalId, "042196015860");

  const ngan = students.find((row) => row.code === "HV0973")!;
  assert.equal(ngan.nationalId, "999999999999"); // giữ dữ liệu người dùng nhập
});

test("Sửa tên theo Excel: Quang Đăng → Đăng Quang", () => {
  const web = [student("s-quang", "HV1000", "Nguyễn Viết Quang Đăng")];
  const { students } = s45RosterInfoCorrection(web, [s45Class(["s-quang"])]);
  assert.equal(students.find((row) => row.code === "HV1000")!.fullName, "Nguyễn Viết Đăng Quang");
});

test("Đức Anh + Đăng Khoa được tạo mới và xếp vào S45", () => {
  const web = [student("s-chau", "HV0990", "Nguyễn Thái Minh Châu")];
  const classes = [s45Class(["s-chau"]), OTHER];
  const { students, classes: nextClasses } = s45RosterInfoCorrection(web, classes);

  const s45 = nextClasses.find((cls) => cls.id === S45_CLASS_ID)!;
  assert.equal(s45.studentIds.length, 3); // 1 cũ + 2 mới

  const anh = students.find((row) => row.code === "HV1014");
  assert.ok(anh, "thiếu hồ sơ HV1014");
  assert.equal(anh.fullName, "Hoàng Trọng Đức Anh");
  assert.equal(anh.dateOfBirth, "2020-04-01");
  assert.equal(anh.parentPhone1, "0943739895");
  assert.equal(anh.parentPhone2, "0906586331");
  assert.equal(anh.parentName, "Trương Thị Trang");
  assert.equal(anh.nationalId, "042193002338");
  assert.equal(anh.status, "STUDYING");
  assert.ok(s45.studentIds.includes(anh.id));

  const dKhoa = students.find((row) => row.code === "HV1015");
  assert.ok(dKhoa, "thiếu hồ sơ HV1015");
  assert.equal(dKhoa.fullName, "Phạm Đăng Khoa");
  assert.equal(dKhoa.dateOfBirth, "2020-04-20");
  assert.equal(dKhoa.parentPhone1, "0932321639");
  assert.equal(dKhoa.parentName, "Trịnh Thị Minh Thủy");
  assert.equal(dKhoa.nationalId, "04219604014");
  assert.ok(s45.studentIds.includes(dKhoa.id));

  // Lớp khác không bị đụng.
  assert.deepEqual(nextClasses.find((cls) => cls.id === "class-other")!.studentIds, []);
});

test("HV1014 đã tạo bởi v1 với số liệu sai được sửa thẳng", () => {
  const web = [
    student("student-import-1014", "HV1014", "Hoàng Trọng Đức Anh", {
      phone: "0950586311", parentZalo: "0950586311", parentPhone1: "0950586311",
      parentPhone2: "", parentName: "Phương Trang", nationalId: "042192002318",
      dateOfBirth: "2020-04-01", address: "Xóm Sơn Hà, Xã Thạch Lạc, Tỉnh Hà Tĩnh",
    }),
  ];
  const { students, classes } = s45RosterInfoCorrection(web, [s45Class(["student-import-1014"])]);
  const anh = students.find((row) => row.code === "HV1014")!;
  assert.equal(anh.parentPhone1, "0943739895");
  assert.equal(anh.parentPhone2, "0906586331");
  assert.equal(anh.parentName, "Trương Thị Trang");
  assert.equal(anh.nationalId, "042193002338");
  // Không tạo trùng hồ sơ.
  assert.equal(students.filter((row) => row.code === "HV1014").length, 1);
  assert.ok(classes[0]!.studentIds.includes("student-import-1014"));
});

test("Chạy lại không đổi gì thêm (idempotent)", () => {
  const web = [student("s-chau", "HV0990", "Nguyễn Thái Minh Châu")];
  const once = s45RosterInfoCorrection(web, [s45Class(["s-chau"])]);
  const twice = s45RosterInfoCorrection(once.students, once.classes);
  assert.deepEqual(twice, once);
});
