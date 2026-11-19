import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("cloudflare/public/app.js", "utf8");
const helperStart = source.indexOf("function normalizePeopleSearch");
const helperEnd = source.indexOf("function peopleActions", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "student filter helpers must exist");

const helpers = new Function(`${source.slice(helperStart, helperEnd)}; return { normalizePeopleSearch, filterStudents };`)() as {
  normalizePeopleSearch: (value: unknown) => string;
  filterStudents: (students: Array<Record<string, unknown>>, query: string, status: string) => Array<Record<string, unknown>>;
};

const students = Array.from({ length: 942 }, (_, index) => ({
  id: `student-${index + 1}`,
  code: `HV${String(index + 1).padStart(4, "0")}`,
  fullName: `Học viên ${index + 1}`,
  phone: "",
  school: "",
  parentZalo: "",
  parentName: "",
  address: "",
  status: index % 2 ? "STUDYING" : "UNASSIGNED",
}));

students[890] = {
  ...students[890],
  code: "HV0891",
  fullName: "Khánh Hùng",
  phone: "0905 123 456",
  school: "Trường Tiểu học Nguyễn Du",
  parentZalo: "Zalo mẹ Hương",
  address: "Hà Tĩnh",
  status: "PAUSED",
};

test("student search is accent-insensitive and works on a large production-sized list", () => {
  assert.equal(helpers.normalizePeopleSearch("Đặng Khánh"), "dang khanh");
  assert.deepEqual(helpers.filterStudents(students, "khanh hung", "").map((item) => item.code), ["HV0891"]);
  assert.deepEqual(helpers.filterStudents(students, "nguyen du", "").map((item) => item.code), ["HV0891"]);
  assert.deepEqual(helpers.filterStudents(students, "0905 123", "").map((item) => item.code), ["HV0891"]);
});

test("student status and text filters can be combined", () => {
  assert.equal(helpers.filterStudents(students, "", "PAUSED").length, 1);
  assert.equal(helpers.filterStudents(students, "HV0891", "paused").length, 1);
  assert.equal(helpers.filterStudents(students, "HV0891", "STUDYING").length, 0);
});

test("student page has an independent filter form and working controls", () => {
  assert.match(source, /id="student-filter-form"/);
  assert.match(source, /studentFilterForm\?\.addEventListener\("submit"/);
  assert.match(source, /querySelector\("\[name='status'\]"\)\?\.addEventListener\("change"/);
  assert.match(source, /data-action="clear-student-filters"/);
});

test("students export button and Excel columns", async () => {
  assert.match(source, /data-students-export/);
  assert.match(source, /<th>STT<\/th><th>Mã HV<\/th><th>Tên học viên<\/th><th>Mã lớp<\/th><th>Tên phụ huynh<\/th><th>Số điện thoại<\/th><th>CCCD<\/th><th>Địa chỉ<\/th>/);
  const fnStart = source.indexOf("function exportStudentsExcel");
  let fnEnd = source.indexOf("function studentClasses", fnStart);
  fnEnd = source.indexOf("\nfunction", source.indexOf("}", fnEnd) + 1);
  const state = {
    data: {
      students: [
        { id: "s1", code: "HV0001", fullName: "Khánh An", parentName: "Nguyễn Thị Huyền", parentPhone1: "0385116258", parentPhone2: "0385116258", nationalId: "038112345678", address: "Thạch Khê" },
        { id: "s2", code: "HV0002", fullName: "Bảo Nam", parentZalo: "0912", nationalId: "", address: "" },
      ],
      classes: [
        { id: "c1", code: "T4", studentIds: ["s1"] },
        { id: "c2", code: "S6", studentIds: ["s1"] },
      ],
    },
  };
  let html = "";
  let name = "";
  const BlobStub = class {
    constructor(parts: string[]) { html = parts.join(""); }
  };
  const link = { href: "", download: "", click() { name = this.download; } };
  const URLStub = { createObjectURL: () => "blob:x", revokeObjectURL: () => {} };
  const escapeHtml = (v: unknown) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  new Function("state", "escapeHtml", "toast", "Blob", "document", "URL", "setTimeout", "localDateKey",
    `${source.slice(fnStart, fnEnd)}\nreturn exportStudentsExcel();`,
  ).call(
    null, state, escapeHtml, () => {}, BlobStub, { createElement: () => link }, URLStub,
    (cb: () => void) => cb(), (d: Date) => d.toISOString().slice(0, 10),
  );
  assert.match(name, /^DSHV-tat-ca-.*\.xls$/);
  assert.match(html, /HV0001/);
  assert.match(html, /Khánh An/);
  assert.match(html, />T4, S6</); // học viên ở 2 lớp → nối mã lớp
  assert.match(html, /Nguyễn Thị Huyền/);
  assert.match(html, /Khách hàng chưa cung cấp thông tin/); // s2 không có phụ huynh
  assert.match(html, /038112345678/);
  assert.match(html, /Thạch Khê/);
  // Cùng SĐT 1 và 2 phải được gộp một lần, không lặp "x / x".
  assert.match(html, />0385116258</);
  assert.doesNotMatch(html, /0385116258 \/ 0385116258/);
  // Fallback SĐT từ parentZalo khi thiếu parentPhone1/phone.
  assert.match(html, />0912</);
  assert.ok((html.match(/<tr>/g) || []).length >= 3); // header + 2 học viên
});
