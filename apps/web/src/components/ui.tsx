"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
export function Button({ variant = "primary", busy, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "border-rule bg-accent text-accent-ink hover:opacity-85",
    secondary: "border-rule bg-surface hover:bg-surface-2",
    danger: "border-bad bg-surface text-bad hover:bg-bad-bg",
    ghost: "border-transparent hover:bg-surface-2",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx("inline-flex h-11 items-center justify-center gap-2 border-2 px-4 text-xs font-semibold uppercase tracking-[0.08em] transition disabled:cursor-not-allowed disabled:opacity-50", styles[variant], className)}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border-2 border-rule bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b-2 border-rule px-4 py-3">
          <h2 className="heading text-xl">{title}</h2>
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
    ok: "border-ok text-ok",
    bad: "border-bad bg-bad-bg text-bad font-semibold",
    warn: "border-warn text-warn",
    info: "border-info text-info",
    neutral: "border-rule text-ink",
  };
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-px text-[11px] uppercase tracking-[0.06em]", tones[tone])}>{children}</span>;
}

export function CheckPill({ ok, children }: { ok: boolean | null; children?: ReactNode }) {
  return <Pill tone={ok === true ? "ok" : ok === false ? "bad" : "neutral"}>{ok === true ? "✓" : ok === false ? "✕" : "–"} {children}</Pill>;
}

// Page title block: small red label over a condensed uppercase heading.
export function PageTitle({ kicker, children, actions }: { kicker?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-rule pb-4">
      <div className="min-w-0 space-y-2">
        {kicker && <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-bad">{kicker}</div>}
        <h1 className="heading text-4xl sm:text-5xl">{children}</h1>
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
  return <div className="border-2 border-bad bg-bad-bg px-3 py-2 text-sm text-bad">{children}</div>;
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
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="eyebrow pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export const inputClass = "h-11 w-full border-2 border-rule bg-surface px-3 text-sm outline-none focus:outline-2 focus:outline-offset-2 focus:outline-rule";
