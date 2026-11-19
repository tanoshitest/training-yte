"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ callbackUrl, error }: { callbackUrl: string; error: string }) {
  const [csrf, setCsrf] = useState("");

  useEffect(() => {
    fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((payload) => setCsrf((payload as { csrfToken?: string }).csrfToken ?? ""))
      .catch(() => setCsrf(""));
  }, []);

  return (
    <form method="post" action="/api/auth/callback/credentials" className="space-y-4">
      <input type="hidden" name="csrfToken" value={csrf} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Field label="Email">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="admin@stepslms.vn"
        />
      </Field>
      <Field label="Mật khẩu">
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </Field>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={!csrf}>
        {csrf ? "Đăng nhập" : "Đang tải…"}
      </Button>
    </form>
  );
}
