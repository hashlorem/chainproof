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

type ImageSource = { kind: "b64"; data: string; mime?: string } | { kind: "path"; path: string } | null;

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
      <div className={cx("border-2 p-4", tone === "ok" ? "border-ok bg-surface" : tone === "warn" ? "border-warn bg-surface" : "border-bad bg-bad-bg")}>
        <div className={cx("heading text-2xl", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-bad")}>{report.label}</div>
        <p className="text-sm text-muted">{report.disclaimer}</p>
        {report.validation !== undefined && (
          <p className="mt-1 text-xs text-muted">
            {report.validation
              ? `Error rates measured ${report.validation.validated_at.slice(0, 10)} on a labelled test set of real phone photos (docs/validation).`
              : "These checks have not been validated yet; their error rates are unknown."}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-0">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cx("min-h-9 border border-rule px-3 text-xs uppercase tracking-[0.08em]", t.id === current?.id ? "bg-accent text-accent-ink" : "hover:bg-surface-2")}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="overflow-hidden border border-rule bg-black/5">
            {current?.src?.kind === "b64" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:${current.src.mime ?? "image/png"};base64,${current.src.data}`} alt={current.label} className="w-full" />
            ) : current?.src?.kind === "path" ? (
              <AuthedImage path={current.src.path} alt={current.label} className="min-h-48 w-full" />
            ) : null}
          </div>
          <p className="text-xs text-muted">
            {current?.id === "ela" && "Visual aid only. Bright areas changed most when re-compressed; a patch much brighter than similar surroundings may be pasted in. Validation found this unreliable on its own, so it doesn't affect the verdict."}
            {current?.id === "clones" && "Yellow box = source, red box = copy. Green lines join matching points."}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="heading mb-2 text-lg">Findings</h3>
            {report.findings.length === 0 ? (
              <p className="text-sm text-muted">Nothing unusual found.</p>
            ) : (
              <ul className="space-y-2">
                {report.findings.map((f, i) => (
                  <li key={i} className="border border-rule p-2.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Pill tone={SEVERITY_TONE[f.severity]}>{f.severity}</Pill> {f.title}
                    </div>
                    <p className="mt-1 text-sm text-muted">{f.detail}</p>
                    {f.validation !== undefined && (
                      <p className="mt-1.5 border-t border-border pt-1.5 text-xs">
                        <span className="eyebrow">How reliable</span> {f.validation ?? "Not validated"}
                      </p>
                    )}
                    {f.alternative && (
                      <p className="mt-1 text-xs">
                        <span className="eyebrow">What else explains it</span> {f.alternative}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {report.checks.structure && (
            <Section title="File history">
              <p className="py-2 text-sm"><span className="font-semibold">{report.checks.structure.label}.</span> <span className="text-muted">{report.checks.structure.detail}</span></p>
              {report.checks.structure.quality != null && (
                <Field label="Compression">
                  {`about quality ${report.checks.structure.quality} · ${report.checks.structure.standard_table ? "standard" : "custom"} table · ${report.checks.structure.progressive ? "progressive" : "baseline"}`}
                </Field>
              )}
              {!!report.checks.structure.blocks?.length && <Field label="Header blocks">{report.checks.structure.blocks.join(" → ")}</Field>}
            </Section>
          )}

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
      <h3 className="heading mb-1 text-lg">{title}</h3>
      <dl className="divide-y divide-border">{children}</dl>
    </div>
  );
}
