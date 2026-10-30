"use client";

import { useState } from "react";
import { api, type CompareResult } from "@/lib/api";
import { Dropzone } from "./Dropzone";
import { Button, ErrorBox, Loading, Pill, cx } from "./ui";

/** The difference map between a questioned copy and an evidence original, with what it means and how reliable it is. */
export function CompareView({ result }: { result: CompareResult }) {
  const f = result.findings[0];
  const changed = result.regions.length > 0;
  return (
    <div className="space-y-3">
      <div className={cx("border-2 p-3", changed ? "border-bad bg-bad-bg" : "border-ok")}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Pill tone={changed ? "bad" : "ok"}>{changed ? "Changed" : "No changes"}</Pill> {f.title}
        </div>
        <p className="mt-1 text-sm text-muted">{f.detail}</p>
        {result.validation && (
          <p className="mt-1.5 border-t border-border pt-1.5 text-xs"><span className="eyebrow">How reliable</span> {result.validation}</p>
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${result.overlay_png}`} alt="Difference map: changed areas outlined in red" className="w-full border border-rule" />
      <p className="text-xs text-muted">
        The copy, {result.aligned}, with areas that differ from the stored original tinted and outlined in red ·
        fingerprint distance {result.distance}/64 · copy SHA-256 <span className="font-mono">{result.questioned_sha256.slice(0, 16)}…</span>
      </p>
    </div>
  );
}

/** "Compare a copy with this original": drop a questioned file, get the difference map. Logged in custody as COMPARED. */
export function ComparePanel({ evidenceId, initialFile }: { evidenceId: string; initialFile?: File | null }) {
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
          <CompareView result={result} />
          <Button variant="secondary" onClick={() => setResult(null)}>Compare another copy</Button>
        </>
      ) : initialFile ? (
        <Button onClick={() => compare(initialFile)}>Compare with this evidence</Button>
      ) : (
        <Dropzone onFile={compare} accept="image/*">
          <div>
            <p className="font-semibold uppercase tracking-[0.06em]">Drop a copy to compare</p>
            <p className="text-muted">A photo that is circulating, was sent in, or was found on a device. The comparison is recorded in the chain of custody.</p>
          </div>
        </Dropzone>
      )}
    </div>
  );
}
