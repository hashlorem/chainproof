"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AuthedImage } from "@/components/AuthedImage";
import { ForensicsView } from "@/components/ForensicsView";
import { MapView } from "@/components/MapView";
import { Button, Card, ErrorBox, Field, Hash, Loading, Pill } from "@/components/ui";
import { api, formatBytes, formatTs, type Evidence, type ForensicReport } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

export default function EvidencePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: e, error, setData } = useApi<Evidence>(`/evidence/${id}`);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canWrite = user?.role !== "auditor";

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!e) return <Loading />;
  const m = e.manifest;
  const isImage = e.mime.startsWith("image/");

  const analyze = () =>
    run("analyze", async () => {
      const report = await api.post<ForensicReport>(`/evidence/${id}/analyze`);
      setData({ ...e, forensics: report, forensics_label: report.label, forensics_verdict: report.verdict });
    });

  const download = () =>
    run("download", async () => {
      const { blob } = await api.blob(`/evidence/${id}/file?purpose=download`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = e.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/cases/${e.case_id}`} className="text-sm text-muted hover:text-ink">← Back to case</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{e.filename}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {e.provenance === "device_signed" ? <Pill tone="ok">Signed capture</Pill> : <Pill>Imported, no capture signature</Pill>}
            {e.tsa_status === "stamped" ? <Pill tone="info">RFC 3161 timestamped</Pill> : <Pill>Timestamp {e.tsa_status}</Pill>}
            {e.device?.revoked && <Pill tone="warn">Device since revoked</Pill>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download} busy={busy === "download"}>Download original</Button>
          {e.tsa_status === "failed" && (
            <Button variant="secondary" busy={busy === "tsa"} onClick={() => run("tsa", async () => { setData(await api.post<Evidence>(`/evidence/${id}/timestamp`)); })}>
              Retry timestamp
            </Button>
          )}
        </div>
      </div>
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Preview" actions={isImage && !showOriginal && <Button variant="ghost" onClick={() => setShowOriginal(true)}>Open original</Button>}>
          {isImage ? (
            <div className="space-y-2">
              <AuthedImage
                path={showOriginal ? `/evidence/${id}/file?purpose=view` : `/evidence/${id}/thumbnail.jpg`}
                alt={e.filename}
                className="max-h-[32rem] w-full rounded-lg object-contain"
              />
              <p className="text-xs text-muted">
                {showOriginal ? "You are viewing the original. This view was recorded in the chain of custody." : "Showing a preview copy. Opening the original is recorded in the chain of custody."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">No preview for {e.mime}. Download the original to open it.</p>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Integrity record">
            <dl className="divide-y divide-border">
              <Field label="SHA-256"><span className="font-mono text-xs break-all">{e.sha256}</span></Field>
              <Field label="Size">{formatBytes(e.size)} · {e.mime}</Field>
              <Field label="Captured">{m.captured_at ? formatTs(m.captured_at as string) : "unknown"} {m.captured_at && <span className="text-xs text-muted">(device clock)</span>}</Field>
              <Field label="Received">{formatTs(e.received_at)}</Field>
              <Field label="Trusted time">{e.tsa_time ? <>existed by {formatTs(e.tsa_time)} <span className="text-xs text-muted">(FreeTSA)</span></> : e.tsa_status}</Field>
              <Field label="Device">{e.device ? `${e.device.name}${e.device.revoked ? " (revoked)" : ""}` : "—"}</Field>
              <Field label="Signature">{e.signature ? <Hash value={e.signature} /> : "none"}</Field>
            </dl>
            {e.provenance === "device_signed" && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted hover:text-ink">Signed manifest</summary>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{JSON.stringify(m, null, 2)}</pre>
              </details>
            )}
          </Card>
          {m.gps && (
            <Card title="Capture location">
              <MapView className="h-56" points={[{ ...m.gps, label: e.filename }]} />
              <p className="mt-2 text-xs text-muted">{m.gps.lat.toFixed(6)}, {m.gps.lon.toFixed(6)} · accuracy ±{m.gps.accuracy ?? "?"} m</p>
            </Card>
          )}
        </div>
      </div>

      {isImage && (
        <Card
          title="Photo forensics"
          actions={canWrite && <Button onClick={analyze} busy={busy === "analyze"}>{e.forensics ? "Run again" : "Run analysis"}</Button>}
        >
          {e.forensics ? (
            <ForensicsView
              report={e.forensics}
              original={{ kind: "path", path: `/evidence/${id}/thumbnail.jpg` }}
              ela={e.forensics.checks.ela.has_ela_image ? { kind: "path", path: `/evidence/${id}/forensics/ela.png` } : null}
              copymove={e.forensics.checks.copy_move.has_copymove_image ? { kind: "path", path: `/evidence/${id}/forensics/copymove.png` } : null}
              key={e.forensics.score + e.forensics.verdict}
            />
          ) : (
            <p className="text-sm text-muted">
              Not analysed yet. The analysis checks metadata, error levels (ELA), cloned areas and Content Credentials.
              {!canWrite && " An investigator or supervisor can run it."}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
