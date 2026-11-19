import type { Prisma } from "@/generated/prisma/client";
import type { ClassStatus, ClassType, EnrollmentStatus } from "@/generated/prisma/enums";

import { diff, undoCreate, undoUpdate, undoUpdateAlso, writeAudit } from "@/lib/audit";
import { syncStudentStatus } from "@/lib/enrollment";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/form-utils";
import { recalcTuition } from "@/lib/tuition";
import { STATUS_TONE } from "@/components/ui/badge";
import { readXlsx, writeXlsx, type Sheet } from "@/lib/xlsx-mini";

/** Tên sheet trong file mẫu — học vụ không được đổi. */
export const STUDENT_SHEET = "HocVien";
export const CLASS_SHEET = "Lop";

export const STUDENT_HEADERS = [
  "Mã học viên",
  "Họ và tên",
  "Ngày sinh",
  "Tên phụ huynh",
  "SĐT phụ huynh",
  "Địa chỉ",
  "Ghi chú",
  "Mã lớp",
  "Học phí",
] as const;

const MAX_ROWS = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Header = (typeof STUDENT_HEADERS)[number];

type IeltsTuition = { kind: "IELTS"; paid: boolean };
type NormalTuition = { kind: "NORMAL"; remaining: number };
type TuitionValue = IeltsTuition | NormalTuition;

type RawRow = {
  excelRow: number;
  code: string | null;
  fullName: string;
  dateOfBirthRaw: string;
  parentName: string | null;
  parentPhone: string | null;
  address: string | null;
  note: string | null;
  classCode: string;
  tuitionRaw: string;
};

type ClassRef = {
  id: string;
  code: string;
  name: string;
  type: ClassType;
  status: ClassStatus;
  ieltsCourseId: string | null;
};

type StudentRef = {
  id: string;
  code: string;
  fullName: string;
  dateOfBirth: Date | null;
  parentName: string | null;
  parentPhone: string | null;
  address: string | null;
  note: string | null;
  enrollments: {
    id: string;
    classId: string;
    status: EnrollmentStatus;
    // Giữ để hoàn tác được lần ghi danh cũ bị bật lại thành ACTIVE.
    leftAt: Date | null;
    joinedAt: Date;
    classCode: string;
    tuitionId: string | null;
  }[];
};

function norm(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function parseDate(raw: string, excelRow: number, errors: string[]) {
  if (!raw) return null;
  const serialText = raw.replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(serialText)) {
    const serial = Number(serialText);
    if (serial >= 1 && serial < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
      if (Number.isNaN(date.getTime())) {
        errors.push(`Dòng ${excelRow}: Ngày sinh không hợp lệ.`);
        return null;
      }
      return date;
    }
  }
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      errors.push(`Dòng ${excelRow}: Ngày sinh không hợp lệ.`);
      return null;
    }
    return date;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      errors.push(`Dòng ${excelRow}: Ngày sinh không hợp lệ.`);
      return null;
    }
    return date;
  }
  errors.push(`Dòng ${excelRow}: Ngày sinh phải có dạng dd/mm/yyyy.`);
  return null;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseIeltsTuition(raw: string): IeltsTuition | null {
  const key = fold(raw);
  if (key === "con no") return { kind: "IELTS", paid: false };
  if (key === "da dong du" || key === "da thanh toan du") {
    return { kind: "IELTS", paid: true };
  }
  return null;
}

function parseRemaining(raw: string): number | null {
  const text = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.0+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < -999 || n > 9999) return null;
  return n;
}

