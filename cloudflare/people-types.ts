export type StudentStatus = "UNASSIGNED" | "STUDYING" | "STOPPED";

export interface DemoStudent {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  address: string;
  school: string;
  parentZalo: string;
  /** Số điện thoại liên hệ phụ huynh chính. `phone` vẫn được giữ làm trường tương thích. */
  parentPhone1?: string;
  /** Số điện thoại liên hệ phụ huynh dự phòng. */
  parentPhone2?: string;
  status: StudentStatus;
  dateOfBirth?: string;
  parentName?: string;
  nationalId?: string;
  note?: string;
  loginEmail?: string;
  loginPassword?: string;
  /** Học viên được học theo tiến độ lớp nhưng không phát sinh công nợ học phí. */
  tuitionExempt?: boolean;
  sessionBalances?: Record<string, number>;
  /** Số buổi nghỉ do giáo viên, được khấu trừ ở kỳ học phí kế tiếp theo từng lớp. */
  tuitionCredits?: Record<string, number>;
  /** Tháng học phí gần nhất đã thanh toán, theo từng lớp (YYYY-MM). */
  tuitionPaidThrough?: Record<string, string>;
  /** Ngày học viên được thêm vào từng lớp (YYYY-MM-DD). Vào sau ngày 5 của
   * tháng thì tháng đó không lập phiếu; buổi thực học cộng vào phiếu tháng sau. */
  classJoinedAt?: Record<string, string>;
}

export interface DemoTeacher {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  address: string;
  email: string;
  assignedClasses: string[];
  /** Tick "Quyền trợ giảng" trên hồ sơ giáo viên: nhập điểm mọi lớp như tài khoản trợ giảng. */
  assistantAccess?: boolean;
}

export function defaultStudents(): DemoStudent[] {
  return [
    { id: "student-demo-1", code: "HV0001", fullName: "Nguyễn Minh Anh", phone: "0901 234 567", address: "Quận 1, TP.HCM", school: "Trường Tiểu học Nguyễn Bỉnh Khiêm", parentZalo: "0909 111 222", status: "STUDYING", dateOfBirth: "2018-05-12", parentName: "Nguyễn Thị Lan", note: "" },
    { id: "student-demo-2", code: "HV0002", fullName: "Trần Gia Hân", phone: "0902 345 678", address: "Quận 3, TP.HCM", school: "Trường Tiểu học Bàn Cờ", parentZalo: "0909 333 444", status: "STUDYING", dateOfBirth: "2018-09-03", parentName: "Trần Văn Bình", note: "" },
  ];
}

export function defaultTeachers(): DemoTeacher[] {
  return [
    { id: "teacher-quynh", code: "GV0001", fullName: "Trịnh Thị Xuân Quỳnh", phone: "0919 638 328", address: "", email: "teacher@steps.edu.vn", assignedClasses: ["STEPS Starters A"] },
    { id: "teacher-kieu-trinh", code: "GV0002", fullName: "Hồ Kiều Trinh", phone: "0357 986 108", address: "", email: "kieu.trinh@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-ngoc-han", code: "GV0003", fullName: "Nguyễn Thị Ngọc Hân", phone: "0941 155 408", address: "", email: "ngoc.han@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-van", code: "GV0004", fullName: "Dương Thị Vân", phone: "0856 661 668", address: "", email: "duong.van@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-kim-chi", code: "GV0005", fullName: "Nguyễn Kim Chi", phone: "0855 565 99", address: "", email: "kim.chi@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-bich", code: "GV0006", fullName: "Ngô Thị Bích", phone: "0826 850 072", address: "", email: "bich@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-thanh-thuy", code: "GV0007", fullName: "Nguyễn Thị Thanh Thủy", phone: "0948 675 261", address: "", email: "thanh.thuy@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-phuong-thuy", code: "GV0008", fullName: "Trần Phương Thúy", phone: "0383 973 494", address: "", email: "phuong.thuy@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-huyen", code: "GV0009", fullName: "Lê Thị Huyền", phone: "0948 249 396", address: "", email: "le.huyen@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-ai-duc", code: "GV0010", fullName: "Nguyễn Thị Ái Đức", phone: "0942 092 798", address: "", email: "ai.duc@steps.edu.vn", assignedClasses: [] },
    { id: "teacher-quyen", code: "GV0011", fullName: "Phạm Thị Quyên", phone: "0979 935 930", address: "", email: "quyen@steps.edu.vn", assignedClasses: [] },
  ];
}

export interface DemoAccountant {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  address: string;
  email: string;
}

export function defaultAccountants(): DemoAccountant[] {
  return [
    { id: "accountant-demo-1", code: "KT0001", fullName: "Ms. Hà", phone: "0905 678 901", address: "TP.HCM", email: "ha@steps.edu.vn" },
  ];
}

/** Trợ giảng phụ trách học vụ: nhập điểm và nhận xét cho mọi lớp, không sửa điểm danh. */
export interface DemoAssistant {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  address: string;
  email: string;
}

export function defaultAssistants(): DemoAssistant[] {
  return [];
}
