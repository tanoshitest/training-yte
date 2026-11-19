import type { Metadata } from "next";
import { KeyRound } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { requireUser } from "@/lib/permissions";
import { changeOwnPassword } from "./actions";

export const metadata: Metadata = { title: "Đổi mật khẩu" };

export default async function Page() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Đổi mật khẩu"
        description={`Tài khoản ${user.email}`}
      />

      <div className="max-w-lg space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-brand-600" />
                Mật khẩu mới
              </CardTitle>
              <CardDescription>Tối thiểu 8 ký tự. Không dùng lại mật khẩu cũ.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ActionForm action={changeOwnPassword} resetOnSuccess className="space-y-3">
              <Field label="Mật khẩu hiện tại">
                <Input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field label="Mật khẩu mới">
                <Input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
              <Field label="Xác nhận mật khẩu mới">
                <Input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
              <SubmitButton>Đổi mật khẩu</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Quên mật khẩu?</CardTitle>
              <CardDescription>
                Hệ thống chưa gửi email tự động. Liên hệ quản trị viên của trung tâm để được đặt
                lại mật khẩu, sau đó vào đây đổi sang mật khẩu riêng của bạn.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
