"use client";

import { useState } from "react";
import { api, type CompareResult } from "@/lib/api";
import { Dropzone } from "./Dropzone";
import { GroupedHash, InspectorSection } from "./Inspector";
import { Button, ErrorBox, Loading, cx } from "./ui";

type Mode = "difference" | "side" | "swipe";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "difference", label: "Difference", hint: "The copy, with what differs from the original tinted and outlined in red" },
  { id: "side", label: "Side by side", hint: "Original left, copy right, in the same frame" },
  { id: "swipe", label: "Swipe", hint: "Drag the slider: original on the left of it, copy on the right" },
];

const b64 = (data: string, mime = "image/jpeg") => `data:${mime};base64,${data}`;

/** The comparison of a questioned copy with an evidence original: three views, then what it means and how reliable it is. */
export function CompareView({ result, evidenceId, onDownloaded }: { result: CompareResult; evidenceId?: string; onDownloaded?: () => void }) {
  const [mode, setMode] = useState<Mode>("difference");
  const [split, setSplit] = useState(50);
  const [busy, setBusy] = useState(false);
  const f = result.findings[0];
  const changed = result.regions.length > 0;
  const current = MODES.find((m) => m.id === mode)!;
  // Older servers only send the difference map.
  const modes = result.original_jpg && result.aligned_jpg ? MODES : MODES.slice(0, 1);

  const download = async () => {
    if (!evidenceId) return;
    setBusy(true);
    try {
      const { blob } = await api.blob(`/evidence/${evidenceId}/compared/${result.questioned_sha256}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `compared-${result.questioned_sha256.slice(0, 12)}`;
      a.click();
      URL.revokeObjectURL(a.href);
      onDownloaded?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section aria-label="Comparison viewer" className="flex min-w-0 flex-[999_1_520px] flex-col overflow-hidden rounded-lg bg-surface-2">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          <div role="tablist" aria-label="View" className="flex rounded-md bg-bg p-0.5">
            {modes.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={m.id === mode} onClick={() => setMode(m.id)}
                      className={cx("h-7 rounded-[5px] px-3 text-[12px]", m.id === mode ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink")}>
                {m.label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span className="text-xs text-muted">{current.hint}</span>
        </div>
        <div className="grid place-items-center bg-black/40 p-3">
          {mode === "difference" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b64(result.overlay_png, "image/png")} alt="Difference map: changed areas outlined in red" className="max-h-[560px] w-full object-contain" />
          )}
          {mode === "side" && (
            <div className="grid w-full grid-cols-2 gap-2">
              {[["Original", result.original_jpg!], ["Copy", result.aligned_jpg!]].map(([label, data]) => (
                <figure key={label} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b64(data)} alt={label} className="max-h-[480px] w-full object-contain" />
                  <figcaption className="text-center text-xs text-muted">{label}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {mode === "swipe" && (
            <div className="w-full space-y-2">
              <div className="relative mx-auto w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b64(result.aligned_jpg!)} alt="Copy" className="block max-h-[520px] w-auto max-w-full" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b64(result.original_jpg!)} alt="Original" className="absolute inset-0 size-full" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
                <span aria-hidden className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${split}%` }} />
              </div>
              <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))}
                     aria-label="Swipe between original and copy" className="w-full accent-[var(--color-accent)]" />
            </div>
          )}
        </div>
      </section>

      <aside aria-label="Comparison result" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[360px]">
        <InspectorSection title="Result">
          <div className={cx("heading text-[20px]", changed ? "text-bad" : "text-ink")}>{changed ? "Changed" : "No changes found"}</div>
          <p className="text-muted">{f.detail}</p>
          {changed && <p className="text-xs">{result.regions.length} region{result.regions.length === 1 ? "" : "s"} · {(result.changed_ratio * 100).toFixed(2)}% of the image</p>}
          {f.alternative && <p className="text-xs"><span className="text-muted">What else explains it:</span> {f.alternative}</p>}
        </InspectorSection>
        <InspectorSection title="How it was matched">
          <p>The copy was {result.aligned}. Its fingerprint is {result.distance} of 64 bits from the original&apos;s.</p>
        </InspectorSection>
        {result.validation && (
          <InspectorSection title="How reliable"><p className="text-xs">{result.validation}</p></InspectorSection>
        )}
        <InspectorSection title="Exhibit">
          <p className="text-xs text-muted">The questioned copy is kept under its own SHA-256 and named in the custody log. Downloading it is logged too.</p>
          <GroupedHash value={result.questioned_sha256} />
          {evidenceId && <div><Button variant="secondary" onClick={download} busy={busy}>Download the copy</Button></div>}
        </InspectorSection>
      </aside>
    </div>
  );
}

/** "Compare a copy with this original": drop a questioned file, get the comparison. Logged in custody as COMPARED. */
export function ComparePanel({ evidenceId, initialFile, onCompared }: { evidenceId: string; initialFile?: File | null; onCompared?: () => void }) {
  const [result, setResult] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compare(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setResult(await api.post<CompareResult>(`/evidence/${evidenceId}/compare`, fd));
      onCompared?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBox>{error}</ErrorBox>}
      {busy ? <Loading label="Lining the copy up with the original…" /> : result ? (
        <>
          <CompareView result={result} evidenceId={evidenceId} onDownloaded={onCompared} />
          <Button variant="secondary" onClick={() => setResult(null)}>Compare another copy</Button>
        </>
      ) : initialFile ? (
        <Button onClick={() => compare(initialFile)}>Compare with this evidence</Button>
      ) : (
        <Dropzone onFile={compare} accept="image/*">
          <div>
            <p className="font-semibold">Drop a copy to compare</p>
            <p className="text-muted">A photo that is circulating, was sent in, or was found on a device. The comparison is recorded in the chain of custody.</p>
          </div>
        </Dropzone>
      )}
    </div>
  );
}
