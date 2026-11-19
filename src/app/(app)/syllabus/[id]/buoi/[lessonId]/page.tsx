import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Textarea } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { LessonTabGroup } from "../../lesson-tabs";
import { updateLessonContent } from "../../../actions";
import { ExerciseBuilder } from "../../../exercises/builder";
import { parseMaterials } from "../../../materials";
import { MaterialsInput } from "../../../materials-input";
import { RepeatableList } from "../../../repeatable-list";
import { parseVocab, stringList } from "../../../vocab";
import { VocabFlipGrid } from "../../../vocab-flip";
import { VocabInput } from "../../../vocab-input";

export const metadata: Metadata = { title: "Nội dung buổi học" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  await requireAdmin();
  const { id, lessonId } = await params;

  const lesson = await prisma.syllabusLesson.findUnique({
    where: { id: lessonId },
    include: { unit: true, courseDay: true },
  });

  // Xóa buổi đang mở thì về Overview, không để trang 404.
  if (!lesson) {
    const syllabus = await prisma.syllabus.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!syllabus) notFound();
    redirect(`/syllabus/${id}`);
  }
  if ((lesson.unit?.syllabusId ?? lesson.courseDay?.syllabusId) !== id) notFound();

  const materials = parseMaterials(lesson.materials);
  const cards = parseVocab(lesson.vocabulary);

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-2 lg:px-6">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col px-3 py-0">
          <ActionForm
            id="lesson-form"
            action={updateLessonContent}
            className="flex min-h-0 flex-1 flex-col"
          >
            <input type="hidden" name="id" value={lesson.id} />
            <input type="hidden" name="syllabusId" value={id} />
            <input type="hidden" name="name" value={lesson.name} />

            <LessonTabGroup
              trailing={
                <SubmitButton size="sm" form="lesson-form">
                  Lưu
                </SubmitButton>
              }
              tabs={[
                {
                  key: "plan",
                  label: "Giáo án",
                  content: (
                    <Field
                      label="Lesson plan"
                      hint="Nhập từng step. Step 1, Step 2, ..."
                    >
                      <RepeatableList
                        name="lessonPlanStep"
                        defaultValue={stringList(lesson.lessonPlan)}
                        addLabel="Thêm step"
                        placeholder="Warm-up: greet and review"
                        numbered
                      />
                    </Field>
                  ),
                },
                {
                  key: "vocabulary",
                  label: "Từ vựng",
                  content: (
                    <div className="space-y-5">
                      <Field
                        label="Từ vựng của buổi học"
                        hint="Thêm từng từ: nghĩa + flashcard (mặt trước ảnh, mặt sau nghĩa)."
                      >
                        <VocabInput defaultValue={cards} />
                      </Field>
                      {cards.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-medium text-slate-500">
                            Xem thẻ — bấm để lật
                          </p>
                          <VocabFlipGrid cards={cards} />
                        </div>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: "grammar",
                  label: "Ngữ pháp",
                  content: (
                    <Field label="Ngữ pháp" hint="Thêm từng chủ điểm">
                      <RepeatableList
                        name="grammarPoint"
                        defaultValue={stringList(lesson.grammar)}
                        addLabel="Thêm chủ điểm"
                        placeholder="This / These, Where questions"
                      />
                    </Field>
                  ),
                },
                {
                  key: "afterclass",
                  label: "Sau buổi học",
                  content: (
                    <Field
                      label="Bài tập về nhà"
                      hint="Giáo viên sẽ thấy lại phần này ở màn hình dạy học."
                    >
                      <Textarea name="homework" defaultValue={lesson.homework ?? ""} rows={10} />
                    </Field>
                  ),
                },
                {
                  key: "exercises",
                  label: "Bài tập",
                  content: <ExerciseBuilder lessonId={lesson.id} />,
                },
                {
                  key: "materials",
                  label: "Học liệu",
                  content: (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-500">
                        Link tới slide, audio, worksheet... Link phải bắt đầu bằng http:// hoặc
                        https://.
                      </p>
                      <MaterialsInput defaultValue={materials} />

                      {materials.length > 0 ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3">
                          {materials.map((item) => (
                            <a
                              key={item.url}
                              href={item.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {item.title || item.url}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
