import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.STEPS_PROD_URL
  || "http://sqwjepnuzk3jz7x4xmap9hcn.149.28.131.241.sslip.io";
const EMAIL = process.env.STEPS_PROD_EMAIL;
const PASSWORD = process.env.STEPS_PROD_PASSWORD;
const APPLY = process.argv.includes("--apply");

if (!EMAIL || !PASSWORD) {
  throw new Error("Thiếu STEPS_PROD_EMAIL / STEPS_PROD_PASSWORD.");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function jsonRequest(pathname, cookie, init = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${pathname} trả về dữ liệu không phải JSON (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`${pathname} thất bại (${response.status}): ${payload?.error || raw}`);
  }
  return { payload, response };
}

async function login() {
  const { response } = await jsonRequest("/api/login", "", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0] || "";
  if (!cookie) throw new Error("Đăng nhập thành công nhưng không nhận được cookie.");
  return cookie;
}

async function readState(cookie) {
  const [classResult, studentResult, financeResult] = await Promise.all([
    jsonRequest("/api/classes", cookie),
    jsonRequest("/api/students", cookie),
    jsonRequest("/api/finance", cookie),
  ]);
  return {
    classes: classResult.payload.items || [],
    students: studentResult.payload.items || [],
    finance: financeResult.payload.finance || {},
  };
}

function exactClass(classes, code) {
  const rows = classes.filter((row) => normalize(row.code).replaceAll(" ", "") === normalize(code).replaceAll(" ", ""));
  if (rows.length !== 1) throw new Error(`Cần đúng 1 lớp ${code}, hiện tìm thấy ${rows.length}.`);
  return rows[0];
}

function exactStudent(students, fullName) {
  const rows = students.filter((row) => normalize(row.fullName) === normalize(fullName));
  if (rows.length !== 1) throw new Error(`Cần đúng 1 học viên tên “${fullName}”, hiện tìm thấy ${rows.length}.`);
  return rows[0];
}

function memberships(classes, studentId) {
  return classes.filter((row) => (row.studentIds || []).includes(studentId)).map((row) => row.code);
}

function assertTransferState(source, target, student) {
  const inSource = (source.studentIds || []).includes(student.id);
  const inTarget = (target.studentIds || []).includes(student.id);
  if (inSource === inTarget) {
    throw new Error(`${student.code} phải chỉ thuộc một trong hai lớp ${source.code}/${target.code}; hiện source=${inSource}, target=${inTarget}.`);
  }
  return inTarget ? "ALREADY_DONE" : "READY";
}

function nextStudentCode(students) {
  const max = students.reduce((result, row) => {
    const match = String(row.code || "").toUpperCase().match(/^HV(\d+)$/);
    return match ? Math.max(result, Number(match[1])) : result;
  }, 0);
  let number = max + 1;
  const used = new Set(students.map((row) => String(row.code || "").toUpperCase()));
  while (used.has(`HV${String(number).padStart(4, "0")}`)) number += 1;
  return `HV${String(number).padStart(4, "0")}`;
}

async function transfer(cookie, sourceCode, targetCode, studentName) {
  const current = await readState(cookie);
  const source = exactClass(current.classes, sourceCode);
  const target = exactClass(current.classes, targetCode);
  const student = exactStudent(current.students, studentName);
  const state = assertTransferState(source, target, student);
  if (state === "ALREADY_DONE") {
    return { action: "SKIPPED_ALREADY_DONE", studentId: student.id, studentCode: student.code };
  }
  const oldBalance = student.sessionBalances?.[source.id];
  await jsonRequest("/api/classes/transfer-student", cookie, {
    method: "POST",
    body: JSON.stringify({ sourceClassId: source.id, targetClassId: target.id, studentId: student.id }),
  });
  return { action: "TRANSFERRED", studentId: student.id, studentCode: student.code, oldBalance };
}

async function addNewXuanKhoaToT21(cookie) {
  let current = await readState(cookie);
  let t21 = exactClass(current.classes, "T21");
  let matches = current.students.filter((row) => normalize(row.fullName) === "xuan khoa");
  if (matches.length > 1) throw new Error(`Có ${matches.length} hồ sơ tên chính xác Xuân Khoa; dừng để tránh trùng.`);

  let student = matches[0];
  let created = false;
  if (!student) {
    student = {
      id: `student-${randomUUID()}`,
      code: nextStudentCode(current.students),
      fullName: "Xuân Khoa",
      phone: "",
      address: "",
      school: "",
      parentZalo: "",
      status: "STUDYING",
      dateOfBirth: "",
      parentName: "",
      note: "",
      loginEmail: "",
      loginPassword: "",
      sessionBalances: {},
      tuitionCredits: {},
      tuitionPaidThrough: {},
    };
    await jsonRequest("/api/students", cookie, {
      method: "PUT",
      body: JSON.stringify({ items: [...current.students, student] }),
    });
    created = true;
    current = await readState(cookie);
    student = exactStudent(current.students, "Xuân Khoa");
    t21 = exactClass(current.classes, "T21");
  }

  const currentMemberships = memberships(current.classes, student.id);
  if ((t21.studentIds || []).includes(student.id)) {
    return { action: created ? "CREATED_AND_ALREADY_ADDED" : "SKIPPED_ALREADY_DONE", studentId: student.id, studentCode: student.code };
  }
  if (currentMemberships.length) {
    throw new Error(`Hồ sơ Xuân Khoa đã thuộc lớp ${currentMemberships.join(", ")}; không tự động dùng lại làm học viên mới T21.`);
  }
  const classes = current.classes.map((row) => row.id === t21.id
    ? { ...row, studentIds: [...new Set([...(row.studentIds || []), student.id])] }
    : row);
  await jsonRequest("/api/classes", cookie, {
    method: "PUT",
    body: JSON.stringify({ items: classes, syncFinance: false }),
  });
  return { action: created ? "CREATED_AND_ADDED" : "ADDED_EXISTING_PARTIAL", studentId: student.id, studentCode: student.code };
}

