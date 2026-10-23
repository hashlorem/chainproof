"use client";

import { useEffect, useState } from "react";
import { API_URL, formatTs, type Check } from "@/lib/api";
import { CheckPill, ErrorBox, Hash, Loading } from "./ui";

type Match = {
  evidence_id: string; case_reference: string; received_at: string; captured_at: string | null;
  provenance: string; tsa_time: string | null; intact: boolean; checks: Record<string, Check>;
};
type Result =
  | { sha256: string; found: false }
  | { sha256: string; found: true; kind: "evidence"; matches: Match[] }
  | { sha256: string; found: true; kind: "report"; report: { case_reference: string; generated_at: string } };

const CHECK_LABEL: Record<string, string> = {
  file_hash: "Stored file unchanged",
  device_signature: "Signed on device at capture",
  trusted_timestamp: "Trusted timestamp",
  chain_of_custody: "Chain of custody",
};

export function PublicResult({ sha256 }: { sha256: string }) {
  const [state, setState] = useState<{ sha: string; result?: Result; error?: string } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/public/verify/${sha256}`)
      .then(async (r) => setState(r.ok ? { sha: sha256, result: await r.json() } : { sha: sha256, error: (await r.json()).detail ?? r.statusText }))
      .catch((e) => setState({ sha: sha256, error: String(e) }));
  }, [sha256]);

  if (state?.sha !== sha256) return <Loading label="Looking up the record…" />;
  if (state.error || !state.result) return <ErrorBox>{state.error ?? "Lookup failed"}</ErrorBox>;
  const result = state.result;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">SHA-256 <Hash value={sha256} short={0} /></p>
      {!result.found ? (
        <div className="border-2 border-bad bg-bad-bg p-4">
          <div className="heading text-2xl text-bad">No matching record</div>
          <p className="text-sm">This exact file is not registered with ChainProof. If it should be, it has been changed, even by one byte.</p>
        </div>
      ) : result.kind === "report" ? (
        <div className="border-2 border-ok bg-surface p-4">
          <div className="heading text-2xl text-ok">Authentic ChainProof report</div>
          <p className="text-sm">Generated {formatTs(result.report.generated_at)} for case #{result.report.case_reference}. This PDF has not been changed since.</p>
        </div>
      ) : (
        result.matches.map((m) => (
          <div key={m.evidence_id} className={`border-2 p-4 ${m.intact ? "border-ok bg-surface" : "border-bad bg-bad-bg"}`}>
            <div className={`heading text-2xl ${m.intact ? "text-ok" : "text-bad"}`}>
              {m.intact ? "Registered evidence, intact" : "Registered evidence, but its record failed a check"}
            </div>
            <p className="text-sm">
              Case #{m.case_reference} · received {formatTs(m.received_at)}
              {m.captured_at && <> · captured {formatTs(m.captured_at)}</>}
              {m.tsa_time && <> · existed by {formatTs(m.tsa_time)} (trusted timestamp)</>}
            </p>
            <ul className="mt-3 space-y-1.5">
              {Object.entries(m.checks).map(([k, c]) => (
                <li key={k} className="flex flex-wrap items-center gap-2 text-sm">
                  <CheckPill ok={c.ok} /> <span className="font-medium">{CHECK_LABEL[k] ?? k}</span> <span className="text-muted">— {c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
