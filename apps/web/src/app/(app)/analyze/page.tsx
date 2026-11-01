"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ComparePanel } from "@/components/CompareView";
import { Dropzone } from "@/components/Dropzone";
import { ForensicsView } from "@/components/ForensicsView";
import { Button, Card, ErrorBox, Loading, Pill, inputClass } from "@/components/ui";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading text-2xl">Check a photo</h1>
        <p className="text-sm text-muted">
          Look for signs of editing in any image: a tip from the public, a screenshot from social media, a photo from a suspect&apos;s phone.
          Nothing is saved and nothing is added to a case.
        </p>
      </div>
      {!report && !busy && (
        <Dropzone onFile={analyze} accept="image/*">
          <div>
            <p className="font-medium">Drop an image here</p>
            <p className="text-muted">JPEG, PNG or WebP, up to 40 MB</p>
          </div>
        </Dropzone>
      )}
      {busy && <Loading label="Analysing: metadata, error levels, cloned areas, Content Credentials…" />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {report && (
        <Card title="Result" actions={<Button variant="secondary" onClick={() => { setReport(null); setPreview(null); setFile(null); setMatches(null); }}>Check another</Button>}>
          <ForensicsView
            report={report}
            original={preview ? { kind: "b64", data: preview, mime: file?.type || "image/jpeg" } : null}
            ela={report.checks.ela.heatmap_png ? { kind: "b64", data: report.checks.ela.heatmap_png } : null}
            copymove={report.checks.copy_move.overlay_jpg ? { kind: "b64", data: report.checks.copy_move.overlay_jpg, mime: "image/jpeg" } : null}
          />
          {matches && (
            <div className="mt-6 space-y-3 border-t border-border pt-4">
              <h3 className="heading text-lg">Copies of your evidence</h3>
              {matches.matches.length === 0 ? (
                <p className="text-sm text-muted">This photo doesn&apos;t look like any image held as evidence, even allowing for re-saving, resizing or rotation.</p>
              ) : (
                <ul className="space-y-3">
                  {matches.matches.map((m) => (
                    <li key={m.evidence_id} className="space-y-2 rounded-lg border border-border p-3">
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
          )}
          {canWrite && (
            <div className="mt-6 space-y-2 border-t border-border pt-4">
              <h3 className="heading text-lg">Investigate this photo properly</h3>
              <p className="text-sm text-muted">
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
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
