"use client";

import { useRef } from "react";
import type { AdmissionStage } from "@/generated/prisma/enums";
import { updateRecruitmentStage } from "@/app/(app)/tuyen-sinh/actions";
import { ADMISSION_STAGES, STAGE_LABEL } from "@/lib/recruitment";

type LeadStageSelectProps = {
  id: string;
  stage: AdmissionStage;
};

export function LeadStageSelect({ id, stage }: LeadStageSelectProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateRecruitmentStage}>
      <input type="hidden" name="id" value={id} />
      <select
        aria-label="Trạng thái lead"
        className="h-10 min-w-[22rem] rounded-lg border-2 border-brand-400 bg-brand-50 px-3 pr-10 text-sm font-semibold text-brand-800 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
        defaultValue={stage}
        name="stage"
        onChange={() => formRef.current?.requestSubmit()}
      >
        {ADMISSION_STAGES.map((value) => (
          <option key={value} value={value}>
            {STAGE_LABEL[value]}
          </option>
        ))}
      </select>
    </form>
  );
}
