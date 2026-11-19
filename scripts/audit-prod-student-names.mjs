import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.STEPS_PROD_URL
  || "http://sqwjepnuzk3jz7x4xmap9hcn.149.28.131.241.sslip.io";
const EMAIL = process.env.STEPS_PROD_EMAIL;
const PASSWORD = process.env.STEPS_PROD_PASSWORD;
const APPLY = process.argv.includes("--apply");

if (!EMAIL || !PASSWORD) throw new Error("Thiếu STEPS_PROD_EMAIL / STEPS_PROD_PASSWORD.");

function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function duplicateKey(value) {
  return collapseSpaces(value).normalize("NFC").toLocaleLowerCase("vi-VN");
}

function collapseSpaces(value) {
  return String(value || "").trim().replace(/\s+/gu, " ");
}

function stripSuffix(value) {
  let result = collapseSpaces(value);
  let previous = "";
  while (result !== previous) {
    previous = result;
    result = result
      .replace(/\s*\([^()]*\)\s*$/u, "")
      .replace(/\s+[st]\s*\d+(?:\s+tp)?\s*$/iu, "")
      .replace(/(?<=[A-Za-z])[st]\s*\d+(?:\s+tp)?\s*$/iu, "")
      .replace(/\s*\d+\s*$/u, "")
      .trim();
  }
  return collapseSpaces(result);
}

