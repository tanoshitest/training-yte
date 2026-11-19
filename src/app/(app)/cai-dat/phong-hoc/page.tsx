import { Plus } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { EditButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { createRoom, deleteRoom, updateRoom } from "../actions";
import { ActionsCell } from "../ui";

export default async function Page() {
  const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Danh sách phòng học ({rooms.length})</CardTitle>
          <CardDescription>
            Tên phòng dùng chung cho toàn trung tâm — hai chi nhánh có phòng 1 thì cấu hình chỉ cần
            một phòng 1. Xóa phòng không xóa lớp hay buổi học đang dùng phòng đó, chúng chỉ trống
            phòng cho tới khi được xếp phòng khác.
          </CardDescription>
        </div>

        <ModalForm
          action={createRoom}
          title="Thêm phòng học"
          trigger={
            <>
              <Plus className="h-4 w-4" />
              Thêm phòng học
            </>
          }
        >
          <Field label="Tên phòng">
            <Input name="name" placeholder="Phòng 1" required />
          </Field>
        </ModalForm>
      </CardHeader>

      <Table>
        <THead>
          <TR>
            <THIndex />
            <TH>Tên phòng</TH>
            <TH className="text-right">Thao tác</TH>
          </TR>
        </THead>
        <TBody>
          {rooms.length === 0 ? (
            <EmptyRow colSpan={3}>Chưa có phòng học nào.</EmptyRow>
          ) : (
            rooms.map((room, index) => (
              <TR key={room.id}>
                <TDIndex value={index + 1} />
                <TD className="font-medium text-slate-900">{room.name}</TD>
                <ActionsCell id={room.id} deleteAction={deleteRoom}>
                  <EditButton action={updateRoom} title="Sửa phòng học">
                    <input type="hidden" name="id" value={room.id} />
                    <Field label="Tên phòng">
                      <Input name="name" defaultValue={room.name} required />
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
