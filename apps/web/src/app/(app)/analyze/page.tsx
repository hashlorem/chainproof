"use client";

import { useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { ForensicsView } from "@/components/ForensicsView";
import { Button, Card, ErrorBox, Loading } from "@/components/ui";
import { api, type ForensicReport } from "@/lib/api";

export default function AnalyzePage() {
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setReport(await api.post<ForensicReport>("/forensics/analyze", fd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check a photo</h1>
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
        <Card title="Result" actions={<Button variant="secondary" onClick={() => { setReport(null); setPreview(null); }}>Check another</Button>}>
          <ForensicsView
            report={report}
            original={preview ? { kind: "b64", data: preview } : null}
            ela={report.checks.ela.heatmap_png ? { kind: "b64", data: report.checks.ela.heatmap_png } : null}
            copymove={report.checks.copy_move.overlay_png ? { kind: "b64", data: report.checks.copy_move.overlay_png } : null}
          />
        </Card>
      )}
    </div>
  );
}
