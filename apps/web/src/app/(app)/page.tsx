"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, ErrorBox, Loading, PageTitle, Pill, inputClass } from "@/components/ui";
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
      <PageTitle kicker="Every case keeps its own hash-chained custody log" actions={canCreate && !creating && <Button onClick={() => setCreating(true)}>New case</Button>}>
        Cases
      </PageTitle>

      {creating && <NewCase onDone={() => { setCreating(false); reload(); }} />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && !cases ? (
        <Loading />
      ) : cases?.length === 0 ? (
        <Card><p className="text-sm text-muted">No cases yet.{canCreate && " Create one, then capture evidence from the ChainProof phone app."}</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="eyebrow text-left">
                <th className="border-b border-border px-4 py-2.5 font-medium">Case no.</th>
                <th className="border-b border-border px-3 py-2.5 font-medium">Title</th>
                <th className="border-b border-border px-3 py-2.5 font-medium">Status</th>
                <th className="border-b border-border px-3 py-2.5 text-right font-medium">Items</th>
                <th className="border-b border-border px-4 py-2.5 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {cases?.map((c) => (
                <tr key={c.id} className="group border-b border-border last:border-b-0 hover:bg-surface-2">
                  <td className="px-4 py-3 align-top font-semibold">{c.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-3 py-3 align-top">
                    <Link href={`/cases/${c.id}`} className="font-semibold underline-offset-4 group-hover:underline">{c.title}</Link>
                    {c.description && <p className="mt-0.5 line-clamp-1 text-muted">{c.description}</p>}
                  </td>
                  <td className="px-3 py-3 align-top"><Pill tone={c.status === "open" ? "neutral" : "warn"}>{c.status}</Pill></td>
                  <td className="px-3 py-3 text-right align-top font-semibold">{c.evidence_count}</td>
                  <td className="whitespace-nowrap px-4 py-3 align-top text-muted">{formatTs(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <textarea className={`${inputClass} h-auto py-2`} placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>Create case</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
