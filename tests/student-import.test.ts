import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseStudentSheet, planStudentImport } from "../cloudflare/student-import";

const base = (extra: Record<string, unknown>) => ({ phone: "", address: "", school: "", parentZalo: "", parentPhone1: "", parentPhone2: "", status: "STUDYING", parentName: "", nationalId: "", sessionBalances: { c1: 5 }, ...extra }) as any;
const students = [
  base({ id: "s1", code: "HV0023", fullName: "Nguyễn Thị Cẩm Ly", parentPhone1: "0941425593", phone: "0941425593", address: "Hà Nội" }),
  base({ id: "s2", code: "HV0065", fullName: "Nguyễn Minh Trí", parentName: "NG Thị Nguyệt", parentPhone1: "036577156", parentPhone2: "0362436862" }),
];

// Đúng dạng file xuất từ trang Học viên (bảng HTML .xls), có sửa + thêm dòng.
const exported = `<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr><th>STT</th><th>Mã HV</th><th>Tên học viên</th><th>Mã lớp</th><th>Tên phụ huynh</th><th>Số điện thoại</th><th>CCCD</th><th>Địa chỉ</th></tr></thead><tbody>
<tr><td>1</td><td>HV0023</td><td>Nguyễn Thị Cẩm Ly</td><td>S1</td><td>Trần Văn Bố</td><td>0941425593 / 0912000111</td><td>001234567890</td><td>Hải Phòng</td></tr>
<tr><td>2</td><td>HV0065</td><td>Nguyễn Minh Trí</td><td></td><td>Khách hàng chưa cung cấp thông tin</td><td>036577156 / 0362436862</td><td></td><td></td></tr>
<tr><td>3</td><td></td><td>Lê Bảo Anh</td><td>S9</td><td>Lê Mẹ</td><td>912345678</td><td></td><td>Đà Nẵng</td></tr>
<tr><td>4</td><td></td><td>Nguyễn Minh Trí</td><td></td><td></td><td>0362436862</td><td></td><td>Huế</td></tr>
</tbody></table></body></html>`;

test("nhập Excel học viên: giữ dữ liệu cũ, chỉ điền ô trống, thêm học viên mới", () => {
  const wb = XLSX.read(Buffer.from(exported, "utf8"), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true }) as unknown[][];
  const parsed = parseStudentSheet(rows);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.rows.length, 4);
  let n = 0;
  const plan = planStudentImport(parsed.rows, students, () => `new-${++n}`);
  const ly = plan.next.find((row) => row.id === "s1")!;
  assert.equal(ly.address, "Hà Nội", "địa chỉ đã có → giữ LMS");
  assert.equal(ly.parentName, "Trần Văn Bố", "phụ huynh đang trống → điền");
  assert.equal(ly.parentPhone2, "0912000111");
  assert.equal(ly.nationalId, "001234567890");
  assert.deepEqual(ly.sessionBalances, { c1: 5 }, "không đụng số buổi / học phí");
  assert.equal(ly.status, "STUDYING");
  assert.deepEqual(plan.conflicts.map((row) => [row.code, row.label, row.lms, row.excel]), [["HV0023", "Địa chỉ", "Hà Nội", "Hải Phòng"]]);
  assert.equal(plan.next.find((row) => row.id === "s2")!.parentName, "NG Thị Nguyệt", "câu thay thế phụ huynh trống không ghi đè");
  assert.equal(plan.created.length, 1);
  assert.deepEqual([plan.created[0].student.code, plan.created[0].student.fullName, plan.created[0].student.parentPhone1, plan.created[0].student.status], ["HV0066", "Lê Bảo Anh", "0912345678", "UNASSIGNED"]);
  // Dòng 4 không mã, trùng tên + SĐT với HV0065 (đã có ở dòng 2) → không tạo học viên trùng.
  assert.ok(plan.warnings.some((text) => /trùng tên \+ SĐT với HV0065/.test(text)));
  assert.ok(plan.errors.some((text) => /Dòng 5: HV0065 đã xuất hiện/.test(text)), JSON.stringify(plan.errors));
  assert.equal(plan.next.length, 3);
  assert.equal(plan.unchanged, 1, "HV0065 không có gì mới");
  // Dòng không mã trùng tên + SĐT với học viên chưa xuất hiện → bổ sung ô trống cho người đó.
  const solo = planStudentImport([{ line: 2, code: "", fullName: "nguyễn minh trí", values: { parentPhone1: "0362436862", address: "Huế" } }], students, () => "x");
  assert.equal(solo.created.length, 0);
  assert.equal(solo.next.find((row) => row.id === "s2")!.address, "Huế");
});

test("nhập Excel học viên: thiếu tiêu đề hoặc mã lặp", () => {
  assert.match(parseStudentSheet([["a", "b"]]).error || "", /Mã HV/);
  const plan = planStudentImport([
    { line: 2, code: "HV0023", fullName: "Nguyễn Thị Cẩm Ly", values: {} },
    { line: 3, code: "HV0023", fullName: "Nguyễn Thị Cẩm Ly", values: { address: "X" } },
  ], students, () => "x");
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.next.find((row) => row.id === "s1")!.address, "Hà Nội");
});
