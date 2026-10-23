"use client";

import { verifyChain, type ChainCheck } from "@chainproof/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AuthedImage } from "@/components/AuthedImage";
import { CustodyTimeline } from "@/components/CustodyTimeline";
import { Dropzone } from "@/components/Dropzone";
import { MapView, type MapPoint } from "@/components/MapView";
import { Button, Card, CheckPill, ErrorBox, Hash, Loading, Pill, cx, inputClass } from "@/components/ui";
import { api, formatBytes, formatTs, type Case, type CustodyResponse, type Evidence, type User, type Verification } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

type CaseDetail = Case & { evidence: Evidence[] };

const VERDICT_TONE = { verified_capture: "ok", no_signs: "ok", suspicious: "warn", likely_manipulated: "bad", ai_generated: "bad" } as const;

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const caseQ = useApi<CaseDetail>(`/cases/${id}`);
  const custodyQ = useApi<CustodyResponse>(`/cases/${id}/custody`);
  const usersQ = useApi<User[]>("/auth/users");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [localCheck, setLocalCheck] = useState<ChainCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"transfer" | "close" | "reopen" | null>(null);

  const users = useMemo(() => new Map((usersQ.data ?? []).map((u) => [u.id, u])), [usersQ.data]);
  const c = caseQ.data;
  const evidenceNames = useMemo(() => new Map((c?.evidence ?? []).map((e, i) => [e.id, `Item ${String(i + 1).padStart(2, "0")}`])), [c]);
  const points = useMemo<MapPoint[]>(
    () => (c?.evidence ?? []).flatMap((e, i) => (e.manifest.gps ? [{ ...e.manifest.gps, label: `Item ${String(i + 1).padStart(2, "0")} · ${e.filename}` }] : [])),
    [c],
  );
  const checksById = useMemo(() => new Map((verification?.evidence ?? []).map((v) => [v.evidence_id, v])), [verification]);
  const canWrite = user?.role !== "auditor";
  const isOpen = c?.status === "open";
  const canClose = isOpen && (user?.role === "supervisor" || c?.custodian_id === user?.id);
  const canReopen = !isOpen && user?.role === "supervisor";
  const toggle = (p: NonNullable<typeof panel>) => setPanel((cur) => (cur === p ? null : p));
  const afterChange = () => {
    setPanel(null);
    caseQ.reload();
    custodyQ.reload();
  };

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const verify = () =>
    run("verify", async () => {
      const report = await api.post<Verification>(`/cases/${id}/verify`);
      // Don't just trust the server: download the chain and re-check every hash and signature in this browser.
      const custody = await api.get<CustodyResponse>(`/cases/${id}/custody`);
      setLocalCheck(verifyChain(custody.entries, custody.server_public_key_hex));
      setVerification(report);
      custodyQ.setData(custody);
    });

  const exportPdf = () =>
    run("pdf", async () => {
      const { blob } = await api.blob(`/cases/${id}/report`, { method: "POST" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `chainproof-${id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      await custodyQ.reload();
    });

  const importFile = (file: File) =>
    run("upload", async () => {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/cases/${id}/evidence`, fd);
      await Promise.all([caseQ.reload(), custodyQ.reload()]);
    });

  if (caseQ.error) return <ErrorBox>{caseQ.error}</ErrorBox>;
  if (!c) return <Loading />;
  const brokenAt = verification && !verification.chain.ok ? verification.chain.broken_at : localCheck && !localCheck.ok ? localCheck.brokenAt : null;

  return (
    <div className="space-y-6">
      <nav className="flex gap-3 text-xs uppercase tracking-[0.08em] text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink hover:underline">Cases</Link>
        <span aria-hidden>/</span>
        <span>{c.id.slice(0, 8).toUpperCase()}</span>
      </nav>

      <section aria-label="Case record" className="border-2 border-rule bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule px-5 py-5">
          <div className="min-w-0 max-w-3xl space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-bad">Chain of custody record</div>
            <h1 className="heading text-4xl sm:text-5xl">{c.title}</h1>
            {c.description && <p className="text-sm text-muted">{c.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportPdf} busy={busy === "pdf"}>Export PDF</Button>
            {canWrite && isOpen && <Button variant="secondary" onClick={() => toggle("transfer")}>Transfer custody</Button>}
            {canClose && <Button variant="secondary" onClick={() => toggle("close")}>Close case</Button>}
            {canReopen && <Button variant="secondary" onClick={() => toggle("reopen")}>Reopen case</Button>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-rule md:grid-cols-4">
          <RecordField label="Case no.">{c.id.slice(0, 8).toUpperCase()}</RecordField>
          <RecordField label="Status">{isOpen ? "Open" : "Closed"}</RecordField>
          <RecordField label="Current custodian">{users.get(c.custodian_id)?.name ?? "…"}</RecordField>
          <RecordField label="Opened">{formatTs(c.created_at)}</RecordField>
        </dl>
      </section>

      {error && <ErrorBox>{error}</ErrorBox>}
      {panel === "transfer" && <Transfer caseId={id} users={usersQ.data ?? []} currentId={c.custodian_id} onDone={afterChange} />}
      {panel === "close" && (
        <ReasonForm
          title="Close case"
          hint="Closing seals the case: no new evidence or custody transfers. Viewing, verifying and reports still work. Only a supervisor can reopen it."
          placeholder="Reason, e.g. investigation complete"
          action="Close case"
          path={`/cases/${id}/close`}
          onDone={afterChange}
        />
      )}
      {panel === "reopen" && (
        <ReasonForm title="Reopen case" placeholder="Reason, e.g. new lead" action="Reopen" path={`/cases/${id}/reopen`} onDone={afterChange} />
      )}
      <IntegrityStrip v={verification} local={localCheck} onVerify={verify} busy={busy === "verify"} />

      <div className="grid items-start gap-6 lg:grid-cols-[1.8fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section aria-label="Evidence items" className="border-2 border-rule bg-surface">
            <header className="flex items-center justify-between gap-3 border-b-2 border-rule px-4 py-3">
              <h2 className="heading text-xl">Evidence items · {c.evidence.length}</h2>
            </header>
            {c.evidence.length === 0 ? (
              <p className="p-4 text-sm text-muted">No evidence yet. Capture photos with the ChainProof phone app, or import a file below.</p>
            ) : (
              <EvidenceTable evidence={c.evidence} checksById={checksById} />
            )}
            {canWrite && isOpen && (
              <div className="border-t border-rule p-4">
                <Dropzone onFile={importFile} disabled={busy === "upload"}>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.06em]">{busy === "upload" ? "Uploading…" : "Import a file"}</p>
                    <p className="text-muted">Drop a file or click to choose. Imported files have no capture signature. Use the phone app for signed evidence.</p>
                  </div>
                </Dropzone>
              </div>
            )}
          </section>
          <Card title="Where evidence was captured">
            <MapView points={points} />
          </Card>
        </div>

        <Card title="Custody log" actions={<span className="text-xs text-muted">{custodyQ.data?.entries.length ?? 0} entries · append-only</span>} className="min-w-0">
          {custodyQ.data ? (
            <CustodyTimeline entries={custodyQ.data.entries} users={users} brokenAt={brokenAt} evidenceNames={evidenceNames} />
          ) : (
            <Loading />
          )}
        </Card>
      </div>
    </div>
  );
}

function RecordField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-base font-semibold">{children}</dd>
    </div>
  );
}

