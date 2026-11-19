export type DemoClassStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "FINISHED";

export interface DemoScheduleSlot {
  weekday: number;
  periodId: string;
  startTime: string;
  endTime: string;
  /** Inclusive YYYY-MM-DD. Empty means the slot applies from the beginning. */
  effectiveFrom?: string;
  /** Inclusive YYYY-MM-DD. Empty means the slot still applies. */
  effectiveTo?: string;
}

export function scheduleSlotAppliesOnDate(
  slot: Pick<DemoScheduleSlot, "weekday" | "effectiveFrom" | "effectiveTo">,
  date: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  if (slot.weekday !== new Date(year, month - 1, day, 12).getDay()) return false;
  if (slot.effectiveFrom && date < slot.effectiveFrom) return false;
  if (slot.effectiveTo && date > slot.effectiveTo) return false;
  return true;
}

export interface DemoClass {
  id: string;
  code: string;
  name: string;
  classTypeId: string;
  branchId: string;
  teacherId: string;
  roomId: string;
  syllabusId: string;
  status: DemoClassStatus;
  studentIds: string[];
  schedules: DemoScheduleSlot[];
  note: string;
  tuitionPackageId?: string;
  billingMode?: "COURSE" | "MONTHLY";
  sessionPrice?: number;
  courseSessions?: number;
  /** Ngày bắt đầu dùng để sinh chuỗi buổi học của khóa (YYYY-MM-DD). */
  courseStartDate?: string;
  billingEnabled?: boolean;
  /** Học liệu thu thêm từng tháng, khóa là "YYYY-MM". Tháng không có thì bỏ trống. */
  materialFees?: Record<string, DemoMaterialFee>;
}

export interface DemoMaterialFee {
  amount: number;
  description: string;
}

export type DemoSessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type DemoAttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED";
export type DemoLessonRating = "A_PLUS" | "A" | "A_MINUS" | "B";
export type DemoHomeworkRating = "FULL_100" | "EIGHTY_80" | "BELOW_50" | "ZERO_0";

export interface DemoAssessmentColumn {
  id: string;
  name: string;
}

export interface DemoAttendanceRow {
  studentId: string;
  status: DemoAttendanceStatus | null;
  /** Status from the first real (non-off) attendance save; used to detect late arrivals. */
  firstStatus?: DemoAttendanceStatus | null;
  /** True when the student was not present on first save, then marked PRESENT later. */
  late?: boolean;
  lessonRating: DemoLessonRating | null;
  homeworkRating: DemoHomeworkRating | null;
  pronunciationVideoDone: boolean;
  /** Teacher-ticked worksheet completion, shown on the academic report like the home clip check. */
  worksheetDone?: boolean;
  vocabularyScore?: string | number | null;
  /** Free-form answers for teacher-defined learning columns. Legacy numeric values remain readable. */
  assessmentScores?: Record<string, string | number | null>;
  note: string;
}

export interface DemoLessonSession {
  id: string;
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  roomId: string;
  status: DemoSessionStatus;
  isExtra: boolean;
  recurrenceKey: string;
  note: string;
  isOff?: boolean;
  /** ADMIN: lịch nghỉ đã chốt bởi học vụ; TEACHER: giáo viên báo nghỉ khi điểm danh. */
  offSource?: "ADMIN" | "TEACHER";
  /** Buổi học diễn ra bình thường (điểm danh thật) nhưng không tính học phí:
   * suất lịch không chiếm vị trí của khóa nên khóa tự kéo dài một buổi bù ở
   * cuối — giống cơ chế buổi GV cho nghỉ. */
  noFee?: boolean;
  /** Id buổi nghỉ (GV cho nghỉ) mà buổi này dạy bù. Buổi bù chiếm đúng vị trí
   * khóa của buổi nghỉ — khóa không kéo dài, buổi bù tính phí như buổi thường. */
  makeupOf?: string;
  /** Đánh dấu giáo viên dạy thay (substitute teacher) — trả lương cho giáo viên này thay giáo viên chính. */
  isSubstitute?: boolean;
  /** Lần đầu buổi được điểm danh (ISO) — dùng chấm KPI đúng hạn; buổi cũ chưa có thì coi như đã hoàn tất. */
  attendanceSubmittedAt?: string;
  hasHomework?: boolean;
  assessmentColumns?: DemoAssessmentColumn[];
  /** Thứ tự các cột nghiệp vụ trong bảng điểm danh và phiếu báo cáo. */
  attendanceColumnOrder?: string[];
  attendance?: DemoAttendanceRow[];
}

export type DemoPeriodicReportPeriodType = "MONTHLY" | "COURSE";

