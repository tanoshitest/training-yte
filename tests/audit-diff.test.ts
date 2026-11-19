import { test } from "node:test";
import assert from "node:assert/strict";
import { auditCategoryOf, auditDetails, auditHasMeaningfulChange, buildAuditNames } from "../cloudflare/audit-diff";

const names = buildAuditNames({ students: [{ id: "s1", fullName: "Nguyễn A", code: "HV0001" }], teachers: [{ id: "t1", fullName: "Cô Vân" }, { id: "t2", fullName: "Cô Linh" }], classes: [{ id: "c1", name: "S1" }] });

test("sửa học viên ghi rõ từ … thành …, bỏ mật khẩu và số buổi tồn tự tính", () => {
  const details = auditDetails("Student", { id: "s1", fullName: "Nguyễn A", parentPhone1: "0901", loginPassword: "a", sessionBalances: { c1: 1 } }, { id: "s1", fullName: "Nguyễn Văn A", parentPhone1: "0902", loginPassword: "b", sessionBalances: { c1: 2 } }, names);
  assert.deepEqual(details, [
    { label: "Họ tên", from: "Nguyễn A", to: "Nguyễn Văn A" },
    { label: "SĐT phụ huynh 1", from: "0901", to: "0902" },
  ]);
  assert.equal(auditHasMeaningfulChange("Student", { id: "s1", sessionBalances: { c1: 1 } }, { id: "s1", sessionBalances: { c1: 2 } }), false);
});

test("điểm danh ghi từng học viên", () => {
  const details = auditDetails("LessonSession", { id: "x", teacherId: "t1", attendance: [{ studentId: "s1", status: "ABSENT" }] }, { id: "x", teacherId: "t2", attendance: [{ studentId: "s1", status: "PRESENT" }] }, names);
  assert.deepEqual(details, [
    { label: "Giáo viên", from: "Cô Vân", to: "Cô Linh" },
    { label: "Nguyễn A (HV0001) · Điểm danh", from: "Vắng", to: "Có mặt" },
  ]);
});

test("xếp nghiệp vụ", () => {
  assert.equal(auditCategoryOf({ action: "UPDATE", entity: "Finance", summary: "Nhập sao kê a.xlsx" }), "STATEMENT");
  assert.equal(auditCategoryOf({ action: "UPDATE", entity: "Reconciliation", summary: "Đối soát xong ngày 12/11/2026" }), "RECON");
  assert.equal(auditCategoryOf({ action: "CREATE", entity: "Student", summary: "Đóng học phí A · 300.000đ" }), "TUITION");
  assert.equal(auditCategoryOf({ action: "UPDATE", entity: "Student", summary: "Cập nhật học viên A" }), "PROFILE");
  assert.equal(auditCategoryOf({ action: "UPDATE", entity: "LessonSession", summary: "Cập nhật buổi học" }), "ATTENDANCE");
  assert.equal(auditCategoryOf({ action: "LOGIN", entity: "User", summary: "Đăng nhập hệ thống" }), "OTHER");
});