function titleCase(value) {
  const lower = collapseSpaces(value).toLocaleLowerCase("vi-VN");
  return lower.replace(/(^|[\s'’\-])(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("vi-VN")}`);
}

function proposedName(value) {
  return titleCase(stripSuffix(value));
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function withoutNames(students) {
  return students.map(({ fullName: _fullName, ...student }) => student);
}

function withoutDerivedStudentNames(value) {
  if (Array.isArray(value)) return value.map(withoutDerivedStudentNames);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [
    name,
    name === "studentName" ? "<derived-student-name>" : withoutDerivedStudentNames(item),
  ]));
}

async function requestJson(pathname, cookie, init = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${pathname} thất bại (${response.status}): ${body?.error || "UNKNOWN"}`);
  return { body, response };
}

async function main() {
  const login = await requestJson("/api/login", "", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0] || "";
  if (!cookie) throw new Error("Không nhận được cookie đăng nhập.");
  const [studentResponse, classResponse, financeResponse] = await Promise.all([
    requestJson("/api/students", cookie),
    requestJson("/api/classes", cookie),
    requestJson("/api/finance", cookie),
  ]);
  const students = studentResponse.body.items || [];
  const classes = classResponse.body.items || [];
  const finance = financeResponse.body.finance || {};
  const classesByStudent = new Map();
  for (const cls of classes) {
    for (const studentId of cls.studentIds || []) {
      const items = classesByStudent.get(studentId) || [];
      items.push(cls.code);
      classesByStudent.set(studentId, items);
    }
  }

  const changes = students.map((student) => {
    const original = String(student.fullName || "");
    const stripped = stripSuffix(original);
    const proposed = proposedName(original);
    return {
      id: student.id,
      code: student.code,
      classes: classesByStudent.get(student.id) || [],
      original,
      proposed,
      suffixRemoved: collapseSpaces(original) !== stripped,
      spacingChanged: original !== collapseSpaces(original),
      casingChanged: stripped !== titleCase(stripped),
    };
  }).filter((row) => row.original !== row.proposed);

  const groups = new Map();
  for (const student of students) {
    const finalName = proposedName(student.fullName);
    const group = groups.get(duplicateKey(finalName)) || [];
    group.push({
      id: student.id,
      code: student.code,
      classes: classesByStudent.get(student.id) || [],
      original: student.fullName,
      proposed: finalName,
    });
    groups.set(duplicateKey(finalName), group);
  }
  const duplicateAfter = [...groups.values()]
    .filter((rows) => rows.length > 1)
    .sort((a, b) => a[0].proposed.localeCompare(b[0].proposed, "vi"));
  const introducedCollisions = duplicateAfter.filter((rows) => new Set(rows.map((row) => duplicateKey(row.original))).size > 1);
  const sameClassDuplicateGroups = duplicateAfter.map((rows) => {
    const classCounts = new Map();
    for (const row of rows) {
      for (const code of row.classes) classCounts.set(code, (classCounts.get(code) || 0) + 1);
    }
    const sharedClasses = [...classCounts.entries()].filter(([, count]) => count > 1).map(([code]) => code);
    return { name: rows[0].proposed, sharedClasses, rows };
  }).filter((group) => group.sharedClasses.length);
  const unresolvedSymbols = changes.filter((row) => /[^\p{L}\s'’\-]/u.test(row.proposed));
  const emptyNames = changes.filter((row) => !row.proposed);

  const report = {
    generatedAt: new Date().toISOString(),
    productionUrl: BASE,
    totals: {
      students: students.length,
      namesChanged: changes.length,
      suffixesRemoved: changes.filter((row) => row.suffixRemoved).length,
      casingFixed: changes.filter((row) => row.casingChanged).length,
      spacingFixed: changes.filter((row) => row.spacingChanged).length,
      duplicateNameGroupsAfterCleanup: duplicateAfter.length,
      collisionGroupsIntroducedByCleanup: introducedCollisions.length,
      duplicateGroupsInsideSameClass: sameClassDuplicateGroups.length,
      unresolvedSymbolNames: unresolvedSymbols.length,
      emptyNames: emptyNames.length,
    },
    introducedCollisions,
    sameClassDuplicateGroups,
    duplicateAfter,
    unresolvedSymbols,
    emptyNames,
    suffixChanges: changes.filter((row) => row.suffixRemoved),
    casingOnlyChanges: changes.filter((row) => !row.suffixRemoved && row.casingChanged),
    spacingOnlyChanges: changes.filter((row) => !row.suffixRemoved && !row.casingChanged && row.spacingChanged),
  };
  if (APPLY) {
    if (students.length !== 938 || ![0, 235].includes(changes.length)) {
      throw new Error(`Dữ liệu đã đổi sau bước kiểm tra: students=${students.length}, changes=${changes.length}. Dừng để kiểm tra lại.`);
    }
    if (emptyNames.length || unresolvedSymbols.length) {
      throw new Error("Còn tên rỗng hoặc ký tự chưa xử lý; không ghi production.");
    }
    const expectedConfirmedNames = new Map([
      ["HV0432", "Bảo Long"],
      ["HV0444", "Bảo Long"],
      ["HV0549", "Nguyễn Hoàng Quân"],
      ["HV0550", "Nguyễn Hoàng Quân"],
      ["HV0393", "Phúc Hưng"],
      ["HV0395", "Phúc Hưng"],
    ]);
    for (const [code, expected] of expectedConfirmedNames) {
      const student = students.find((row) => row.code === code);
      if (!student || proposedName(student.fullName) !== expected) {
        throw new Error(`Không khớp xác nhận cho ${code}; dừng trước khi ghi.`);
      }
    }
    if (changes.length === 0) {
      console.log(JSON.stringify({
        ok: true,
        alreadyNormalized: true,
        students: students.length,
        confirmedDuplicates: [...expectedConfirmedNames].map(([code, fullName]) => ({ code, fullName })),
      }, null, 2));
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const backupPath = join(scriptDir, "..", "tmp", "production-backups", `student-names-before-${stamp}.json`);
    mkdirSync(dirname(backupPath), { recursive: true });
    writeFileSync(backupPath, JSON.stringify({
      createdAt: new Date().toISOString(),
      productionUrl: BASE,
      reason: "Trước khi chuẩn hóa viết hoa và xóa hậu tố không thuộc tên của toàn bộ học viên",
      checksums: {
        students: digest(students),
        classes: digest(classes),
        finance: digest(finance),
      },
      students,
      classes,
      finance,
      proposedChanges: changes,
    }, null, 2), "utf8");

    const updatedStudents = students.map((student) => ({ ...student, fullName: proposedName(student.fullName) }));
    await requestJson("/api/students", cookie, {
      method: "PUT",
      body: JSON.stringify({ items: updatedStudents }),
    });

    const [afterStudentResponse, afterClassResponse, afterFinanceResponse] = await Promise.all([
      requestJson("/api/students", cookie),
      requestJson("/api/classes", cookie),
      requestJson("/api/finance", cookie),
    ]);
    const afterStudents = afterStudentResponse.body.items || [];
    const afterClasses = afterClassResponse.body.items || [];
    const afterFinance = afterFinanceResponse.body.finance || {};
    const failedNames = afterStudents.filter((student) => student.fullName !== proposedName(student.fullName));
    const checks = {
      studentCountUnchanged: afterStudents.length === students.length,
      onlyNamesChanged: digest(withoutNames(afterStudents)) === digest(withoutNames(students)),
      classesUnchanged: digest(afterClasses) === digest(classes),
      financeEconomicDataUnchanged: digest(withoutDerivedStudentNames(afterFinance)) === digest(withoutDerivedStudentNames(finance)),
      allNamesNormalized: failedNames.length === 0,
      allConfirmedDuplicatesKeptAsSeparateProfiles: [...expectedConfirmedNames].every(([code, expected]) => {
        const row = afterStudents.find((student) => student.code === code);
        return row?.fullName === expected;
      }),
    };
    const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failedChecks.length) {
      throw new Error(`Ghi xong nhưng xác minh thất bại: ${failedChecks.join(", ")}. Bản sao: ${backupPath}`);
    }
    console.log(JSON.stringify({
      ok: true,
      backupPath,
      appliedChanges: changes.length,
      suffixesRemoved: report.totals.suffixesRemoved,
      casingFixed: report.totals.casingFixed,
      spacingFixed: report.totals.spacingFixed,
      checks,
      confirmedDuplicates: [...expectedConfirmedNames].map(([code, fullName]) => ({ code, fullName })),
    }, null, 2));
    return;
  }
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify({
      generatedAt: report.generatedAt,
      totals: report.totals,
      sameClassDuplicateGroups,
      introducedCollisionSummary: introducedCollisions.map((rows) => ({
        name: rows[0].proposed,
        profiles: rows.map(({ code, classes, original }) => ({ code, classes, original })),
      })),
      casingOnlyChanges: report.casingOnlyChanges,
      spacingOnlyChanges: report.spacingOnlyChanges,
      emptyNames,
      unresolvedSymbols,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