export interface DemoPeriodicReportScores {
  listening: number | null;
  speaking: number | null;
  reading: number | null;
  writing: number | null;
}

export type DemoPeriodicReportSkillComments = Record<keyof DemoPeriodicReportScores, string>;

export interface DemoPeriodicReport {
  id: string;
  classId: string;
  studentId: string;
  periodType: DemoPeriodicReportPeriodType;
  periodKey: string;
  periodLabel: string;
  fromDate: string;
  toDate: string;
  scores: DemoPeriodicReportScores;
  /** Đánh giá thái độ học tập của học viên trong kỳ. */
  attitudeComment: string;
  /** Nhận xét riêng cho từng kỹ năng trong báo cáo định kỳ. */
  skillComments: DemoPeriodicReportSkillComments;
  /** Nhận xét chung của trung tâm gửi phụ huynh. */
  comment: string;
  updatedAt: string;
  updatedBy: string;
}

export type DemoAuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN";

export interface DemoAuditLog {
  id: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "ACCOUNTANT" | "ASSISTANT";
  action: DemoAuditAction;
  entity: string;
  entityId: string;
  summary: string;
  /** Nghiệp vụ: TUITION · PROFILE · ATTENDANCE · STATEMENT · RECON · OTHER (dòng cũ không có → app tự xếp). */
  category?: string;
  /** Sửa trường nào, từ … thành … */
  details?: { label: string; from: string; to: string }[];
}

export function defaultClasses(): DemoClass[] {
  return [
    {
      id: "class-demo-starters-a",
      code: "STEPS-ST-A",
      name: "STEPS Starters A",
      classTypeId: "class-standard",
      branchId: "branch-steps-1",
      teacherId: "teacher-quynh",
      roomId: "room-1",
      syllabusId: "syllabus-starters",
      status: "ACTIVE",
      studentIds: ["student-demo-1"],
      tuitionPackageId: "tuition-standard-24",
      billingMode: "COURSE",
      sessionPrice: 200000,
      courseSessions: 24,
      billingEnabled: true,
      schedules: [
        { weekday: 1, periodId: "period-3", startTime: "17:30", endTime: "19:00" },
        { weekday: 3, periodId: "period-3", startTime: "17:30", endTime: "19:00" },
      ],
      note: "Lớp demo STEPS dành cho trình độ Starters.",
    },
    {
      id: "class-demo-movers-b",
      code: "STEPS-MV-B",
      name: "STEPS Movers B",
      classTypeId: "class-standard",
      branchId: "branch-steps-2",
      teacherId: "",
      roomId: "room-2",
      syllabusId: "syllabus-movers",
      status: "ACTIVE",
      studentIds: ["student-demo-2"],
      tuitionPackageId: "tuition-standard-24",
      billingMode: "MONTHLY",
      sessionPrice: 100000,
      courseSessions: 24,
      billingEnabled: true,
      schedules: [
        { weekday: 2, periodId: "period-4", startTime: "19:15", endTime: "20:45" },
        { weekday: 4, periodId: "period-4", startTime: "19:15", endTime: "20:45" },
      ],
      note: "Lớp demo STEPS dành cho trình độ Movers.",
    },
  ];
}

export function defaultLessonSessions(): DemoLessonSession[] {
  return [
    {
      id: "session-demo-done",
      classId: "class-demo-starters-a",
      date: "2026-09-01",
      startTime: "17:30",
      endTime: "19:00",
      teacherId: "teacher-quynh",
      roomId: "room-1",
      status: "COMPLETED",
      isExtra: false,
      recurrenceKey: "class-demo-starters-a|2026-09-01|17:30",
      note: "",
      isOff: false,
      hasHomework: true,
      attendance: [
        {
          studentId: "student-demo-1",
          status: "PRESENT",
          lessonRating: "A",
          homeworkRating: "FULL_100",
          pronunciationVideoDone: true,
          note: "Học sinh chú ý nghe giảng, có tiến bộ",
        },
      ],
    },
    {
      id: "session-demo-off",
      classId: "class-demo-starters-a",
      date: "2026-09-03",
      startTime: "17:30",
      endTime: "19:00",
      teacherId: "teacher-quynh",
      roomId: "room-1",
      status: "SCHEDULED",
      isExtra: false,
      recurrenceKey: "class-demo-starters-a|2026-09-03|17:30",
      note: "",
      isOff: true,
      offSource: "ADMIN",
      hasHomework: false,
      attendance: [
        {
          studentId: "student-demo-1",
          status: "EXCUSED",
          lessonRating: null,
          homeworkRating: null,
          pronunciationVideoDone: false,
          note: "",
        },
      ],
    },
  ];
}

export function defaultAuditLogs(): DemoAuditLog[] {
  return [];
}
