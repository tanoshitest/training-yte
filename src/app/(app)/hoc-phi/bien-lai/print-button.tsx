"use client";

import { useEffect } from "react";
import { Download, Printer } from "lucide-react";

import { Button, buttonClass } from "@/components/ui/button";

export function PrintReceiptButton({
  paymentId,
  auto = false,
  label = "Tải biên lai PDF",
}: {
  paymentId?: string;
  auto?: boolean;
  label?: string;
}) {
  useEffect(() => {
    if (!auto || paymentId) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [auto, paymentId]);

  if (!paymentId) {
    return (
      <Button type="button" onClick={() => window.print()}>
        {auto ? <Printer className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {label}
      </Button>
    );
  }

  return (
    <a href={`/api/hoc-phi/bien-lai/${paymentId}`} download className={buttonClass("primary", "md")}>
      <Download className="h-4 w-4" />
      {label}
    </a>
  );
}