const BAD_VERDICTS = new Set(["likely_manipulated", "ai_generated"]);

function EvidenceTable({ evidence, checksById }: { evidence: Evidence[]; checksById: Map<string, Verification["evidence"][number]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="eyebrow text-left">
            <th className="border-b border-rule px-4 py-2 font-medium">Item</th>
            <th className="border-b border-rule px-3 py-2 font-medium">File · SHA-256</th>
            <th className="border-b border-rule px-3 py-2 font-medium">Origin</th>
            <th className="border-b border-rule px-4 py-2 font-medium">Findings</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((e, i) => {
            const check = checksById.get(e.id);
            const flagged = check?.ok === false || (e.forensics_verdict != null && BAD_VERDICTS.has(e.forensics_verdict));
            const gps = e.manifest.gps;
            return (
              <tr key={e.id} className={cx("border-b border-border align-top last:border-b-0", flagged && "bg-bad-bg")}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-base font-semibold">{String(i + 1).padStart(2, "0")}</span>
                    <Link href={`/evidence/${e.id}`} className="block size-[52px] shrink-0 border border-rule bg-surface-2" aria-label={`Open ${e.filename}`}>
                      {e.mime.startsWith("image/") ? (
                        <AuthedImage path={`/evidence/${e.id}/thumbnail.jpg`} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center text-[10px] uppercase tracking-[0.08em] text-muted">{e.mime.startsWith("video/") ? "Video" : "File"}</span>
                      )}
                    </Link>
                  </div>
                </td>
                <td className="max-w-64 px-3 py-3">
                  <Link href={`/evidence/${e.id}`} className="block truncate font-semibold underline-offset-4 hover:underline">{e.filename}</Link>
                  <div className="flex flex-wrap gap-x-1 text-muted"><Hash value={e.sha256} short={8} /> · {formatBytes(e.size)}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="whitespace-nowrap">{e.provenance === "device_signed" ? "Signed capture" : "Imported · unsigned"}</div>
                  <div className="whitespace-nowrap text-muted">{gps ? `${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}` : "No GPS"}</div>
                  <div className="whitespace-nowrap text-muted">
                    {gps?.accuracy != null && `±${Math.round(gps.accuracy)} m · `}
                    {e.tsa_status === "stamped" ? "TSA stamped" : `TSA ${e.tsa_status}`}
                  </div>
                </td>
                <td className="space-y-1 px-4 py-3">
                  {e.forensics_label ? (
                    <Pill tone={VERDICT_TONE[e.forensics_verdict!]}>{e.forensics_label}</Pill>
                  ) : (
                    <span className="text-muted">{e.mime.startsWith("image/") ? "Not analysed" : "—"}</span>
                  )}
                  {check && <div><CheckPill ok={check.ok}>{check.ok ? "intact" : "failed"}</CheckPill></div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IntegrityStrip({ v, local, onVerify, busy }: { v: Verification | null; local: ChainCheck | null; onVerify: () => void; busy: boolean }) {
  if (!v) {
    return (
      <section aria-label="Integrity check" className="flex flex-wrap items-center gap-x-6 gap-y-3 border-2 border-rule bg-surface px-5 py-4">
        <div className="heading border-2 border-rule px-4 py-2 text-2xl">Not checked</div>
        <p className="min-w-60 flex-1 text-sm text-muted">
          Verify re-hashes every stored file, checks each device signature and timestamp, and walks the custody chain. Your browser then re-checks the chain on its own.
        </p>
        <Button onClick={onVerify} busy={busy}>Verify integrity</Button>
      </section>
    );
  }
  const tally = (key: string) => {
    const results = v.evidence.map((e) => e.checks[key]?.ok).filter((ok) => ok != null);
    return { ok: results.filter(Boolean).length, total: results.length };
  };
  const sig = tally("device_signature");
  const tsa = tally("trusted_timestamp");
  const files = tally("file_hash");
  const unsigned = v.evidence.length - sig.total;
  const failures = v.evidence.filter((e) => !e.ok);
  return (
    <section aria-label="Integrity check" className={cx("border-2 bg-surface", v.ok ? "border-rule" : "border-bad")}>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3 px-5 py-4">
        <div className={cx("flex items-center gap-3 border-2 px-4 py-2", v.ok ? "border-ok text-ok" : "border-bad bg-bad-bg text-bad")}>
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            {v.ok ? <path d="M4 12l5 5L20 6" /> : <path d="M6 6l12 12M18 6L6 18" />}
          </svg>
          <span className="heading text-2xl">{v.ok ? "Chain intact" : "Integrity failed"}</span>
        </div>
        <dl className="flex flex-wrap gap-x-7 gap-y-2">
          <Stat label="Entries">{v.chain.ok ? `${v.chain.length} of ${v.chain.length} linked` : `Broken at #${v.chain.broken_at}`}</Stat>
          <Stat label="Device signatures">{sig.ok} of {sig.total} valid{unsigned > 0 && ` · ${unsigned} imported`}</Stat>
          <Stat label="Trusted timestamps">{tsa.ok} of {tsa.total}</Stat>
          <Stat label="Files re-hashed">{files.ok} of {files.total} match</Stat>
        </dl>
        <Button variant="secondary" onClick={onVerify} busy={busy} className="ml-auto">Verify again</Button>
      </div>
      <ul className="space-y-0.5 border-t border-border px-5 py-3 text-xs">
        {!v.chain.ok && <li className="font-semibold text-bad">Server: chain broken at entry #{v.chain.broken_at}: {v.chain.reason}.</li>}
        {local && (
          <li className={local.ok ? "text-muted" : "font-semibold text-bad"}>
            Re-checked in this browser:{" "}
            {local.ok ? `all ${local.length} hashes and server signatures match, including the entry that logs this check.` : `broken at entry #${local.brokenAt}: ${local.reason}.`}
          </li>
        )}
        {failures.map((e) => (
          <li key={e.evidence_id} className="text-bad">
            <b>{e.filename}</b>: {Object.values(e.checks).filter((c) => c.ok === false).map((c) => c.detail).join("; ")}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="text-sm font-semibold">{children}</dd>
    </div>
  );
}

function Transfer({ caseId, users, currentId, onDone }: { caseId: string; users: User[]; currentId: string; onDone: () => void }) {
  const options = users.filter((u) => u.id !== currentId && u.role !== "auditor");
  const [to, setTo] = useState(options[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Transfer custody">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post(`/cases/${caseId}/transfer`, { to_user_id: to, reason });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <select className={`${inputClass} max-w-56`} value={to} onChange={(e) => setTo(e.target.value)}>
          {options.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
        </select>
        <input className={`${inputClass} min-w-48 flex-1`} placeholder="Reason, e.g. sent to lab" value={reason} onChange={(e) => setReason(e.target.value)} required />
        <Button type="submit" busy={busy} disabled={!to}>Transfer</Button>
      </form>
      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
    </Card>
  );
}

function ReasonForm({ title, hint, placeholder, action, path, onDone }: {
  title: string; hint?: string; placeholder: string; action: string; path: string; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title={title}>
      {hint && <p className="mb-3 text-sm text-muted">{hint}</p>}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post(path, { reason });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <input className={`${inputClass} min-w-48 flex-1`} placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        <Button type="submit" busy={busy}>{action}</Button>
      </form>
      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
    </Card>
  );
}
