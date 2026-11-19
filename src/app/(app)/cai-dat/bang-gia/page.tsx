import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton, EditButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { createPackageTable, deleteIeltsCourses, deleteLevelPackages, saveIeltsCourses } from "../actions";
import { AddPackageFields } from "./add-package-fields";
import { IeltsCourseFields } from "./ielts-fields";

/** Decimal → chuỗi kiểu Việt Nam (9.600.000) để gõ lại cho quen tay. */
function vnd(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("vi-VN") : "";
}

function ieltsCourseFields(courses: { id: string; name: string; basePrice: unknown; price: unknown }[]) {
  return (
    <IeltsCourseFields
      initialRows={
        courses.length > 0
          ? courses.map((course) => ({
              id: course.id,
              name: course.name,
              basePrice: vnd(course.basePrice),
              price: vnd(course.price),
            }))
          : undefined
      }
    />
  );
}

function packageFields(level: {
  id: string;
  subLevels: {
    name: string;
    basePrice: unknown;
    discount24Weeks: unknown;
    discount12Weeks: unknown;
  }[];
}) {
  return (
    <AddPackageFields
      levelId={level.id}
      initialRows={
        level.subLevels.length > 0
          ? level.subLevels.map((subLevel) => ({
              name: subLevel.name,
              basePrice: vnd(subLevel.basePrice),
              discount24: vnd(subLevel.discount24Weeks) || "600.000",
              discount12: vnd(subLevel.discount12Weeks) || "300.000",
            }))
          : undefined
      }
    />
  );
}

export default async function Page() {
  const [levels, courses] = await Promise.all([
    prisma.level.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        subLevels: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            basePrice: true,
            discount24Weeks: true,
            discount12Weeks: true,
            _count: { select: { normalPackages: true } },
          },
        },
      },
    }),
    prisma.ieltsCourse.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, basePrice: true, price: true },
    }),
  ]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cấu hình học phí</CardTitle>
          <CardDescription>
            Bấm Cấp 1 / Cấp 2 để nhập học phí gốc 24 tuần cùng miễn giảm 24 tuần và 12 tuần — giá
            24 / 48 buổi tính theo kỳ đóng tương ứng. Bấm Khóa IELTS để khai học phí trọn khóa. Sửa giá
            không làm đổi hồ sơ đã lập trước đó.
          </CardDescription>
        </div>
      </CardHeader>

      <Table>
        <THead>
          <TR>
            <THIndex />
            <TH>Hạng mục</TH>
            <TH className="text-right">Thao tác</TH>
          </TR>
        </THead>
        <TBody>
          {levels.length === 0 ? (
            <EmptyRow colSpan={3}>
              Chưa có cấp học nào.{" "}
              <Link href="/cai-dat/cap-hoc" className="font-medium text-brand-600 hover:underline">
                Tạo cấp học trước
              </Link>
              .
            </EmptyRow>
          ) : (
            levels.map((level, index) => {
              const priced = level.subLevels.filter((item) => item._count.normalPackages > 0).length;

              return (
                <TR key={level.id}>
                  <TDIndex value={index + 1} />
                  <TD>
                    <ModalForm
                      action={createPackageTable}
                      title={`Bảng giá ${level.name}`}
                      submitLabel="Lưu"
                      wide
                      trigger={level.name}
                      triggerClassName="h-auto px-0 py-0 font-medium text-slate-900 hover:bg-transparent hover:text-brand-700"
                    >
                      {packageFields(level)}
                    </ModalForm>
                  </TD>
                  <TD className="w-px whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <EditButton
                        action={createPackageTable}
                        title={`Bảng giá ${level.name}`}
                        label="Sửa bảng giá"
                        submitLabel="Lưu"
                        wide
                      >
                        {packageFields(level)}
                      </EditButton>
                      {priced > 0 ? (
                        <DeleteButton
                          action={deleteLevelPackages}
                          id={level.id}
                          message={`Xóa toàn bộ bảng giá của ${level.name}? Hồ sơ học phí đã lập vẫn giữ nguyên số buổi và số tiền.`}
                        />
                      ) : null}
                    </div>
                  </TD>
                </TR>
              );
            })
          )}
          <TR>
            {/* Dòng IELTS luôn đứng cuối bảng nên đánh số tiếp sau danh sách cấp học. */}
            <TDIndex value={levels.length + 1} />
            <TD>
              <ModalForm
                action={saveIeltsCourses}
                title="Khóa IELTS"
                submitLabel="Lưu"
                wide
                trigger="Khóa IELTS"
                triggerClassName="h-auto px-0 py-0 font-medium text-slate-900 hover:bg-transparent hover:text-brand-700"
              >
                {ieltsCourseFields(courses)}
              </ModalForm>
            </TD>
            <TD className="w-px whitespace-nowrap">
              <div className="flex items-center justify-end gap-2">
                <EditButton
                  action={saveIeltsCourses}
                  title="Khóa IELTS"
                  label="Sửa khóa IELTS"
                  submitLabel="Lưu"
                  wide
                >
                  {ieltsCourseFields(courses)}
                </EditButton>
                {courses.length > 0 ? (
                  <DeleteButton
                    action={deleteIeltsCourses}
                    id="ielts"
                    message="Xóa toàn bộ khóa IELTS? Hồ sơ học phí đã lập vẫn giữ nguyên số tiền."
                  />
                ) : null}
              </div>
            </TD>
          </TR>
        </TBody>
      </Table>
    </Card>
  );
}
