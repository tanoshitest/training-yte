import { Plus } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { EditButton, ModalForm } from "@/components/ui/modal";
import { EmptyRow, TBody, TD, TDIndex, TH, THIndex, THead, TR, Table } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { createPeriod, deletePeriod, updatePeriod } from "../actions";
import { ActionsCell } from "../ui";

/** Ba ô nhập dùng chung cho form thêm và form sửa. */
function PeriodFields({
  period,
}: {
  period?: { name: string; startTime: string; endTime: string };
}) {
  return (
    <>
      <Field label="Tên ca học">
        <Input name="name" placeholder="Ca 1" defaultValue={period?.name} required />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Giờ bắt đầu">
          <Input type="time" name="startTime" defaultValue={period?.startTime ?? "08:00"} required />
        </Field>
        <Field label="Giờ kết thúc">
          <Input type="time" name="endTime" defaultValue={period?.endTime ?? "09:30"} required />
        </Field>
      </div>
    </>
  );
}

export default async function Page() {
  const periods = await prisma.lessonPeriod.findMany({
    orderBy: [{ startTime: "asc" }, { name: "asc" }],
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Danh sách ca học ({periods.length})</CardTitle>
          <CardDescription>
            Xếp lịch lớp chỉ cần chọn ca, giờ sẽ tự điền theo khai báo ở đây. Sửa giờ hay xóa ca
            đều không làm đổi lịch của các lớp đang hoạt động.
          </CardDescription>
        </div>

        <ModalForm
          action={createPeriod}
          title="Thêm ca học"
          trigger={
            <>
              <Plus className="h-4 w-4" />
              Thêm ca học
            </>
          }
        >
          <PeriodFields />
        </ModalForm>
      </CardHeader>

      <Table>
        <THead>
          <TR>
            <THIndex />
            <TH>Tên ca học</TH>
            <TH>Giờ bắt đầu</TH>
            <TH>Giờ kết thúc</TH>
            <TH className="text-right">Thao tác</TH>
          </TR>
        </THead>
        <TBody>
          {periods.length === 0 ? (
            <EmptyRow colSpan={5}>Chưa có ca học nào.</EmptyRow>
          ) : (
            periods.map((period, index) => (
              <TR key={period.id}>
                <TDIndex value={index + 1} />
                <TD className="font-medium text-slate-900">{period.name}</TD>
                <TD className="tabular-nums">{period.startTime}</TD>
                <TD className="tabular-nums">{period.endTime}</TD>
                <ActionsCell id={period.id} deleteAction={deletePeriod}>
                  <EditButton action={updatePeriod} title="Sửa ca học">
                    <input type="hidden" name="id" value={period.id} />
                    <PeriodFields period={period} />
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
