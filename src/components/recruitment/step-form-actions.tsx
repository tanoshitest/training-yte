"use client";

import type { MouseEvent } from "react";
import { SubmitButton } from "@/components/ui/form";

export function StepFormActions({
  nextHref,
  nextLabel = "Chuyển bước 2",
}: {
  nextHref?: string;
  nextLabel?: string;
}) {
  const setRedirect = (event: MouseEvent<HTMLButtonElement>, href: string) => {
    const field = event.currentTarget.form?.elements.namedItem("_successHref");
    if (field instanceof HTMLInputElement) field.value = href;
  };

  return (
    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-2.5">
      <SubmitButton variant="outline" onClick={(event) => setRedirect(event, "")}>Lưu</SubmitButton>
      {nextHref ? (
        <SubmitButton onClick={(event) => setRedirect(event, nextHref)}>{nextLabel}</SubmitButton>
      ) : null}
    </div>
  );
}