function verification(state, before) {
  const s34 = exactClass(state.classes, "S34");
  const s27 = exactClass(state.classes, "S27");
  const s13 = exactClass(state.classes, "S13");
  const s12 = exactClass(state.classes, "S12");
  const t21 = exactClass(state.classes, "T21");
  const linhDan = exactStudent(state.students, "Linh Đan 24");
  const xuanKhoa12 = exactStudent(state.students, "Xuân Khoa12");
  const xuanKhoaNew = exactStudent(state.students, "Xuân Khoa");
  const checks = {
    linhDanLeftS34: !(s34.studentIds || []).includes(linhDan.id),
    linhDanInS27: (s27.studentIds || []).includes(linhDan.id),
    linhDanBalanceMoved: linhDan.sessionBalances?.[s27.id] === 7 && linhDan.sessionBalances?.[s34.id] === undefined,
    xuanKhoa12LeftS13: !(s13.studentIds || []).includes(xuanKhoa12.id),
    xuanKhoa12InS12: (s12.studentIds || []).includes(xuanKhoa12.id),
    xuanKhoa12BalanceMoved: xuanKhoa12.sessionBalances?.[s12.id] === 8 && xuanKhoa12.sessionBalances?.[s13.id] === undefined,
    newXuanKhoaInT21: (t21.studentIds || []).includes(xuanKhoaNew.id),
    newXuanKhoaOnlyT21: memberships(state.classes, xuanKhoaNew.id).length === 1,
    studentCountIncreasedByOne: state.students.length === before.students.length + (before.students.some((row) => normalize(row.fullName) === "xuan khoa") ? 0 : 1),
    financeUnchanged: digest(state.finance) === digest(before.finance),
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  if (failed.length) throw new Error(`Xác minh sau ghi thất bại: ${failed.join(", ")}`);
  return {
    checks,
    counts: {
      S34: s34.studentIds.length,
      S27: s27.studentIds.length,
      S13: s13.studentIds.length,
      S12: s12.studentIds.length,
      T21: t21.studentIds.length,
      students: state.students.length,
    },
    students: {
      linhDan: { id: linhDan.id, code: linhDan.code, name: linhDan.fullName, classes: memberships(state.classes, linhDan.id), balance: linhDan.sessionBalances?.[s27.id] },
      xuanKhoa12: { id: xuanKhoa12.id, code: xuanKhoa12.code, name: xuanKhoa12.fullName, classes: memberships(state.classes, xuanKhoa12.id), balance: xuanKhoa12.sessionBalances?.[s12.id] },
      xuanKhoaNew: { id: xuanKhoaNew.id, code: xuanKhoaNew.code, name: xuanKhoaNew.fullName, classes: memberships(state.classes, xuanKhoaNew.id), status: xuanKhoaNew.status },
    },
  };
}

async function main() {
  const cookie = await login();
  const before = await readState(cookie);
  const s34 = exactClass(before.classes, "S34");
  const s27 = exactClass(before.classes, "S27");
  const s13 = exactClass(before.classes, "S13");
  const s12 = exactClass(before.classes, "S12");
  const t21 = exactClass(before.classes, "T21");
  const linhDan = exactStudent(before.students, "Linh Đan 24");
  const xuanKhoa12 = exactStudent(before.students, "Xuân Khoa12");
  const exactNew = before.students.filter((row) => normalize(row.fullName) === "xuan khoa");
  const plan = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    transfers: [
      { student: `${linhDan.code} – ${linhDan.fullName}`, from: s34.code, to: s27.code, balance: linhDan.sessionBalances?.[s34.id], state: assertTransferState(s34, s27, linhDan) },
      { student: `${xuanKhoa12.code} – ${xuanKhoa12.fullName}`, from: s13.code, to: s12.code, balance: xuanKhoa12.sessionBalances?.[s13.id], state: assertTransferState(s13, s12, xuanKhoa12) },
    ],
    newStudent: {
      name: "Xuân Khoa",
      class: t21.code,
      existingExactProfiles: exactNew.length,
      newCodeIfCreated: exactNew.length ? null : nextStudentCode(before.students),
      classBillingMode: t21.billingMode || null,
      classStudentCount: t21.studentIds.length,
      financeSync: false,
    },
  };
  if (!APPLY) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(scriptDir, "..", "tmp", "production-backups", `roster-before-${stamp}.json`);
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    productionUrl: BASE,
    reason: "Trước khi chuyển Linh Đan S34→S27, Xuân Khoa12 S13→S12 và thêm Xuân Khoa mới vào T21",
    checksums: {
      classes: digest(before.classes),
      students: digest(before.students),
      finance: digest(before.finance),
    },
    classes: before.classes,
    students: before.students,
    finance: before.finance,
  }, null, 2), "utf8");

  const results = [];
  results.push(await transfer(cookie, "S34", "S27", "Linh Đan 24"));
  results.push(await transfer(cookie, "S13", "S12", "Xuân Khoa12"));
  results.push(await addNewXuanKhoaToT21(cookie));
  const after = await readState(cookie);
  const verified = verification(after, before);
  console.log(JSON.stringify({ ok: true, backupPath, plan, results, verified }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
