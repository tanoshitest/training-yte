"use client";

import * as React from "react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { EMPTY_STATE, type ActionState } from "@/lib/form-utils";

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form gắn với Server Action, hiển thị lỗi / thông báo thành công ngay tại chỗ.
 * Không dùng `redirect()` trong action — chỉ `revalidatePath()` — nên trang không nhảy đi đâu.
 */
export function ActionForm({
  action,
  children,
  className,
  id,
  resetOnSuccess = false,
  redirectOnSuccessField,
  onSuccess,
}: {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Xoá trắng form sau khi thêm mới thành công. */
  resetOnSuccess?: boolean;
  /** Redirect after a successful action using the URL in this named hidden input. */
  redirectOnSuccessField?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, EMPTY_STATE);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    onSuccessRef.current?.();
    if (state.href) {
      router.push(state.href);
      return;
    }
    if (redirectOnSuccessField) {
      const field = ref.current?.elements.namedItem(redirectOnSuccessField);
      if (field instanceof HTMLInputElement && field.value) router.push(field.value);
    }
  }, [state, resetOnSuccess, redirectOnSuccessField, router]);

  return (
    <form id={id} ref={ref} action={formAction} className={className}>
      {children}
      <FormFeedback state={state} />
    </form>
  );
}

function FormFeedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="col-span-full flex items-start gap-1.5 text-xs text-red-600">
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p className="col-span-full flex items-start gap-1.5 text-xs text-emerald-600">
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
        {state.message}
      </p>
    );
  }
  return null;
}

type SubmitProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  /** Câu hỏi xác nhận trước khi gửi (dùng cho nút xoá). */
  confirm?: string;
};

/** Nút submit tự khoá và hiện spinner khi form đang gửi. */
export function SubmitButton({
  children,
  className,
  variant = "primary",
  size = "md",
  confirm,
  onClick,
  disabled,
  ...props
}: SubmitProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={buttonClass(variant, size, cn("shrink-0", className))}
      {...props}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/** Khối lưới cho một dòng dữ liệu sửa tại chỗ. */
export function RowGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid items-end gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}
