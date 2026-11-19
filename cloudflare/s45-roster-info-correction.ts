import type { DemoClass } from "./operations-types";
import type { DemoStudent } from "./people-types";

export const S45_CLASS_ID = "class-f3c5be58-1a42-4a38-98c4-33643f2881fc";

// Giá trị đúng theo Excel S45 (ảnh đọc lại rõ nét — bản v1 đọc nhầm một số ô).
// Chỉ ghi khi trường đang trống hoặc đang chứa đúng giá trị v1 đã ghi nhầm;
// tuyệt đối không đè dữ liệu web khác (SĐT1, tên phụ huynh, trạng thái).
const S45_INFO_PATCH: Readonly<Record<string, {
  dateOfBirth?: string;
  parentPhone2?: string;
  nationalId?: string;
  address?: string;
}>> = {
  HV0990: { dateOfBirth: "2020-03-25", parentPhone2: "0936042668", nationalId: "042189008717", address: "Tổ Dân Phố 25, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV0992: { address: "Tổ dân phố 27, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV0993: { dateOfBirth: "2020-05-02", parentPhone2: "0983908809", nationalId: "040194035429", address: "Số nhà 71, Đường Lý Tự Trọng, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV0994: { dateOfBirth: "2020-09-24", parentPhone2: "0375052518", nationalId: "042196015860", address: "Tổ dân phố 25, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV0995: { dateOfBirth: "2020-09-13", parentPhone2: "0983560583", nationalId: "042092001171", address: "Tổ Dân Phố 24, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV0997: { dateOfBirth: "2020-12-15", parentPhone2: "0832805447", nationalId: "042189002511", address: "Tổ Dân Phố 22, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV0998: { dateOfBirth: "2020-07-03", parentPhone2: "0916070858", nationalId: "042193004133", address: "Tổ Dân Phố 27, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV0999: { dateOfBirth: "2020-10-31", parentPhone2: "0978329782", nationalId: "042193003574", address: "Tổ Dân Phố 12, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV1000: { dateOfBirth: "2020-04-22", parentPhone2: "0353717646", nationalId: "042196015012", address: "Tổ Dân Phố 2 Khương, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV1001: { dateOfBirth: "2020-10-11", parentPhone2: "0916302595", nationalId: "042192017178", address: "Tổ Dân Phố 3, Ngõ 01, Đường Lê Ninh, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
  HV1002: { dateOfBirth: "2020-02-19", parentPhone2: "0973809196", nationalId: "042192003834", address: "Số 63 Hà Bắc, Xã Thạch Lạc, Tỉnh Hà Tĩnh" },
  HV0960: { dateOfBirth: "2020-03-20", parentPhone2: "094446875", nationalId: "042197004003" },
  HV0973: { dateOfBirth: "2020-02-15", parentPhone2: "0914838180", nationalId: "042182003210", address: "Số Nhà 13, Ngõ 9, Đường Hữu Tập, Phường Thanh Sen, Tỉnh Hà Tĩnh" },
};

// Giá trị v1 đã ghi nhầm lên web (ảnh đọc nhầm) — chỉ đè lại đúng các ô này
// bằng giá trị Excel đúng; ô nào web có giá trị khác (người dùng nhập) thì giữ.
const S45_V1_WRONG_VALUES: Readonly<Record<string, {
  dateOfBirth?: string;
  parentPhone2?: string;
  nationalId?: string;
  address?: string;
}>> = {
  HV0990: { parentPhone2: "0930426688", nationalId: "042198008717" },
  HV0993: { dateOfBirth: "2020-03-02", parentPhone2: "0983908888", nationalId: "040194094529" },
  HV0994: { dateOfBirth: "2020-09-14", parentPhone2: "0976252521", nationalId: "042089051581" },
  HV0995: { nationalId: "042192001171" },
  HV0997: { dateOfBirth: "2020-08-20", nationalId: "042198200511" },
  HV0998: { dateOfBirth: "2020-08-03", parentPhone2: "0353170646" },
  HV0999: { dateOfBirth: "2020-10-01" },
  HV1001: { dateOfBirth: "2020-08-06", nationalId: "042192001218" },
  HV1002: { dateOfBirth: "2020-03-09", parentPhone2: "0968058518" },
  HV0960: { dateOfBirth: "2020-03-26" },
  HV0973: { parentPhone2: "0943838180", nationalId: "042192002500" },
};

// Sửa chính tả tên theo Excel. Key = tên đang có trên web → giá trị đúng.
// Chỉ đổi khi tên hiện tại khớp một biến thể đã biết (không đè tên người dùng
// tự sửa khác).
const S45_NAME_FIXES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // v1 sửa nhầm Thái→Thị; Excel ghi "Thái" → trả lại đúng.
  HV0990: { "Nguyễn Thị Minh Châu": "Nguyễn Thái Minh Châu" },
  HV0999: { "Trần Nguyên Minh Khuê": "Trần Nguyễn Minh Khuê" },
  HV1000: { "Nguyễn Viết Quang Đăng": "Nguyễn Viết Đăng Quang" },
};

// 2 bạn trên danh sách S45 chưa có hồ sơ trong hệ thống — tạo mới và xếp vào
// lớp. Mã học viên tiếp nối dãy hiện có (lớn nhất HV1013).
const S45_NEW_STUDENTS: ReadonlyArray<DemoStudent> = [
  { id: "student-import-1014", code: "HV1014", fullName: "Hoàng Trọng Đức Anh", phone: "0943739895", address: "Xóm Sơn Hà, Xã Thạch Lạc, Tỉnh Hà Tĩnh", school: "", parentZalo: "0943739895", parentPhone1: "0943739895", parentPhone2: "0906586331", status: "STUDYING", dateOfBirth: "2020-04-01", parentName: "Trương Thị Trang", nationalId: "042193002338", note: "" },
  { id: "student-import-1015", code: "HV1015", fullName: "Phạm Đăng Khoa", phone: "0932321639", address: "", school: "", parentZalo: "0932321639", parentPhone1: "0932321639", parentPhone2: "0947094917", status: "STUDYING", dateOfBirth: "2020-04-20", parentName: "Trịnh Thị Minh Thủy", nationalId: "04219604014", note: "" },
];

// Giá trị v1 đã tạo sai cho HV1014 (hồ sơ mới nên đè thẳng, không có dữ liệu
// người dùng nào bên trong).
const HV1014_V1: Record<string, string> = {
  phone: "0950586311", parentZalo: "0950586311", parentPhone1: "0950586311",
  parentName: "Phương Trang", nationalId: "042192002318",
};

function patchField<T extends string>(
  current: T | undefined,
  correct: T | undefined,
  v1: T | undefined,
): T | undefined {
  if (!correct || current === correct) return current;
  if (!current || current === v1) return correct;
  return current;
}

/**
 * Điền trường còn trống/sai theo Excel cho học viên S45, sửa chính tả tên,
 * tạo Đức Anh + Đăng Khoa và xếp vào lớp. Idempotent: chạy lại không đổi gì.
 */
export function s45RosterInfoCorrection(
  students: DemoStudent[],
  classes: DemoClass[],
): { students: DemoStudent[]; classes: DemoClass[] } {
  const cls = classes.find((row) => row.id === S45_CLASS_ID);
  if (!cls) return { students, classes };

  const newStudents = S45_NEW_STUDENTS;
  const byCode = new Map(newStudents.map((row) => [row.code, row]));
  const knownCodes = new Set(students.map((row) => String(row.code || "").trim().toUpperCase()));

  const patched = students.map((row) => {
    const code = String(row.code || "").trim().toUpperCase();
    const patch = S45_INFO_PATCH[code];
    const v1 = S45_V1_WRONG_VALUES[code];
    const nameFixes = S45_NAME_FIXES[code];
    const isNewStudent = byCode.has(code);
    if (!patch && !nameFixes && !isNewStudent) return row;
    const next = { ...row };
    if (nameFixes) {
      const fixed = nameFixes[String(next.fullName || "").trim()];
      if (fixed) next.fullName = fixed;
    }
    if (patch) {
      next.dateOfBirth = patchField(next.dateOfBirth, patch.dateOfBirth, v1?.dateOfBirth);
      next.parentPhone2 = patchField(next.parentPhone2, patch.parentPhone2, v1?.parentPhone2);
      next.nationalId = patchField(next.nationalId, patch.nationalId, v1?.nationalId);
      next.address = patchField(next.address, patch.address, v1?.address);
    }
    // HV1014 do v1 tạo với thông tin sai — sửa thẳng theo Excel.
    if (code === "HV1014") {
      next.phone = patchField(next.phone, "0943739895", HV1014_V1.phone);
      next.parentZalo = patchField(next.parentZalo, "0943739895", HV1014_V1.parentZalo);
      next.parentPhone1 = patchField(next.parentPhone1, "0943739895", HV1014_V1.parentPhone1);
      next.parentPhone2 = patchField(next.parentPhone2, "0906586331", "");
      next.parentName = patchField(next.parentName, "Trương Thị Trang", HV1014_V1.parentName);
      next.nationalId = patchField(next.nationalId, "042193002338", HV1014_V1.nationalId);
      next.dateOfBirth = patchField(next.dateOfBirth, "2020-04-01", "");
    }
    return next;
  });

  const created = newStudents.filter((row) => !knownCodes.has(String(row.code || "").trim().toUpperCase()));
  const nextStudents = created.length ? [...patched, ...created] : patched;

  const roster = new Set(cls.studentIds || []);
  let classChanged = false;
  for (const row of nextStudents) {
    if (byCode.has(String(row.code || "").trim().toUpperCase()) && !roster.has(row.id)) {
      roster.add(row.id);
      classChanged = true;
    }
  }
  const nextClasses = classChanged
    ? classes.map((item) => item.id === S45_CLASS_ID ? { ...item, studentIds: [...roster] } : item)
    : classes;

  return { students: nextStudents, classes: nextClasses };
}
