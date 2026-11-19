import Link from "next/link";
import { Download, Eye } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReceiptActions({
  paymentId,
  stacked = false,
}: {
  paymentId: string;
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-1.5",
        stacked ? "flex-col items-end" : "flex-nowrap items-center justify-end",
      )}
    >
      <Link href={`/hoc-phi/bien-lai/${paymentId}`} className={buttonClass("outline", "sm")}>
        <Eye className="h-3.5 w-3.5" />
        Xem
      </Link>
      <Link
        href={`/api/hoc-phi/bien-lai/${paymentId}`}
        download
        className={buttonClass("secondary", "sm")}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </Link>
    </div>
  );
}