function nextStudentCode(used: Set<string>) {
  let max = 0;
  for (const code of used) {
    if (!code.toUpperCase().startsWith("HV")) continue;
    const n = Number.parseInt(code.slice(2), 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  let next = max + 1;
  let code = `HV${String(next).padStart(4, "0")}`;
  while (used.has(code.toUpperCase())) {
    next += 1;
    code = `HV${String(next).padStart(4, "0")}`;
  }
  used.add(code.toUpperCase());
  return code;
}

function currentEnrollment(student: StudentRef) {
  return student.enrollments.find((item) => item.status === "ACTIVE" || item.status === "RESERVED");
}

function filled(value: string | null | undefined) {
  return value != null && value.trim() !== "";
}

function formatErrors(errors: string[]) {
  const shown = errors.slice(0, 40);
  const extra = errors.length > 40 ? `\n… và ${errors.length - 40} lỗi nữa.` : "";
  return `File có ${errors.length} lỗi, chưa nhập dòng nào.\n${shown.join("\n")}${extra}`;
}

/** File mẫu: sheet HocVien (học vụ điền) + sheet Lop (danh sách lớp đang có). */
export async function buildStudentImportTemplate(classes: ClassRef[]) {
  const classRows: string[][] = [["Mã lớp", "Tên lớp", "Loại", "Trạng thái"]];
  for (const cls of classes) {
    classRows.push([
      cls.code,
      cls.name,
      cls.type === "IELTS" ? STATUS_TONE.IELTS.label : STATUS_TONE.NORMAL.label,
      STATUS_TONE[cls.status].label,
    ]);
  }
  if (classes.length === 0) {
    classRows.push(["", "Chưa có lớp — tạo lớp trên web trước khi nhập học viên.", "", ""]);
  }
  return writeXlsx([
    { name: STUDENT_SHEET, rows: [ [...STUDENT_HEADERS] ] },
    { name: CLASS_SHEET, rows: classRows },
  ]);
}

function readStudentSheet(sheets: Sheet[]) {
  const sheet = sheets.find((item) => item.name === STUDENT_SHEET);
  if (!sheet) fail(`Không thấy sheet ${STUDENT_SHEET}. Hãy dùng file mẫu từ nút Tải mẫu nhập.`);

  const headerRow = (sheet.rows[0] ?? []).map((cell) => norm(cell.replace(/\u00a0/g, " ")));
  const indexByHeader = new Map<Header, number>();
  headerRow.forEach((title, col) => {
    if ((STUDENT_HEADERS as readonly string[]).includes(title)) {
      indexByHeader.set(title as Header, col);
    }
  });
  for (const header of STUDENT_HEADERS) {
    if (!indexByHeader.has(header)) {
      fail(`Thiếu cột "${header}". Hãy dùng file mẫu từ nút Tải mẫu nhập.`);
    }
  }

  const rows: RawRow[] = [];
  for (let i = 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] ?? [];
    const read = (header: Header) =>
      norm((row[indexByHeader.get(header)!] ?? "").replace(/\u00a0/g, " "));
    const code = read("Mã học viên");
    const fullName = read("Họ và tên");
    const dateOfBirthRaw = read("Ngày sinh");
    const parentName = read("Tên phụ huynh");
    const parentPhone = read("SĐT phụ huynh");
    const address = read("Địa chỉ");
    const note = read("Ghi chú");
    const classCode = read("Mã lớp");
    const tuitionRaw = read("Học phí");
    if (
      !code &&
      !fullName &&
      !dateOfBirthRaw &&
      !parentName &&
      !parentPhone &&
      !address &&
      !note &&
      !classCode &&
      !tuitionRaw
    ) {
      continue;
    }
    rows.push({
      excelRow: i + 1,
      code: code || null,
      fullName,
      dateOfBirthRaw,
      parentName: parentName || null,
      parentPhone: parentPhone || null,
      address: address || null,
      note: note || null,
      classCode,
      tuitionRaw,
    });
  }

  return rows;
}

async function loadWorkbook(file: File) {
  if (file.size > MAX_FILE_BYTES) fail("File quá lớn (tối đa 5MB).");
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx")) fail("Vui lòng chọn file .xlsx theo mẫu.");
  return readXlsx(Buffer.from(await file.arrayBuffer()));
}

type ValidRow = {
  excelRow: number;
  code: string | null;
  fullName: string;
  dateOfBirth: Date | null;
  parentName: string | null;
  parentPhone: string | null;
  address: string | null;
  note: string | null;
  classCode: string;
  tuition: TuitionValue;
  cls: ClassRef;
  existing: StudentRef | null;
};

/**
 * Đọc file, kiểm hết dòng, rồi ghi trong một giao dịch.
 * Có lỗi → không tạo học viên nào.
 */
export async function importStudentsFromExcel(
  db: typeof prisma,
  input: { file: File; userId: string },
) {
  const wb = await loadWorkbook(input.file);
  const rawRows = readStudentSheet(wb);
  if (rawRows.length === 0) fail(`Không có dòng học viên nào trong sheet ${STUDENT_SHEET}.`);
  if (rawRows.length > MAX_ROWS) fail(`File vượt quá ${MAX_ROWS} dòng.`);

  return db.$transaction(
    async (tx) => importRows(tx, rawRows, input.userId),
    { timeout: 120_000, maxWait: 10_000 },
  );
}

async function importRows(
  tx: Prisma.TransactionClient,
  rawRows: RawRow[],
  userId: string,
) {
  const [classes, students] = await Promise.all([
    tx.class.findMany({
      select: { id: true, code: true, name: true, type: true, status: true, ieltsCourseId: true },
    }),
    tx.student.findMany({
      select: {
        id: true,
        code: true,
        fullName: true,
        dateOfBirth: true,
        parentName: true,
        parentPhone: true,
        address: true,
        note: true,
        enrollments: {
          select: {
            id: true,
            classId: true,
            status: true,
            leftAt: true,
            joinedAt: true,
            class: { select: { code: true } },
            tuition: { select: { id: true } },
          },
        },
      },
    }),
  ]);

  const classByCode = new Map(classes.map((cls) => [cls.code.toUpperCase(), cls as ClassRef]));
  const studentByCode = new Map<string, StudentRef>(
    students.map((student) => [
      student.code.toUpperCase(),
      {
        ...student,
        enrollments: student.enrollments.map((enrollment) => ({
          id: enrollment.id,
          classId: enrollment.classId,
          status: enrollment.status,
          leftAt: enrollment.leftAt,
          joinedAt: enrollment.joinedAt,
          classCode: enrollment.class.code,
          tuitionId: enrollment.tuition?.id ?? null,
        })),
      },
    ]),
  );

  const errors: string[] = [];
  const seenCodes = new Map<string, number>();
  const valid: ValidRow[] = [];

  for (const row of rawRows) {
    if (!row.fullName) errors.push(`Dòng ${row.excelRow}: Họ và tên không được để trống.`);
    else if (row.fullName.length > 150) {
      errors.push(`Dòng ${row.excelRow}: Họ và tên tối đa 150 ký tự.`);
    }

    if (row.code && row.code.length > 30) {
      errors.push(`Dòng ${row.excelRow}: Mã học viên tối đa 30 ký tự.`);
    }
    if (row.code) {
      const key = row.code.toUpperCase();
      const first = seenCodes.get(key);
      if (first) errors.push(`Dòng ${row.excelRow}: Trùng mã học viên với dòng ${first}.`);
      else seenCodes.set(key, row.excelRow);
    }

    if (row.parentName && row.parentName.length > 150) {
      errors.push(`Dòng ${row.excelRow}: Tên phụ huynh tối đa 150 ký tự.`);
    }
    if (row.parentPhone && row.parentPhone.length > 50) {
      errors.push(`Dòng ${row.excelRow}: SĐT phụ huynh tối đa 50 ký tự.`);
    }
    if (row.address && row.address.length > 300) {
      errors.push(`Dòng ${row.excelRow}: Địa chỉ tối đa 300 ký tự.`);
    }
    if (row.note && row.note.length > 1000) {
      errors.push(`Dòng ${row.excelRow}: Ghi chú tối đa 1000 ký tự.`);
    }

    const dateOfBirth = parseDate(row.dateOfBirthRaw, row.excelRow, errors);

    if (!row.classCode) {
      errors.push(`Dòng ${row.excelRow}: Mã lớp không được để trống.`);
    }
    const cls = row.classCode ? classByCode.get(row.classCode.toUpperCase()) : undefined;
    if (row.classCode && !cls) {
      errors.push(`Dòng ${row.excelRow}: Mã lớp ${row.classCode} không có.`);
    }
    if (cls?.type === "IELTS" && !cls.ieltsCourseId) {
      errors.push(
        `Dòng ${row.excelRow}: Lớp ${cls.code} chưa chọn khóa IELTS — vào thông tin lớp chọn khóa trước.`,
      );
    }

    if (!row.tuitionRaw) {
      errors.push(`Dòng ${row.excelRow}: Học phí không được để trống.`);
    }

    let tuition: TuitionValue | null = null;
    if (cls && row.tuitionRaw) {
      if (cls.type === "IELTS") {
        tuition = parseIeltsTuition(row.tuitionRaw);
        if (!tuition) {
          errors.push(
            `Dòng ${row.excelRow}: Lớp IELTS — cột Học phí phải là "Còn nợ" hoặc "Đã đóng đủ".`,
          );
        }
      } else {
        const remaining = parseRemaining(row.tuitionRaw);
        if (remaining == null) {
          errors.push(
            `Dòng ${row.excelRow}: Lớp thường — cột Học phí phải là số buổi còn lại (âm, 0 hoặc dương).`,
          );
        } else {
          tuition = { kind: "NORMAL", remaining };
        }
      }
    }

    const existing = row.code ? (studentByCode.get(row.code.toUpperCase()) ?? null) : null;

    if (
      row.fullName &&
      row.fullName.length <= 150 &&
      cls &&
      tuition &&
      !(cls.type === "IELTS" && !cls.ieltsCourseId)
    ) {
      valid.push({
        excelRow: row.excelRow,
        code: row.code,
        fullName: row.fullName,
        dateOfBirth,
        parentName: row.parentName,
        parentPhone: row.parentPhone,
        address: row.address,
        note: row.note,
        classCode: cls.code,
        tuition,
        cls,
        existing,
      });
    }
  }

  if (errors.length > 0) fail(formatErrors(errors));

  const usedCodes = new Set([...studentByCode.keys()]);
  let created = 0;
  let updated = 0;
  let enrolled = 0;

  for (const row of valid) {
    const profile = {
      fullName: row.fullName,
      dateOfBirth: row.dateOfBirth,
      parentName: row.parentName,
      parentPhone: row.parentPhone,
      address: row.address,
      note: row.note,
    };

    let studentId: string;
    if (row.existing) {
      const next = {
        fullName: filled(row.fullName) ? row.fullName : row.existing.fullName,
        dateOfBirth: row.dateOfBirth ?? row.existing.dateOfBirth,
        parentName: filled(row.parentName) ? row.parentName : row.existing.parentName,
        parentPhone: filled(row.parentPhone) ? row.parentPhone : row.existing.parentPhone,
        address: filled(row.address) ? row.address : row.existing.address,
        note: filled(row.note) ? row.note : row.existing.note,
      };
      const changes = diff(row.existing as unknown as Record<string, unknown>, next);
      if (changes.hasChanges) {
        await tx.student.update({ where: { id: row.existing.id }, data: next });
        await writeAudit(
          {
            userId,
            action: "UPDATE",
            entity: "Student",
            entityId: row.existing.id,
            oldValue: changes.oldValue,
            newValue: changes.newValue,
            undo: undoUpdate(
              "student",
              row.existing.id,
              row.existing as unknown as Record<string, unknown>,
              Object.keys(changes.newValue),
              {
                label: `Hoàn tác? Hồ sơ ${row.existing.fullName} trở về các giá trị trước khi nhập Excel.`,
                after: { revalidate: [`/hoc-vien/${row.existing.id}`] },
              },
            ),
          },
          tx,
        );
        updated += 1;
      }
      studentId = row.existing.id;
    } else {
      const code = row.code?.trim() || nextStudentCode(usedCodes);
      if (row.code) usedCodes.add(row.code.toUpperCase());
      const createdStudent = await tx.student.create({
        // File Excel dùng để chuyển dữ liệu lịch sử; học viên nhập từ đây không
        // được tự động tính là doanh số đóng mới ở lần thu kế tiếp.
        data: { ...profile, code, isNewRevenueStudent: false },
      });
      await writeAudit(
        {
          userId,
          action: "CREATE",
          entity: "Student",
          entityId: createdStudent.id,
          newValue: { ...profile, code },
          // Xoá học viên kéo theo ghi danh và hồ sơ học phí sinh cùng dòng Excel này.
          undo: undoCreate(
            { model: "student", id: createdStudent.id },
            { label: `Hoàn tác? Học viên ${row.fullName} vừa nhập sẽ bị xoá cùng ghi danh và hồ sơ học phí.` },
          ),
        },
        tx,
      );
      created += 1;
      studentId = createdStudent.id;
    }

    const existing = row.existing;
    const current = existing ? currentEnrollment(existing) : undefined;
    const sameClass = existing?.enrollments.find(
      (item) => item.classId === row.cls.id,
    );

    if (current && current.classId !== row.cls.id) {
      // Đã có lớp khác — giữ lớp cũ, không xếp thêm.
    } else if (current && current.classId === row.cls.id) {
      if (!current.tuitionId) {
        await applyImportedTuition(tx, {
          enrollmentId: current.id,
          studentId,
          cls: row.cls,
          tuition: row.tuition,
        });
      }
    } else {
      // Lần ghi danh cũ ở đúng lớp này thì dùng lại bản ghi (R4), chỉ bật lại ACTIVE.
      const before = sameClass
        ? { status: sameClass.status, leftAt: sameClass.leftAt, joinedAt: sameClass.joinedAt }
        : null;
      const enrollment = sameClass
        ? await tx.enrollment.update({
            where: { id: sameClass.id },
            data: { status: "ACTIVE", leftAt: null, joinedAt: new Date() },
          })
        : await tx.enrollment.create({
            data: { studentId, classId: row.cls.id, status: "ACTIVE" },
          });
      const tuitionId = sameClass?.tuitionId
        ? null
        : await applyImportedTuition(tx, {
            enrollmentId: enrollment.id,
            studentId,
            cls: row.cls,
            tuition: row.tuition,
          });
      await writeAudit(
        {
          userId,
          action: "CREATE",
          entity: "Enrollment",
          entityId: enrollment.id,
          newValue: { studentId, classId: row.cls.id },
          undo: undoCreate(
            [
              ...(before ? [] : [{ model: "enrollment" as const, id: enrollment.id }]),
              ...(tuitionId ? [{ model: "studentTuition" as const, id: tuitionId }] : []),
            ],
            {
              label: before
                ? `Hoàn tác? ${row.fullName} trở lại trạng thái trước khi nhập Excel.`
                : `Hoàn tác? ${row.fullName} sẽ bị gỡ khỏi lớp ${row.cls.code} cùng hồ sơ học phí vừa sinh.`,
              ...(before
                ? {
                    also: [
                      undoUpdateAlso("enrollment", enrollment.id, before, [
                        "status",
                        "leftAt",
                        "joinedAt",
                      ]),
                    ],
                  }
                : {}),
              after: {
                syncStudentIds: [studentId],
                revalidate: [`/lop-hoc/${row.cls.id}`, `/hoc-vien/${studentId}`],
              },
            },
          ),
        },
        tx,
      );
      await syncStudentStatus(tx, studentId);
      enrolled += 1;
    }
  }

  return `Đã nhập ${created} học viên mới${updated ? `, cập nhật ${updated} hồ sơ` : ""}${
    enrolled ? `, xếp lớp ${enrolled} lượt` : ""
  }.`;
}

async function applyImportedTuition(
  tx: Prisma.TransactionClient,
  input: {
    enrollmentId: string;
    studentId: string;
    cls: ClassRef;
    tuition: TuitionValue;
  },
) {
  if (input.tuition.kind === "IELTS") {
    if (!input.cls.ieltsCourseId) fail("Lớp chưa chọn khóa IELTS.");
    const course = await tx.ieltsCourse.findUnique({
      where: { id: input.cls.ieltsCourseId },
      select: { id: true, name: true, price: true },
    });
    if (!course) fail("Không tìm thấy khóa IELTS của lớp.");

    const tuition = await tx.studentTuition.create({
      data: {
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        type: "IELTS",
        ieltsCourseId: course.id,
      },
    });
    await tx.tuitionEntry.create({
      data: {
        tuitionId: tuition.id,
        type: "BASE",
        amount: course.price,
        quantity: 1,
        note: `Khóa ${course.name} (trọn khóa)`,
      },
    });
    await recalcTuition(tuition.id, tx);
    if (!input.tuition.paid) return tuition.id;
    await tx.tuitionPayment.create({
      data: {
        tuitionId: tuition.id,
        amount: course.price,
        method: "OTHER",
        note: "Nhập từ Excel",
      },
    });
    await recalcTuition(tuition.id, tx);
    return tuition.id;
  }

  const remaining = input.tuition.remaining;
  const usedSessions = remaining < 0 ? -remaining : 0;
  const tuition = await tx.studentTuition.create({
    data: {
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      type: "NORMAL",
      totalSessions: Math.max(remaining, 0),
      usedSessions,
      extraSessions: usedSessions,
    },
  });
  return tuition.id;
}
