"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SlotCtx = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

/** Khe dưới thanh Overview/Chặng/Buổi — tab soạn buổi học gắn vào đây. */
export function SyllabusChrome({
  toolbar,
  children,
}: {
  toolbar: React.ReactNode;
  children: React.ReactNode;
}) {
  const slotRef = useRef<HTMLDivElement>(null);

  return (
    <SlotCtx.Provider value={slotRef}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative z-10 flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 lg:px-6">
          {toolbar}
          <div ref={slotRef} className="min-w-0 flex-1" />
        </div>
        {children}
      </div>
    </SlotCtx.Provider>
  );
}

/** Render vào khe sticky phía trên — giữ state tab trong form bên dưới. */
export function SyllabusChromeSlot({ children }: { children: React.ReactNode }) {
  const slotRef = useContext(SlotCtx);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    setTarget(slotRef?.current ?? null);
  }, [slotRef]);

  if (!target) return null;
  return createPortal(children, target);
}
