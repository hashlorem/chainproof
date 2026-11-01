"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { ComparePanel } from "@/components/CompareView";
import { CustodyTimeline } from "@/components/CustodyTimeline";
import { ExaminationPanel } from "@/components/ExaminationPanel";
import { ExaminationSteps, FileRecord, Findings, InspectorSection, Verdict, examinationSteps } from "@/components/Inspector";
import { MapView } from "@/components/MapView";
import { useStatusCase } from "@/components/Shell";
import { Viewer } from "@/components/Viewer";
import { Button, Card, ErrorBox, Field, Hash, Loading, cx } from "@/components/ui";
import { api, formatTs, type CustodyResponse, type Evidence, type EvidenceCheck, type Examination, type ForensicReport, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

/**
 * The examination workbench for one item (docs/REDESIGN.md, mockup G): the evidence in the middle, the inspector on
 * the right (verdict, findings with their error rates and innocent explanations, where the examination stands, the
 * file's record), and below it this item's custody entries, the examiner's notes, conclusion and review, and copies.
 */
export default function EvidencePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: e, error, setData } = useApi<Evidence>(`/evidence/${id}`);
  const integrity = useApi<EvidenceCheck & { checked_at: string }>(`/evidence/${id}/integrity`);
  const examQ = useApi<Examination>(`/evidence/${id}/examination`);
  const custodyQ = useApi<CustodyResponse>(e ? `/cases/${e.case_id}/custody` : null);
  const usersQ = useApi<User[]>("/auth/users");
  const [examKey, setExamKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canWrite = user?.role !== "auditor";
  useStatusCase(e?.case_id);

  const users = useMemo(() => new Map((usersQ.data ?? []).map((u) => [u.id, u])), [usersQ.data]);
  const itemEntries = useMemo(() => (custodyQ.data?.entries ?? []).filter((x) => x.evidence_id === id), [custodyQ.data, id]);

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
  const isImage = e.mime.startsWith("image/");
  const isVideo = e.mime.startsWith("video/");
  const report = e.forensics;

  const analyze = () =>
    run("analyze", async () => {
      const r = await api.post<ForensicReport>(`/evidence/${id}/analyze`);
      setData({ ...e, forensics: r, forensics_label: r.label, forensics_verdict: r.verdict });
      custodyQ.reload();
    });
  const download = () =>
    run("download", async () => {
      const { blob } = await api.blob(`/evidence/${id}/file?purpose=download`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = e.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      custodyQ.reload();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/cases/${e.case_id}`} className="text-[13px] text-muted hover:text-ink">← Case {e.case_id.slice(0, 8).toUpperCase()}</Link>
          <h1 className="heading truncate text-2xl">{e.filename}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download} busy={busy === "download"}>Download original</Button>
          {e.tsa_status === "failed" && (
            <Button variant="secondary" busy={busy === "tsa"} onClick={() => run("tsa", async () => { setData(await api.post<Evidence>(`/evidence/${id}/timestamp`)); })}>
              Retry timestamp
            </Button>
          )}
          {isImage && canWrite && <Button onClick={analyze} busy={busy === "analyze"}>{report ? "Run analysis again" : "Run analysis"}</Button>}
        </div>
      </div>
      {actionError && <ErrorBox>{actionError}</ErrorBox>}
      <PreservationBanner check={integrity.data} error={integrity.error} />

      <div className="flex flex-wrap items-start gap-4">
        {/* The viewer stays in view while the inspector scrolls: eyes on the evidence while reading the findings. */}
        <div className="min-w-0 flex-[999_1_560px] lg:sticky lg:top-16">
          {isImage || isVideo ? (
            <Viewer evidenceId={id} filename={e.filename} report={report} isVideo={isVideo} key={report ? report.score + report.verdict : "none"} />
          ) : (
            <Card title="Preview"><p className="text-muted">No preview for {e.mime}. Download the original to open it.</p></Card>
          )}
        </div>

        <aside aria-label="Inspector" className="flex min-w-0 flex-[1_1_320px] flex-col gap-5 rounded-lg bg-surface p-4 lg:max-w-[380px]">
          {report ? (
            <>
              <InspectorSection title="Automated verdict"><Verdict report={report} /></InspectorSection>
              <InspectorSection title="Findings"><Findings findings={report.findings} /></InspectorSection>
            </>
          ) : (
            <InspectorSection title="Automated verdict">
              <p className="text-muted">{isImage ? "Not analysed yet." : "Photo checks only run on images."}{isImage && !canWrite && " An investigator or supervisor can run it."}</p>
            </InspectorSection>
          )}
          <InspectorSection title="Examination"><ExaminationSteps steps={examinationSteps(e, examQ.data)} /></InspectorSection>
          <InspectorSection title="File"><FileRecord e={e} /></InspectorSection>
          {report && <TechnicalDetails report={report} />}
          {e.provenance === "device_signed" && (
            <details>
              <summary className="cursor-pointer text-muted hover:text-ink">Signed manifest and signature</summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-bg p-3 font-mono text-xs">{JSON.stringify(e.manifest, null, 2)}</pre>
              {e.signature && <p className="mt-1 text-xs text-muted">Signature <Hash value={e.signature} /></p>}
            </details>
          )}
          {e.manifest.gps && (
            <InspectorSection title="Capture location">
              <MapView className="h-44 rounded-md" points={[{ ...e.manifest.gps, label: e.filename }]} />
              <p className="text-xs text-muted">{e.manifest.gps.lat.toFixed(6)}, {e.manifest.gps.lon.toFixed(6)} · ±{e.manifest.gps.accuracy ?? "?"} m</p>
            </InspectorSection>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card title={`Custody log · this item · ${itemEntries.length}`} className="min-w-0 flex-[2_1_420px]"
              actions={<Link href={`/cases/${e.case_id}`} className="text-[13px] text-accent hover:underline">Whole case</Link>}>
          {custodyQ.data ? (
            <CustodyTimeline entries={itemEntries} users={users} evidenceNames={new Map([[id, "this item"]])} />
          ) : <Loading />}
        </Card>
        {isImage && (
          <Card title="Compare a copy with this original" className="min-w-0 flex-[1_1_320px]">
            <ComparePanel evidenceId={id} onCompared={() => { setExamKey((k) => k + 1); examQ.reload(); custodyQ.reload(); }} />
          </Card>
        )}
      </div>

      <ExaminationPanel key={examKey} evidenceId={id} canWrite={canWrite} userId={user?.id} analysed={!!report}
                        onChange={(x) => { examQ.setData(x); custodyQ.reload(); }} />
    </div>
  );
}

/** "Did you change the evidence?" answered before anyone asks: the stored file re-hashed when this page opened. */
function PreservationBanner({ check, error }: { check: (EvidenceCheck & { checked_at: string }) | null; error: string | null }) {
  if (error) return <ErrorBox>Could not re-check this item: {error}</ErrorBox>;
  if (!check) return <div className="h-8" />;
  const hash = check.checks.file_hash;
  const failed = Object.values(check.checks).filter((c) => c.ok === false);
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-[13px]", failed.length ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok")}>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <path d={failed.length ? "M6 6l12 12M18 6L6 18" : "M5 12.5l4.5 4.5L19 7.5"} />
      </svg>
      <span className="font-medium">
        {failed.length ? failed.map((c) => c.detail).join("; ") : `Stored file re-hashed ${formatTs(check.checked_at)}: matches the SHA-256 recorded at intake`}
      </span>
      {!failed.length && hash && <span className="text-xs opacity-80">{Object.keys(check.checks).length > 1 && "Signature, timestamp and kept copies re-checked too."}</span>}
    </div>
  );
}

function TechnicalDetails({ report }: { report: ForensicReport }) {
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
