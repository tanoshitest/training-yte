import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { saveSubLevels } from "../actions";
import { LevelFields } from "./level-fields";

function levelFields(level: { id: string; subLevels: { id: string; name: string }[] }) {
  return (
    <LevelFields
      levelId={level.id}
      initialRows={
        level.subLevels.length > 0
          ? level.subLevels.map((item) => ({ id: item.id, name: item.name }))
          : undefined
      }
    />
  );
}

export default async function Page() {
  const levels = await prisma.level.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      subLevels: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      },
    },
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cấu hình level ({levels.length} cấp)</CardTitle>
          <CardDescription>
            Bấm tên cấp học để khai các level bên trong. Bảng giá và lớp học chọn level từ đây.
          </CardDescription>
        </div>
      </CardHeader>

      <Table>
        <THead>
          <TR>
            <THIndex />
            <TH>Cấp học</TH>
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
            levels.map((level, index) => (
              <TR key={level.id}>
                <TDIndex value={index + 1} />
                <TD>
                  <ModalForm
                    action={saveSubLevels}
                    title={`Level ${level.name}`}
                    submitLabel="Lưu"
                    wide
                    trigger={level.name}
                    triggerClassName="h-auto px-0 py-0 font-medium text-slate-900 hover:bg-transparent hover:text-brand-700"
                  >
                    {levelFields(level)}
                  </ModalForm>
                </TD>
                <TD className="w-px whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <EditButton
                      action={saveSubLevels}
                      title={`Level ${level.name}`}
                      label="Sửa level"
                      submitLabel="Lưu"
                      wide
                    >
                      {levelFields(level)}
                    </EditButton>
                  </div>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </Card>
  );
}
