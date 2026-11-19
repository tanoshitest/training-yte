"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

export function RepeatableList({
  name,
  defaultValue,
  addLabel,
  placeholder,
  numbered,
  multiline = false,
}: {
  name: string;
  defaultValue: string[];
  addLabel: string;
  placeholder?: string;
  numbered?: boolean;
  multiline?: boolean;
}) {
  const [rows, setRows] = useState(defaultValue.length > 0 ? defaultValue : [""]);

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className={multiline ? "flex items-start gap-2" : "flex items-center gap-2"}>
          {numbered ? (
            <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">Step {index + 1}</span>
          ) : null}
          {multiline ? (
            <Textarea
              name={name}
              rows={2}
              value={row}
              onChange={(event) =>
                setRows((current) => current.map((item, i) => (i === index ? event.target.value : item)))
              }
              placeholder={placeholder}
            />
          ) : (
            <Input
              name={name}
              value={row}
              onChange={(event) =>
                setRows((current) => current.map((item, i) => (i === index ? event.target.value : item)))
              }
              placeholder={placeholder}
            />
          )}
          <button
            type="button"
            onClick={() => setRows((current) => (current.length === 1 ? [""] : current.filter((_, i) => i !== index)))}
            className={`${buttonClass("outline", "icon")} sy-edit-only`}
            title="Xóa dòng"
            aria-label="Xóa dòng"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((current) => [...current, ""])}
        className={`${buttonClass("secondary", "sm")} sy-edit-only`}
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </button>
    </div>
  );
}
