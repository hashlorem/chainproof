"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
export function Button({ variant = "primary", busy, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-accent-ink hover:brightness-110",
    secondary: "bg-surface-2 text-ink hover:bg-rule",
    danger: "bg-bad-bg text-bad hover:brightness-125",
    ghost: "text-ink hover:bg-surface-2",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx("inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50", styles[variant], className)}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg bg-surface", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5 pb-1">
          <h2 className="heading text-[15px]">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Tone = "ok" | "bad" | "warn" | "info" | "neutral";
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    ok: "bg-ok-bg text-ok",
    bad: "bg-bad-bg text-bad",
    warn: "bg-warn-bg text-warn",
    info: "bg-info-bg text-info",
    neutral: "bg-surface-2 text-muted",
  };
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-px text-[11px] font-semibold", tones[tone])}>{children}</span>;
}

export function CheckPill({ ok, children }: { ok: boolean | null; children?: ReactNode }) {
  return <Pill tone={ok === true ? "ok" : ok === false ? "bad" : "neutral"}>{ok === true ? "✓" : ok === false ? "✕" : "–"} {children}</Pill>;
}

// Page title block: a small label over the title. The label is muted: red is kept for problems.
export function PageTitle({ kicker, children, actions }: { kicker?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
      <div className="min-w-0 space-y-1">
        {kicker && <div className="eyebrow">{kicker}</div>}
        <h1 className="heading text-2xl sm:text-[28px]">{children}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center gap-2 p-6 text-sm text-muted"><Spinner /> {label}</div>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{children}</div>;
}

export function Hash({ value, short = 12 }: { value: string; short?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`${value}\n(click to copy)`}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="font-mono text-xs text-muted hover:text-ink"
    >
      {copied ? "copied" : short && value.length > short * 2 ? `${value.slice(0, short)}…${value.slice(-6)}` : value}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-border py-1.5 text-[13px] last:border-b-0">
      <dt className="eyebrow pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export const inputClass = "h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30";
