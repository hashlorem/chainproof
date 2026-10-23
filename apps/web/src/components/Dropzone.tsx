"use client";

import { useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

export function Dropzone({ onFile, accept, children, disabled }: { onFile: (f: File) => void; accept?: string; children: ReactNode; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f && !disabled) onFile(f);
      }}
      className={cx(
        "grid cursor-pointer place-items-center border-2 border-dashed p-8 text-center text-sm transition",
        over ? "border-rule bg-surface-2" : "border-muted hover:border-rule hover:bg-surface-2",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {children}
    </div>
  );
}
