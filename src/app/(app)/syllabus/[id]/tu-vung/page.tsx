import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";

import { parseVocab } from "../../vocab";
import { VocabFlipGrid } from "../../vocab-flip";

export const metadata: Metadata = { title: "Từ vựng tổng hợp" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const syllabus = await prisma.syllabus.findUnique({
    where: { id },
    select: {
      units: {
        orderBy: { order: "asc" },
        select: {
          lessons: {
            orderBy: { order: "asc" },
            select: { vocabulary: true },
          },
        },
      },
    },
  });

  if (!syllabus) notFound();

  const cards = syllabus.units.flatMap((unit) =>
    unit.lessons.flatMap((lesson) => parseVocab(lesson.vocabulary)),
  );

  return (
    <>
      <PageHeader
        title="Từ vựng tổng hợp"
        description="Toàn bộ flashcard của syllabus, theo thứ tự từ buổi 1. Bấm thẻ để lật mặt sau."
      />

      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>{cards.length} thẻ</CardTitle>
          <CardDescription>Không tách theo buổi. Soạn thẻ ở tab Từ vựng của từng buổi học.</CardDescription>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có flashcard nào trong syllabus này.</p>
          ) : (
            <VocabFlipGrid cards={cards} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
