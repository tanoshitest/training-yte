import assert from "node:assert/strict";
import test from "node:test";

import { findStudentByLogin, hashStudentPassword, isHashedPassword, resolveStudentPassword, studentApiAllowed, studentBootstrapView, verifyStudentPassword } from "../cloudflare/student-auth";

test("băm mật khẩu và kiểm tra đúng/sai; mật khẩu cũ chữ thường vẫn đăng nhập được", async () => {
  const hash = await hashStudentPassword("matkhau123");
  assert.ok(isHashedPassword(hash));
  assert.ok(!hash.includes("matkhau123"));
  assert.equal(await verifyStudentPassword("matkhau123", hash), true);
  assert.equal(await verifyStudentPassword("matkhau124", hash), false);
  assert.equal(await verifyStudentPassword("cu12345678", "cu12345678"), true);
  assert.equal(await verifyStudentPassword("", ""), false);
});

test("lưu: ô trống giữ mật khẩu cũ, nhập mới thì băm, xóa email thì xóa mật khẩu", async () => {
  const stored = await hashStudentPassword("abcdefgh");
  assert.equal(await resolveStudentPassword("", stored, "a@b.vn"), stored);
  assert.equal(await resolveStudentPassword(stored, stored, "a@b.vn"), stored);
  const changed = await resolveStudentPassword("moi12345", stored, "a@b.vn");
  assert.notEqual(changed, stored);
  assert.equal(await verifyStudentPassword("moi12345", changed), true);
  assert.equal(await resolveStudentPassword("x", stored, ""), "");
});

test("tìm học viên theo email: không phân biệt hoa thường; nghỉ học / trùng email / chưa có mật khẩu thì không cho", () => {
  const rows = [
    { id: "1", fullName: "A", status: "STUDYING", loginEmail: "Quan@Gmail.com", loginPassword: "x" },
    { id: "2", fullName: "B", status: "STOPPED", loginEmail: "b@x.vn", loginPassword: "x" },
    { id: "3", fullName: "C", status: "STUDYING", loginEmail: "dup@x.vn", loginPassword: "x" },
    { id: "4", fullName: "D", status: "STUDYING", loginEmail: "dup@x.vn", loginPassword: "x" },
    { id: "5", fullName: "E", status: "STUDYING", loginEmail: "e@x.vn", loginPassword: "" },
  ];
  assert.equal(findStudentByLogin(rows, " quan@gmail.com ")?.id, "1");
  assert.equal(findStudentByLogin(rows, "b@x.vn"), undefined);
  assert.equal(findStudentByLogin(rows, "dup@x.vn"), undefined);
  assert.equal(findStudentByLogin(rows, "e@x.vn"), undefined);
});

test("học viên chỉ gọi được API của Portal", () => {
  assert.equal(studentApiAllowed("GET", "/api/bootstrap"), true);
  assert.equal(studentApiAllowed("GET", "/api/syllabuses/syllabus-1"), true);
  assert.equal(studentApiAllowed("POST", "/api/activity-attempts"), true);
  assert.equal(studentApiAllowed("GET", "/api/portal/qr/rcv-1"), true);
  assert.equal(studentApiAllowed("GET", "/api/finance/tuition-qr"), false);
  assert.equal(studentApiAllowed("GET", "/api/students"), false);
  assert.equal(studentApiAllowed("PATCH", "/api/students"), false);
  assert.equal(studentApiAllowed("POST", "/api/syllabuses/syllabus-1/actions"), false);
  assert.equal(studentApiAllowed("POST", "/api/media"), false);
});

test("bootstrap học viên chỉ có dữ liệu của chính em", () => {
  const view = studentBootstrapView({
    student: { id: "x", name: "?" },
    students: [
      { id: "s1", code: "HV1", fullName: "Em", nationalId: "0421", parentPhone1: "0934", loginEmail: "e@x.vn" },
      { id: "s2", code: "HV2", fullName: "Bạn", parentPhone1: "0900" },
    ],
    classes: [
      { id: "c1", name: "S55", studentIds: ["s1", "s2"], teacherId: "t1", syllabusId: "seed1" },
      { id: "c2", name: "S56", studentIds: ["s2"], teacherId: "t2", syllabusId: "" },
    ],
    teachers: [{ id: "t1", fullName: "Cô A", phone: "0911", salary: 1 }, { id: "t2", fullName: "Cô B" }],
    syllabuses: [{ id: "seed1", name: "SEED 1" }, { id: "starter", name: "STARTER" }],
    lessonSessions: [
      { id: "l1", classId: "c1", attendance: [{ studentId: "s1", present: true }, { studentId: "s2", present: false }] },
      { id: "l2", classId: "c2", attendance: [{ studentId: "s2" }] },
    ],
    accountants: [{ id: "k" }], assistants: [{ id: "a" }], auditLogs: [{ id: "log" }], payrollConfig: { x: 1 },
  }, "s1");
  assert.deepEqual(view.students.map((row) => row.id), ["s1"]);
  assert.equal("nationalId" in view.students[0]!, false);
  assert.equal("parentPhone1" in view.students[0]!, false);
  assert.deepEqual(view.classes.map((row) => [row.id, row.studentIds]), [["c1", ["s1"]]]);
  assert.deepEqual(view.teachers, [{ id: "t1", fullName: "Cô A" }]);
  assert.deepEqual(view.syllabuses.map((row) => row.id), ["seed1"]);
  assert.deepEqual(view.lessonSessions.map((row) => [row.id, (row.attendance as unknown[]).length]), [["l1", 1]]);
  assert.equal(view.student.activeSyllabusId, "seed1");
  assert.deepEqual([view.accountants, view.assistants, view.auditLogs, view.payrollConfig], [[], [], [], null]);
});
