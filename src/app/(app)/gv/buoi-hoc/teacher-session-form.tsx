"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/form";
import type { ClassType, SessionStatus } from "@/generated/prisma/enums";
import type { RosterRow, SessionTestColumn } from "@/lib/session";
import { saveTeacherReport } from "./actions";
import { AttendanceRoster } from "./attendance-roster";
import { LessonReportForm } from "./lesson-report-form";

export function TeacherSessionForm({
  sessionId,
  roster,
  classType,
  isCompleted,
  heading,
  tests,
  report,
  isOff = false,
  hasHomework = false,
}: {
  sessionId: string;
  roster: RosterRow[];
  classType: ClassType;
  isCompleted: boolean;
  heading: { title: string; description: string; status: SessionStatus };
  tests: SessionTestColumn[];
  isOff?: boolean;
  hasHomework?: boolean;
  report?: {
    classSituation: string | null;
    studentsToNote: string | null;
    homework: string | null;
    note: string | null;
  } | null;
}) {
  return (
    <ActionForm action={saveTeacherReport} className="flex flex-col gap-4 [&>p]:px-5">
      <input type="hidden" name="sessionId" value={sessionId} />

      <Card className="shrink-0">
        <CardContent className="p-0">
          <AttendanceRoster
            sessionId={sessionId}
            roster={roster}
            mode="comment"
            classType={classType}
            isCompleted={isCompleted}
            heading={heading}
            tests={tests}
            isOff={isOff}
            hasHomework={hasHomework}
            embedded
            submitLabel="Lưu báo cáo"
          />
        </CardContent>
      </Card>

      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Báo cáo buổi học</CardTitle>
          <CardDescription>Ghi lại những gì đã diễn ra để lớp sau tiếp nối được.</CardDescription>
        </CardHeader>
        <CardContent>
          <LessonReportForm sessionId={sessionId} report={report} embedded />
        </CardContent>
      </Card>
    </ActionForm>
  );
}
