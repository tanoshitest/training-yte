"use client";

import * as React from "react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AlertCircle, Pencil, Trash2, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/form";
import { EMPTY_STATE, type ActionState } from "@/lib/form-utils";
import { cn } from "@/lib/utils";

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Lớp phủ + hộp thoại. Gắn vào <body> bằng portal để không bị cắt bởi
 * `overflow` của thẻ cha (thanh tab của màn hình Cấu hình có overflow-x-auto).
 */
function Overlay({
  title,
  onClose,
  wide = false,
  fit = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Hộp thoại rộng, cho form nhiều trường xếp thành lưới. */
  wide?: boolean;
  /** Không cuộn thân form — dùng khi nội dung đã xếp gọn, nhìn hết trong một khung. */
  fit?: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const openedOnPath = useRef(pathname);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (pathname !== openedOnPath.current) onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Khoá cuộn nền trong lúc hộp thoại mở. Nội dung app cuộn ở `#app-scroll`,
    // không phải `body`, nên phải khoá cả hai.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const scroller = document.getElementById("app-scroll");
    const previousScroller = scroller?.style.overflow;
    if (scroller) scroller.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      if (scroller) scroller.style.overflow = previousScroller ?? "";
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div data-app-modal="" className="fixed inset-0 z-50">
      {/* Lớp nền tách riêng — bấm ra ngoài luôn đóng, không phụ thuộc flex hit-testing. */}
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div className="relative flex min-h-full items-center justify-center overflow-y-auto p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "pointer-events-auto w-full rounded-xl border border-slate-200 bg-white shadow-lg",
            fit || wide ? "max-w-4xl" : "max-w-md",
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className={buttonClass("ghost", "icon")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 whitespace-pre-line text-xs text-red-600">
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

/**
 * Thân form bên trong hộp thoại. Tách riêng để mỗi lần mở lại là một
 * `useActionState` mới — nếu không, trạng thái thành công của lần trước
 * sẽ đóng ngay hộp thoại vừa mở.
 */
function ModalBody({
  action,
  submitLabel,
  secondary,
  onDone,
  encType,
  fit,
  children,
}: {
  action: ServerAction;
  submitLabel: string;
  secondary?: React.ReactNode;
  onDone: () => void;
  encType?: string;
  fit?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, EMPTY_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} encType={encType}>
      {/* Form dài (ví dụ thêm lớp) thì cuộn trong thân hộp thoại, giữ nút Hủy/Lưu luôn thấy. */}
      <div className={cn("px-5 py-4", fit ? "space-y-3" : "max-h-[70vh] space-y-4 overflow-y-auto")}>
        {children}
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
        {/* Thao tác phụ (cùng form, khác `intent`) nằm bên trái, tách khỏi cặp Hủy/Lưu. */}
        {secondary ? <div className="mr-auto">{secondary}</div> : null}
        <button type="button" onClick={onDone} className={buttonClass("outline", "md")}>
          Hủy
        </button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Hộp thoại không gắn Server Action — dùng khi chỉ cập nhật state trên client
 * (ví dụ thêm / sửa một dòng lịch tuần trước khi lưu cả form lớp).
 */
export function Dialog({
  title,
  open,
  onClose,
  children,
  footer,
  wide = false,
  fit = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  fit?: boolean;
}) {
  if (!open) return null;
  return (
    <Overlay title={title} onClose={onClose} wide={wide} fit={fit}>
      <div className="space-y-4 px-5 py-4">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </Overlay>
  );
}

/**
 * Nút mở hộp thoại thêm mới. Hộp thoại tự đóng khi lưu thành công,
 * và ở lại kèm thông báo lỗi khi thất bại.
 */
export function ModalForm({
  action,
  title,
  trigger,
  submitLabel = "Thêm",
  secondary,
  wide = false,
  encType,
  triggerClassName,
  triggerTitle,
  children,
}: {
  action: ServerAction;
  title: string;
  /** Nhãn nút mở hộp thoại. */
  trigger: React.ReactNode;
  submitLabel?: string;
  /**
   * Nút thao tác phụ đặt bên trái chân hộp thoại. Hai kiểu dùng:
   * - `SubmitButton` mang `name` / `value` riêng — cùng gửi form này, Server Action
   *   đọc `name` để biết đang làm gì;
   * - một `ModalForm` khác — mở hộp thoại thứ hai cho một việc riêng. Lồng được vì
   *   `Overlay` vẽ qua `createPortal` ra `document.body` và nút mở là `type="button"`,
   *   nên không có `<form>` nào nằm trong `<form>` nào.
   */
  secondary?: React.ReactNode;
  /** Hộp thoại rộng, cho form nhiều trường. */
  wide?: boolean;
  /** Gửi file (nhập Excel) thì cần multipart. */
  encType?: string;
  /**
   * Đổi kiểu nút mở hộp thoại. Mặc định là nút chính; thẻ buổi học trên lưới lịch
   * dùng nguyên cả thẻ làm nút nên phải tự đặt lớp CSS.
   */
  triggerClassName?: string;
  /** Chú thích hiện khi rê chuột lên nút mở hộp thoại. */
  triggerTitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={triggerTitle}
        className={triggerClassName ?? buttonClass("primary", "md")}
      >
        {trigger}
      </button>
      {open ? (
        <Overlay title={title} onClose={close} wide={wide}>
          <ModalBody
            action={action}
            submitLabel={submitLabel}
            secondary={secondary}
            encType={encType}
            onDone={close}
          >
            {children}
          </ModalBody>
        </Overlay>
      ) : null}
    </>
  );
}

/**
 * Nút mở hộp thoại sửa một dòng. Dùng chung `ModalBody` với `ModalForm` nên form sửa
 * nằm ngoài bảng — nhờ vậy danh sách mới dựng được bằng `<table>` thật
 * (`<form>` không được bọc `<tr>`).
 *
 * `children` là các `<Field>` của form, kèm `<input type="hidden" name="id">`.
 * Mặc định là nút bút chì "Sửa"; đổi `icon` / `label` để dùng cho thao tác khác
 * trên cùng một dòng (ví dụ chuyển lớp).
 */
export function EditButton({
  action,
  title,
  icon,
  label = "Sửa",
  submitLabel = "Lưu",
  wide = false,
  fit = false,
  children,
}: {
  action: ServerAction;
  title: string;
  /** Biểu tượng trên nút, mặc định là bút chì. */
  icon?: React.ReactNode;
  /** Nhãn trợ năng của nút. */
  label?: string;
  submitLabel?: string;
  /** Hộp thoại rộng, cho form nhiều trường xếp thành lưới. */
  wide?: boolean;
  /** Không cuộn thân form — nhìn hết nội dung trong một khung. */
  fit?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className={buttonClass("outline", "icon")}
      >
        {icon ?? <Pencil className="h-4 w-4" />}
      </button>
      {open ? (
        <Overlay title={title} onClose={close} wide={wide} fit={fit}>
          <ModalBody action={action} submitLabel={submitLabel} onDone={close} fit={fit}>
            {children}
          </ModalBody>
        </Overlay>
      ) : null}
    </>
  );
}

function ConfirmBody({
  action,
  id,
  message,
  onDone,
}: {
  action: ServerAction;
  id: string;
  message: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, EMPTY_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction}>
      <div className="space-y-3 px-5 py-4">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm text-slate-700">{message}</p>
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button type="button" onClick={onDone} className={buttonClass("outline", "md")}>
          Hủy
        </button>
        <SubmitButton variant="danger">Xóa</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Nút xoá kèm hộp thoại xác nhận (thay cho `window.confirm`).
 * Lỗi "đang được sử dụng" từ server hiện ngay trong hộp thoại.
 */
export function DeleteButton({
  action,
  id,
  message = "Bạn có chắc muốn xóa dữ liệu này?",
}: {
  action: ServerAction;
  id: string;
  message?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Xóa"
        aria-label="Xóa"
        className={buttonClass("danger", "icon")}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {open ? (
        <Overlay title="Xác nhận xóa" onClose={close}>
          <ConfirmBody action={action} id={id} message={message} onDone={close} />
        </Overlay>
      ) : null}
    </>
  );
}
