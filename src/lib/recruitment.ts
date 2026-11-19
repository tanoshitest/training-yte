import type { AdmissionStage, RecruitmentTaskKind } from "@/generated/prisma/enums";

export const ADMISSION_STAGES: AdmissionStage[] = [
  "RECEIVED",
  "COLLECTING",
  "WAITING_TEST",
  "CONSULTING",
  "LOCKED",
  "PLACED",
  "FIRST_MONTH_CARE",
  "CARE_COMPLETE",
];

export const STAGE_LABEL: Record<AdmissionStage, string> = {
  RECEIVED: "Mới tiếp nhận",
  COLLECTING: "Lấy thông tin - hẹn test",
  WAITING_TEST: "Chờ test",
  CONSULTING: "Tư vấn học phí",
  LOCKED: "Đã chốt",
  PLACED: "Đã xếp lớp",
  FIRST_MONTH_CARE: "Đã nhập học - Chăm sóc tháng đầu",
  CARE_COMPLETE: "Hoàn tất chăm sóc",
};

export const TASK_LABEL: Record<RecruitmentTaskKind, string> = {
  COMPLETE_PROFILE: "Hoàn thiện thông tin cơ bản",
  ASSESSMENT: "Kiểm tra và xếp lớp",
  TUITION_CONSULTATION: "Tư vấn học phí",
  PAYMENT_FOLLOW_UP: "Theo dõi đóng học phí",
  ONBOARDING: "Hoàn tất thủ tục nhập học",
  CONVERT_STUDENT: "Tạo học viên và ghi danh",
};

const CLOSED_STAGES: AdmissionStage[] = ["CARE_COMPLETE"];
const ENROLLED_STAGES: AdmissionStage[] = ["FIRST_MONTH_CARE", "CARE_COMPLETE"];

export function isClosedAdmissionStage(stage: AdmissionStage) {
  return CLOSED_STAGES.includes(stage);
}

/** Giai đoạn hiện trên danh sách tuyển sinh — không gồm hồ sơ đã hoàn tất chăm sóc. */
export const PIPELINE_STAGES = ADMISSION_STAGES.filter((stage) => !isClosedAdmissionStage(stage));

export function isEnrolledAdmissionStage(stage: AdmissionStage) {
  return ENROLLED_STAGES.includes(stage);
}

export function forwardStage(current: AdmissionStage, target: AdmissionStage): AdmissionStage {
  return ADMISSION_STAGES.indexOf(target) > ADMISSION_STAGES.indexOf(current) ? target : current;
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("84") ? `0${digits.slice(2)}` : digits;
}

export function nextTaskForStage(stage: AdmissionStage): RecruitmentTaskKind | null {
  if (stage === "RECEIVED" || stage === "COLLECTING") return "COMPLETE_PROFILE";
  if (stage === "WAITING_TEST") return "ASSESSMENT";
  if (stage === "CONSULTING") return "TUITION_CONSULTATION";
  if (stage === "LOCKED") return "ASSESSMENT";
  if (stage === "PLACED") return "PAYMENT_FOLLOW_UP";
  if (stage === "FIRST_MONTH_CARE") return "ONBOARDING";
  return null;
}
