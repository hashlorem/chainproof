"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ComparePanel } from "@/components/CompareView";
import { Dropzone } from "@/components/Dropzone";
import { Findings, InspectorSection, TechnicalDetails, Verdict } from "@/components/Inspector";
import { ImageViewer, reportViews, type View } from "@/components/Viewer";
import { Button, Card, ErrorBox, Loading, PageTitle, Pill, inputClass } from "@/components/ui";
import { api, formatTs, type Case, type Evidence, type ForensicReport, type MatchResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

export default function AnalyzePage() {
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [matches, setMatches] = useState<MatchResponse | null>(null);
  const [caseId, setCaseId] = useState("");
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = user?.role !== "auditor";
  const { data: cases } = useApi<Case[]>(canWrite ? "/cases" : null);
  const openCases = (cases ?? []).filter((c) => c.status === "open");

  /** Files the photo into a case as imported evidence (recorded in custody) and opens its examination. */
  async function openExamination() {
    if (!file || !caseId) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const ev = await api.post<Evidence>(`/cases/${caseId}/evidence`, fd);
      await api.post(`/evidence/${ev.id}/analyze`);
      router.push(`/evidence/${ev.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function analyze(file: File) {
    setFile(file);
    setBusy(true);
    setError(null);
    setReport(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const [analysis, found] = await Promise.all([
        api.post<ForensicReport>("/forensics/analyze", fd),
        api.post<MatchResponse>("/forensics/match", fd).catch(() => null),
      ]);
      setReport(analysis);
      setMatches(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const views: View[] = report && preview ? [
    { id: "photo", label: "Photo", hint: "The file you dropped. It stays in this browser and the server keeps nothing.", src: { kind: "inline", url: `data:${file?.type || "image/jpeg"};base64,${preview}` } },
    ...reportViews(report, (name) => ({ kind: "inline", url: name === "ela" ? `data:image/png;base64,${report.checks.ela.heatmap_png}` : `data:image/jpeg;base64,${report.checks.copy_move.overlay_jpg}` })),
  ] : [];
  const reset = () => { setReport(null); setPreview(null); setFile(null); setMatches(null); };

  return (
    <div className="space-y-5">
      <PageTitle kicker="Quick check · not recorded" actions={report && <Button variant="secondary" onClick={reset}>Check another photo</Button>}>
        Check a photo
      </PageTitle>
      <p className="-mt-3 max-w-3xl text-[13px] text-muted">
        Look for signs of editing in any image: a tip from the public, a screenshot from social media, a photo from a suspect&apos;s phone.
        Nothing is saved and nothing is added to a case.
      </p>
      {!report && !busy && (
        <Dropzone onFile={analyze} accept="image/*">
          <div>
            <p className="font-medium">Drop an image here</p>
            <p className="text-muted">JPEG, PNG or WebP, up to 40 MB</p>
          </div>
        </Dropzone>
      )}
      {busy && <Loading label="Analysing: metadata, file history, cloned areas, Content Credentials…" />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {report && (
        <>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-[999_1_560px] lg:sticky lg:top-16">
              <ImageViewer views={views} report={report} initial={report.checks.copy_move.overlay_jpg ? "clones" : "photo"} />
            </div>
            <aside aria-label="Inspector" className="flex min-w-0 flex-[1_1_320px] flex-col gap-5 rounded-lg bg-surface p-4 lg:max-w-[380px]">
              <InspectorSection title="Automated verdict"><Verdict report={report} /></InspectorSection>
              <InspectorSection title="Findings"><Findings findings={report.findings} /></InspectorSection>
              {report.validation !== undefined && (
                <p className="text-xs text-muted">
                  {report.validation
                    ? `Error rates measured ${report.validation.validated_at.slice(0, 10)} on a labelled set of real phone photos.`
                    : "These checks have not been validated yet; their error rates are unknown."}
                </p>
              )}
              <TechnicalDetails report={report} />
            </aside>
          </div>
          {matches && (
            <Card title="Copies of your evidence">
              <div className="space-y-3">
              {matches.matches.length === 0 ? (
                <p className="text-sm text-muted">This photo doesn&apos;t look like any image held as evidence, even allowing for re-saving, resizing or rotation.</p>
              ) : (
                <ul className="space-y-3">
                  {matches.matches.map((m) => (
                    <li key={m.evidence_id} className="space-y-2 rounded-md bg-surface-2 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span>
                          <Link href={`/evidence/${m.evidence_id}`} className="font-semibold underline">{m.filename}</Link>
                          <span className="text-muted"> · {m.case_title ?? "case"} · received {formatTs(m.received_at)}</span>
                        </span>
                        {m.identical ? <Pill tone="ok">Identical file</Pill>
                          : m.kind === "edited_copy" ? <Pill tone="bad">{`Same scene, visibly changed · ${m.scene_points} matching points`}</Pill>
                          : <Pill tone="warn">{`Visual match · ${m.distance}/64 bits apart`}</Pill>}
                      </div>
                      {!m.identical && <ComparePanel evidenceId={m.evidence_id} initialFile={file} />}
                    </li>
                  ))}
                </ul>
              )}
              {matches.validation && <p className="text-xs text-muted"><span className="eyebrow">How reliable</span> {matches.validation}</p>}
              </div>
            </Card>
          )}
          {canWrite && (
            <Card title="Investigate this photo properly">
              <p className="mb-3 text-[13px] text-muted">
                A quick check isn&apos;t recorded anywhere. To keep notes, record a conclusion, get it reviewed and export a report,
                file the photo into a case. Its hash is recorded on arrival and every step goes into the chain of custody.
              </p>
              <div className="flex flex-wrap gap-2">
                <select className={`${inputClass} w-auto min-w-64`} value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label="Case">
                  <option value="">Choose an open case…</option>
                  {openCases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <Button onClick={openExamination} disabled={!caseId || !file} busy={busy}>Open an examination</Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
