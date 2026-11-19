import {
  BookOpen,
  Calculator,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  ClipboardPen,
  GraduationCap,
  ListChecks,
  LayoutDashboard,
  PanelsTopLeft,
  School,
  ScrollText,
  Settings,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { effectiveRole } from "@/lib/roles";
import type { Role } from "@/generated/prisma/enums";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hiện trên menu nhưng chưa mở trang. */
  disabled?: boolean;
};

export type NavGroup = {
  title?: string;
  icon?: LucideIcon;
  /** Chỉ hiện tiêu đề cha, không mở trang con. */
  frozen?: boolean;
  items: NavItem[];
};

const ACCOUNTING_NAV_ITEMS: NavItem[] = [
  { href: "/hoc-phi", label: "Quản lý học phí", icon: Wallet },
  { href: "/ke-toan/hoa-don", label: "Quản lý hóa đơn", icon: ScrollText },
  { href: "/ke-toan/sepay", label: "Giao dịch SePay", icon: ArrowLeftRight },
  { href: "/ke-toan/can-duyet", label: "Giao dịch lệch", icon: ClipboardCheck },
  { href: "/ke-toan/thu-chi", label: "Quản lý thu chi", icon: ArrowLeftRight },
  { href: "/ke-toan/doi-soat", label: "Đối soát", icon: BadgeCheck },
  { href: "/ke-toan/cham-cong", label: "Báo cáo chấm công", icon: CalendarDays },
  { href: "/ke-toan/luong", label: "Quản lý lương", icon: Banknote },
];

/** Điều hướng Admin — PRD §21 */
export const ADMIN_NAV: NavGroup[] = [
  {
    items: [{ href: "/tong-quan", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Quản lý đào tạo",
    icon: PanelsTopLeft,
    items: [
      { href: "/tuyen-sinh", label: "Tuyển sinh", icon: UserPlus },
      { href: "/syllabus", label: "Syllabus", icon: BookOpen },
      { href: "/lop-hoc", label: "Lớp học", icon: School },
      { href: "/lich-day", label: "Lịch dạy", icon: CalendarDays },
    ],
  },
  {
    title: "Báo cáo đào tạo",
    icon: ClipboardList,
    items: [
      { href: "/bao-cao/buoi-hoc", label: "Báo cáo buổi học", icon: CalendarDays },
      { href: "/bao-cao/chuyen-can", label: "Báo cáo chuyên cần", icon: ClipboardCheck },
      { href: "/bao-cao/hoc-vu", label: "Báo cáo học vụ", icon: ClipboardPen },
    ],
  },
  {
    title: "Kế toán",
    icon: Wallet,
    items: ACCOUNTING_NAV_ITEMS,
  },
  {
    title: "Báo cáo hệ thống",
    icon: ClipboardList,
    items: [
      { href: "/hoc-phi/bao-cao", label: "Nhật ký thu hp", icon: ClipboardCheck },
      { href: "/bao-cao-hoc-vu", label: "Báo cáo học vụ", icon: ClipboardPen },
      { href: "/bao-cao-diem-so", label: "Báo cáo điểm số", icon: ListChecks },
    ],
  },
  {
    title: "Quản lý người dùng",
    icon: Users,
    items: [
      { href: "/hoc-vien", label: "Học viên", icon: Users },
      { href: "/giao-vien", label: "Giáo viên", icon: GraduationCap },
      { href: "/ke-toan-vien", label: "Kế toán", icon: Calculator },
      { href: "/hoc-vu", label: "Học vụ", icon: UserCog },
    ],
  },
  {
    title: "Vận hành",
    icon: Settings,
    items: [
      { href: "/task", label: "Task", icon: ClipboardList },
      { href: "/nhat-ky", label: "Nhật ký", icon: ScrollText },
      { href: "/cai-dat", label: "Cấu hình", icon: Settings },
    ],
  },
];

/** Điều hướng Teacher — PRD §22 */
export const TEACHER_NAV: NavGroup[] = [
  {
    title: "Giảng dạy",
    items: [
      { href: "/gv", label: "Dashboard", icon: LayoutDashboard },
      { href: "/gv/lich-day", label: "Lịch dạy", icon: CalendarDays },
      { href: "/gv/lop-hoc", label: "Lớp của tôi", icon: School },
      { href: "/gv/bao-cao-hoc-vu", label: "Báo cáo học vụ", icon: ClipboardPen },
      { href: "/gv/bao-cao-cham-cong", label: "Báo cáo chấm công", icon: ClipboardCheck },
      { href: "/gv/task", label: "Task", icon: ClipboardList },
    ],
  },
];

export const ACCOUNTANT_NAV: NavGroup[] = [
  {
    title: "Kế toán",
    icon: Wallet,
    items: ACCOUNTING_NAV_ITEMS,
  },
];

export function navForRole(role: Role): NavGroup[] {
  const actual = effectiveRole(role);
  if (actual === "ADMIN") return ADMIN_NAV;
  if (actual === "TEACHER") return TEACHER_NAV;
  if (actual === "ACCOUNTANT") return ACCOUNTANT_NAV;
  return [
    {
      title: "Học tập",
      items: [{ href: "/portal", label: "Của tôi", icon: GraduationCap }],
    },
  ];
}
