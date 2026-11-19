export interface CenterSettings {
  name: string;
  phone: string;
  email: string;
  logoUrl: string;
  address: string;
}

export interface BranchSettings {
  id: string;
  name: string;
}

export interface ClassTypeSettings {
  id: string;
  name: string;
  description: string;
}

export interface TuitionPackageSettings {
  id: string;
  classTypeId: string;
  name: string;
  sessions: number;
  amount: number;
}

export interface LessonPeriodSettings {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface RoomSettings {
  id: string;
  name: string;
  capacity: number;
  branchId: string;
}

export interface DemoSettings {
  center: CenterSettings;
  branches: BranchSettings[];
  classTypes: ClassTypeSettings[];
  tuitionPackages: TuitionPackageSettings[];
  lessonPeriods: LessonPeriodSettings[];
  rooms: RoomSettings[];
}

export function defaultSettings(): DemoSettings {
  return {
    center: {
      name: "STEPS Education",
      phone: "",
      email: "contact@steps.edu.vn",
      logoUrl: "",
      address: "",
    },
    branches: [
      { id: "branch-steps-1", name: "STEPS - Chi nhánh 1" },
      { id: "branch-steps-2", name: "STEPS - Chi nhánh 2" },
    ],
    classTypes: [
      { id: "class-standard", name: "Lớp tiêu chuẩn", description: "Lớp học theo nhóm tại trung tâm" },
      { id: "class-one-to-one", name: "Lớp 1 kèm 1", description: "Một giáo viên kèm một học viên" },
    ],
    tuitionPackages: [
      { id: "tuition-standard-24", classTypeId: "class-standard", name: "Gói 24 buổi", sessions: 24, amount: 4800000 },
      { id: "tuition-standard-48", classTypeId: "class-standard", name: "Gói 48 buổi", sessions: 48, amount: 9000000 },
    ],
    lessonPeriods: [
      { id: "period-1", name: "Tiết 1", startTime: "08:00", endTime: "09:30" },
      { id: "period-2", name: "Tiết 2", startTime: "09:45", endTime: "11:15" },
      { id: "period-3", name: "Tiết 3", startTime: "17:30", endTime: "19:00" },
      { id: "period-4", name: "Tiết 4", startTime: "19:15", endTime: "20:45" },
    ],
    rooms: [
      { id: "room-1", name: "Phòng 1", capacity: 16, branchId: "branch-steps-1" },
      { id: "room-2", name: "Phòng 2", capacity: 16, branchId: "branch-steps-2" },
    ],
  };
}

