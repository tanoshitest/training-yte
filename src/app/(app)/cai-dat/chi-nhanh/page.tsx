import { Plus } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { EditButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { createBranch, deleteBranch, updateBranch } from "../actions";
import { ActionsCell } from "../ui";

export default async function Page() {
  const branches = await prisma.branch.findMany({ orderBy: { name: "asc" } });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Danh sách chi nhánh ({branches.length})</CardTitle>
          <CardDescription>
            Mỗi lớp thuộc về một chi nhánh. Phòng học dùng chung toàn trung tâm, không gắn theo
            chi nhánh.
          </CardDescription>
        </div>

        <ModalForm
          action={createBranch}
          title="Thêm chi nhánh"
          trigger={
            <>
              <Plus className="h-4 w-4" />
              Thêm chi nhánh
            </>
          }
        >
          <Field label="Tên chi nhánh">
            <Input name="name" placeholder="Chi nhánh Nguyễn Trãi" required />
          </Field>
        </ModalForm>
      </CardHeader>

      <Table>
        <THead>
          <TR>
            <THIndex />
            <TH>Tên chi nhánh</TH>
            <TH className="text-right">Thao tác</TH>
          </TR>
        </THead>
        <TBody>
          {branches.length === 0 ? (
            <EmptyRow colSpan={3}>Chưa có chi nhánh nào.</EmptyRow>
          ) : (
            branches.map((branch, index) => (
              <TR key={branch.id}>
                <TDIndex value={index + 1} />
                <TD className="font-medium text-slate-900">{branch.name}</TD>
                <ActionsCell id={branch.id} deleteAction={deleteBranch}>
                  <EditButton action={updateBranch} title="Sửa chi nhánh">
                    <input type="hidden" name="id" value={branch.id} />
                    <Field label="Tên chi nhánh">
                      <Input name="name" defaultValue={branch.name} required />
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
