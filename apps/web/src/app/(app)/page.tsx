"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, ErrorBox, Loading, Pill, inputClass } from "@/components/ui";
import { api, formatTs, type Case } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

export default function CasesPage() {
  const { user } = useAuth();
  const { data: cases, error, loading, reload } = useApi<Case[]>("/cases");
  const [creating, setCreating] = useState(false);
  const canCreate = user?.role !== "auditor";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="text-sm text-muted">Every case keeps its own hash-chained custody log.</p>
        </div>
        {canCreate && !creating && <Button onClick={() => setCreating(true)}>New case</Button>}
      </div>

      {creating && <NewCase onDone={() => { setCreating(false); reload(); }} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && !cases ? (
        <Loading />
      ) : cases?.length === 0 ? (
        <Card><p className="text-sm text-muted">No cases yet.{canCreate && " Create one, then capture evidence from the ChainProof phone app."}</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cases?.map((c) => (
            <Link key={c.id} href={`/cases/${c.id}`} className="group rounded-xl border border-border bg-surface p-4 transition hover:border-accent">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium group-hover:text-accent">{c.title}</h2>
                <Pill tone={c.status === "open" ? "ok" : "neutral"}>{c.status}</Pill>
              </div>
              {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
              <div className="mt-3 flex justify-between text-xs text-muted">
                <span className="font-mono">#{c.id.slice(0, 8).toUpperCase()}</span>
                <span>{c.evidence_count} items · {formatTs(c.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCase({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="New case">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post("/cases", { title, description });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <input className={inputClass} placeholder="Title, e.g. Warehouse break-in" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        <textarea className={inputClass} placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>Create case</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
