import { Plus } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { EditButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { createLevel, deleteLevel, updateLevel } from "../actions";
import { ActionsCell } from "../ui";

export default async function Page() {
  const levels = await prisma.level.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { subLevels: true } } },
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Danh sách cấp học ({levels.length})</CardTitle>
          <CardDescription>
            Ví dụ: Kids 1, Kids 2, Basic, Intermediate. Các level bên trong mỗi cấp học khai báo ở
            tab Cấu hình level. Xóa cấp học không xóa lớp hay syllabus thuộc cấp đó, nhưng phải xóa
            các dòng bảng giá của nó trước.
          </CardDescription>
        </div>

        <ModalForm
          action={createLevel}
          title="Thêm cấp học"
          trigger={
            <>
              <Plus className="h-4 w-4" />
              Thêm cấp học
            </>
          }
        >
          <Field label="Tên cấp học">
            <Input name="name" placeholder="Kids 1" required />
          </Field>
        </ModalForm>
      </CardHeader>

      <Table>
        <THead>
          <TR>
            <THIndex />
            <TH>Tên cấp học</TH>
            <TH className="text-right">Số level</TH>
            <TH className="text-right">Thao tác</TH>
          </TR>
        </THead>
        <TBody>
          {levels.length === 0 ? (
            <EmptyRow colSpan={4}>Chưa có cấp học nào.</EmptyRow>
          ) : (
            levels.map((level, index) => (
              <TR key={level.id}>
                <TDIndex value={index + 1} />
                <TD className="font-medium text-slate-900">{level.name}</TD>
                <TD className="text-right tabular-nums">{level._count.subLevels}</TD>
                <ActionsCell id={level.id} deleteAction={deleteLevel}>
                  <EditButton action={updateLevel} title="Sửa cấp học">
                    <input type="hidden" name="id" value={level.id} />
                    <Field label="Tên cấp học">
                      <Input name="name" defaultValue={level.name} required />
                    </Field>
                  </EditButton>
                </ActionsCell>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </Card>
  );
}
