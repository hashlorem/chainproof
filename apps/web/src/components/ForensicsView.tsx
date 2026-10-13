"use client";

import { useState, type ReactNode } from "react";
import type { ForensicReport } from "@/lib/api";
import { AuthedImage } from "./AuthedImage";
import { Field, Pill, cx } from "./ui";

const VERDICT_TONE = {
  verified_capture: "ok",
  no_signs: "ok",
  suspicious: "warn",
  likely_manipulated: "bad",
  ai_generated: "bad",
} as const;

const SEVERITY_TONE = { info: "info", low: "neutral", medium: "warn", high: "bad" } as const;

type ImageSource = { kind: "b64"; data: string } | { kind: "path"; path: string } | null;

/** Shows one forensic report. Images come either inline (Check a photo) or from the evidence endpoints. */
export function ForensicsView({ report, original, ela, copymove }: {
  report: ForensicReport;
  original: ImageSource;
  ela: ImageSource;
  copymove: ImageSource;
}) {
  const tabs = [
    { id: "original", label: "Original", src: original },
    { id: "ela", label: "Error levels (ELA)", src: ela },
    { id: "clones", label: "Cloned areas", src: copymove },
  ].filter((t) => t.src);
  const [tab, setTab] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const tone = VERDICT_TONE[report.verdict];
  const meta = report.checks.metadata;
  const c2pa = report.checks.c2pa;

  return (
    <div className="space-y-4">
      <div className={cx("rounded-xl border p-4", tone === "ok" ? "border-ok/30 bg-ok-bg" : tone === "warn" ? "border-warn/30 bg-warn-bg" : "border-bad/30 bg-bad-bg")}>
        <div className={cx("text-lg font-semibold", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-bad")}>{report.label}</div>
        <p className="text-sm text-muted">{report.disclaimer}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cx("rounded-md px-2.5 py-1 text-sm", t.id === current?.id ? "bg-surface-2 font-medium" : "text-muted hover:text-ink")}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-black/5">
            {current?.src?.kind === "b64" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${current.src.data}`} alt={current.label} className="w-full" />
            ) : current?.src?.kind === "path" ? (
              <AuthedImage path={current.src.path} alt={current.label} className="min-h-48 w-full" />
            ) : null}
          </div>
          <p className="text-xs text-muted">
            {current?.id === "ela" && "Bright areas changed most when re-compressed. An area that is much brighter than similar surroundings may have been pasted in or edited."}
            {current?.id === "clones" && "Yellow box = source, red box = copy. Green lines join matching points."}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Findings</h3>
            {report.findings.length === 0 ? (
              <p className="text-sm text-muted">Nothing unusual found.</p>
            ) : (
              <ul className="space-y-2">
                {report.findings.map((f, i) => (
                  <li key={i} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Pill tone={SEVERITY_TONE[f.severity]}>{f.severity}</Pill> {f.title}
                    </div>
                    <p className="mt-1 text-sm text-muted">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Section title="Metadata">
            <Field label="Format">{meta.format} · {meta.width}×{meta.height}</Field>
            {Object.entries(meta.tags).map(([k, v]) => <Field key={k} label={k}>{v}</Field>)}
            {meta.gps && <Field label="GPS">{meta.gps.lat}, {meta.gps.lon}</Field>}
          </Section>

          <Section title="Content Credentials (C2PA)">
            {c2pa.present ? (
              <>
                <Field label="Generator">{c2pa.generator || "—"}</Field>
                <Field label="Signed by">{c2pa.issuer || "—"}</Field>
                <Field label="Validation">{c2pa.validation_state || "—"}</Field>
              </>
            ) : (
              <p className="text-sm text-muted">None embedded.</p>
            )}
          </Section>

          <Section title="Measurements">
            <Field label="ELA mean error">{report.checks.ela.mean_error}</Field>
            <Field label="ELA outlier area">{(report.checks.ela.outlier_ratio * 100).toFixed(2)}%</Field>
            <Field label="Clone pairs">{report.checks.copy_move.pairs}</Field>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <dl className="divide-y divide-border">{children}</dl>
    </div>
  );
}
