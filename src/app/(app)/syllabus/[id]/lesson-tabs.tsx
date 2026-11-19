"use client";

import { TabGroup, type TabItem } from "@/components/ui/tabs";
import { SyllabusChromeSlot } from "./chrome";

/** Tab soạn buổi: thanh tab lên sticky header, panel ở lại trong form. */
export function LessonTabGroup({
  tabs,
  trailing,
}: {
  tabs: TabItem[];
  trailing?: React.ReactNode;
}) {
  return (
    <TabGroup
      fill
      trailing={trailing}
      renderBar={(bar) => <SyllabusChromeSlot>{bar}</SyllabusChromeSlot>}
      tabs={tabs}
    />
  );
}
