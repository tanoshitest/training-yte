import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { SyllabusChrome } from "./chrome";

/**
 * Khung soạn syllabus full-width: cây trái + nội dung cuộn (trang gốc),
 * hoặc tab soạn buổi (trang /buoi/[lessonId]).
 */
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const syllabus = await prisma.syllabus.findUnique({
    where: { id },
    select: { id: true, name: true, code: true },
  });

  if (!syllabus) notFound();

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <SyllabusChrome
        toolbar={
          <div className="flex h-10 shrink-0 items-center gap-2">
            <Link
              href="/syllabus"
              title="Danh sách syllabus"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <p className="truncate text-[13px] font-bold tracking-tight text-slate-900">{syllabus.code || syllabus.name}</p>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </SyllabusChrome>
    </div>
  );
}
