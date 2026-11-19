import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { saveCenter } from "../actions";

export default async function Page() {
  const center = await prisma.center.findFirst({ orderBy: { createdAt: "asc" } });

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Thông tin trung tâm</CardTitle>
        <CardDescription>Hiển thị trên đầu trang và trên các bản in, biên lai.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saveCenter} className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên trung tâm" className="sm:col-span-2">
            <Input name="name" defaultValue={center?.name ?? ""} placeholder="STEPS Education" required />
          </Field>

          <Field label="Số điện thoại">
            <Input name="phone" defaultValue={center?.phone ?? ""} placeholder="0900 000 000" />
          </Field>

          <Field label="Email">
            <Input type="email" name="email" defaultValue={center?.email ?? ""} placeholder="lienhe@nzedu.vn" />
          </Field>

          <Field label="Logo (URL)" className="sm:col-span-2" hint="Dán đường dẫn ảnh logo, để trống nếu chưa có.">
            <Input name="logoUrl" defaultValue={center?.logoUrl ?? ""} placeholder="https://..." />
          </Field>

          <Field label="Địa chỉ" className="sm:col-span-2">
            <Textarea name="address" defaultValue={center?.address ?? ""} placeholder="Số nhà, đường, phường, quận, tỉnh/thành" />
          </Field>

          <div className="sm:col-span-2">
            <SubmitButton>Lưu thông tin</SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
