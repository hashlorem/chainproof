"use client";

import type { ReactNode } from "react";
import { formatBytes, formatTs, type Evidence, type Examination, type Finding, type ForensicReport } from "@/lib/api";
import { Field, VERDICT_TONE, cx } from "./ui";

const VERDICT_COLOR = { ok: "text-ok", neutral: "text-ink", warn: "text-warn", bad: "text-bad" } as const;
const SEVERITY = {
  high: { label: "HIGH", text: "text-bad", dot: "bg-bad" },
  medium: { label: "MEDIUM", text: "text-warn", dot: "bg-warn" },
  low: { label: "LOW", text: "text-muted", dot: "bg-muted" },
  info: { label: "INFO", text: "text-muted", dot: "bg-muted/60" },
} as const;

export function InspectorSection({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Verdict({ report }: { report: ForensicReport }) {
  return (
    <div>
      <div className={cx("heading text-[22px]", VERDICT_COLOR[VERDICT_TONE[report.verdict]])}>{report.label}</div>
      <p className="text-muted">Indicators, not proof. The conclusion is the examiner&apos;s.</p>
    </div>
  );
}

export function Findings({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <p className="text-muted">Nothing found.</p>;
  return (
    <ul className="divide-y divide-border">
      {findings.map((f, i) => {
        const s = SEVERITY[f.severity];
        return (
          <li key={i} className="grid grid-cols-[12px_minmax(0,1fr)] gap-2.5 py-2.5 first:pt-0">
            <span className={cx("mt-[5px] size-2 rounded-full", s.dot)} aria-hidden />
            <div className="space-y-1">
              <div className="font-medium">{f.title} <span className={cx("pl-1 text-[11px] font-semibold", s.text)}>{s.label}</span></div>
              <p className="text-muted">{f.detail}</p>
              {f.validation !== undefined && <p className="text-xs"><span className="text-muted">How reliable:</span> {f.validation ?? "not validated yet"}</p>}
              {f.alternative && <p className="text-xs"><span className="text-muted">What else explains it:</span> {f.alternative}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Step = { label: string; state: string; tone: "ok" | "warn" | "bad" | "done" | "todo" | "you" };
const ICON = {
  ok: "M5 12.5l4.5 4.5L19 7.5", done: "M5 12.5l4.5 4.5L19 7.5",
  warn: "M12 4L21 20H3Z M12 10v4 M12 17h.01", bad: "M12 4L21 20H3Z M12 10v4 M12 17h.01",
  todo: "M12 4a8 8 0 1 0 0.01 0", you: "M12 4a8 8 0 1 0 0.01 0 M12 4v16",
};
const TONE = { ok: "text-ok", warn: "text-warn", bad: "text-bad", done: "text-muted", todo: "text-muted", you: "text-accent" };

/**
 * Where this examination stands, in the SWGDE order. Green only means verified; a step that ran and found nothing is
 * grey, and an import's unknown origin is amber, never a green tick.
 */
export function examinationSteps(e: Evidence, exam: Examination | null): Step[] {
  const r = e.forensics;
  const sev = (checks: string[]) => {
    const fs = (r?.findings ?? []).filter((f) => checks.includes(f.check));
    return fs.some((f) => f.severity === "high") ? "bad" : fs.some((f) => f.severity === "medium") ? "warn" : null;
  };
  const step = (label: string, ran: boolean, flag: "bad" | "warn" | null, found: string, clean: string): Step =>
    !ran ? { label, state: "not run", tone: "todo" } : flag ? { label, state: found, tone: flag } : { label, state: clean, tone: "done" };
  const conclusion = exam?.conclusion;
  return [
    e.provenance === "device_signed"
      ? { label: "Provenance", state: e.device?.revoked ? "signed, device since revoked" : "signed at capture", tone: e.device?.revoked ? "warn" : "ok" }
      : { label: "Provenance", state: "origin unverified", tone: "warn" },
    step("File structure", !!r, sev(["metadata", "structure", "c2pa"]), "needs a look", r?.checks.structure?.label ?? "no finding"),
    step("Global analysis", !!r, null, "", "visual aid only"),
    step("Local analysis", !!r, sev(["copy_move"]), `${(r?.findings ?? []).filter((f) => f.check === "copy_move").length} finding`, "no finding"),
    exam?.comparisons.length
      ? { label: "Comparison", state: `${exam.comparisons.length} cop${exam.comparisons.length === 1 ? "y" : "ies"}${exam.comparisons.every((c) => c.kept) ? ", kept" : ""}`, tone: "done" }
      : { label: "Comparison", state: "none", tone: "todo" },
    conclusion ? { label: "Conclusion", state: conclusion.level, tone: "done" } : { label: "Conclusion", state: "yours to record", tone: "you" },
    exam?.review ? { label: "Technical review", state: exam.review.agrees ? "agrees" : "does not agree", tone: exam.review.agrees ? "ok" : "bad" }
      : { label: "Technical review", state: conclusion ? "another examiner" : "after the conclusion", tone: "todo" },
  ];
}

export function ExaminationSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" className={cx("size-4 shrink-0", TONE[s.tone])} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d={ICON[s.tone]} /></svg>
          <span className={cx("flex-1", s.tone === "todo" && "text-muted")}>{s.label}</span>
          <span className={cx("text-xs", s.tone === "done" || s.tone === "todo" ? "text-muted" : TONE[s.tone])}>{s.state}</span>
        </li>
      ))}
    </ol>
  );
}

/** SHA-256 in eight groups of eight, so two people can read it out to each other. */
export function GroupedHash({ value }: { value: string }) {
  return <span className="font-mono text-[11.5px] break-words">{value.match(/.{1,8}/g)?.join(" ")}</span>;
}

export function FileRecord({ e }: { e: Evidence }) {
  const m = e.manifest;
  const rows: [string, ReactNode][] = [
    ["Origin", e.provenance === "device_signed"
      ? `Signed at capture by ${e.device?.name ?? "an enrolled device"}${e.device?.revoked ? " (device since revoked)" : ""}`
      : "Imported. No capture signature, so where it came from is not proven."],
    ["Captured", m.captured_at ? <>{formatTs(m.captured_at as string)} <span className="text-muted">(device clock)</span></> : "unknown"],
    ["Received", formatTs(e.received_at)],
    ["Trusted time", e.tsa_time ? <>existed by {formatTs(e.tsa_time)} <span className="text-muted">(FreeTSA)</span></> : e.tsa_status],
    ["Size", `${e.size.toLocaleString("en")} bytes (${formatBytes(e.size)}) · ${e.mime}`],
    ["SHA-256", <GroupedHash key="h" value={e.sha256} />],
  ];
  return (
    <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** File structure, metadata, Content Credentials and raw measurements, folded away under the findings. */
export function TechnicalDetails({ report }: { report: ForensicReport }) {
  const meta = report.checks.metadata;
  const c2pa = report.checks.c2pa;
  const s = report.checks.structure;
  const block = (title: string, children: ReactNode) => (
    <div className="space-y-0.5">
      <div className="pt-2 text-xs font-semibold">{title}</div>
      <dl>{children}</dl>
    </div>
  );
  return (
    <details>
      <summary className="cursor-pointer text-muted hover:text-ink">File structure, metadata and credentials</summary>
      {s && block("File history", <>
        <Field label="Looks like">{s.label}</Field>
        {s.quality != null && <Field label="Compression">{`about quality ${s.quality} · ${s.standard_table ? "standard" : "custom"} table · ${s.progressive ? "progressive" : "baseline"}`}</Field>}
        {!!s.blocks?.length && <Field label="Header blocks">{s.blocks.join(" → ")}</Field>}
      </>)}
      {block("Metadata", <>
        <Field label="Format">{meta.format} · {meta.width} × {meta.height}</Field>
        {Object.entries(meta.tags).map(([k, v]) => <Field key={k} label={k}>{v}</Field>)}
        {meta.gps && <Field label="GPS">{meta.gps.lat}, {meta.gps.lon}</Field>}
      </>)}
      {block("Content Credentials (C2PA)", c2pa.present ? <>
        <Field label="Generator">{c2pa.generator || "—"}</Field>
        <Field label="Signed by">{c2pa.issuer || "—"}</Field>
        <Field label="Validation">{c2pa.validation_state || "—"}{c2pa.trusted === false && " (signer not on the C2PA trust list)"}</Field>
      </> : <p className="text-muted">None embedded.</p>)}
      {block("Measurements", <>
        <Field label="ELA mean error">{report.checks.ela.mean_error}</Field>
        <Field label="ELA outlier area">{(report.checks.ela.outlier_ratio * 100).toFixed(2)}%</Field>
        <Field label="Clone pairs">{report.checks.copy_move.pairs}</Field>
      </>)}
    </details>
  );
}
