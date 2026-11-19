import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/app-shell";
import { requirePermission } from "@/lib/permissions";
import { SettingsTabs } from "./tabs";

export const metadata: Metadata = { title: "Cấu hình" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("settings.manage");

  return (
    <>
      {/* Ghim tiêu đề + hàng tab khi cuộn — tab Bảng giá từng bị đẩy khuất. */}
      <div className="sticky top-0 z-20 mb-5 bg-background">
        <PageHeader
          title="Cấu hình"
          description="Dữ liệu nền của hệ thống: chi nhánh, phòng học, cấp học, ca học và học phí."
        />
        <SettingsTabs />
      </div>
      {children}
    </>
  );
}
