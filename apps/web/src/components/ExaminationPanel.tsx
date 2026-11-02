"use client";

import { useState, type FormEvent } from "react";
import { api, formatTs, type ConclusionLevel, type Examination } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, ErrorBox, Field, Loading, Pill, cx, inputClass } from "./ui";

const LEVEL_HELP: Record<ConclusionLevel, string> = {
  none: "The findings don't help decide between the two.",
  limited: "Slightly more expected if H1 is true.",
  moderate: "Clearly more expected if H1 is true.",
  strong: "Much more expected if H1 is true; alternatives considered and judged unlikely.",
  very_strong: "Alternatives very hard to sustain; method validated with a known error rate.",
};
const DEFAULT_H1 = "The image was altered after it was captured";
const DEFAULT_H2 = "The image is an unaltered record of what the camera captured";

/**
 * The examiner's side of an evidence item: notes, a conclusion on a stated scale, and a second examiner's review.
 * Everything posted here is a custody entry, so nothing can be edited or deleted afterwards. A changed mind is a new entry.
 */
export function ExaminationPanel({ evidenceId, canWrite, userId, analysed, onChange }: {
  evidenceId: string; canWrite: boolean; userId: string | undefined; analysed: boolean;
  /** Told about every new state, so the page's examination steps stay current. */
  onChange?: (exam: Examination) => void;
}) {
  const { data: exam, error, setData: setExam } = useApi<Examination>(`/evidence/${evidenceId}/examination`);
  const setData = (x: Examination) => {
    setExam(x);
    onChange?.(x);
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [concluding, setConcluding] = useState(false);
  const [form, setForm] = useState({ h1: DEFAULT_H1, h2: DEFAULT_H2, level: "" as ConclusionLevel | "", rationale: "", limitations: "" });
  const [review, setReview] = useState<{ agrees: boolean | null; comment: string }>({ agrees: null, comment: "" });

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

  if (error) return <Card title="Examination"><ErrorBox>{error}</ErrorBox></Card>;
  if (!exam) return <Card title="Examination"><Loading /></Card>;
  const c = exam.conclusion;
  const ownConclusion = c && c.by_id === userId;

  const addNote = (e: FormEvent) => {
    e.preventDefault();
    run("note", async () => {
      setData(await api.post<Examination>(`/evidence/${evidenceId}/notes`, { text: note }));
      setNote("");
    });
  };
  const conclude = (e: FormEvent) => {
    e.preventDefault();
    run("conclude", async () => {
      setData(await api.post<Examination>(`/evidence/${evidenceId}/conclusion`, form));
      setConcluding(false);
    });
  };
  const submitReview = (e: FormEvent) => {
    e.preventDefault();
    run("review", async () => {
      setData(await api.post<Examination>(`/evidence/${evidenceId}/review`, review));
      setReview({ agrees: null, comment: "" });
    });
  };
  const exportReport = () =>
    run("export", async () => {
      const { blob } = await api.blob(`/evidence/${evidenceId}/examination-report`, { method: "POST" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `examination-${evidenceId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  const downloadCopy = (sha256: string, filename: string) =>
    run(`copy-${sha256}`, async () => {
      const { blob } = await api.blob(`/evidence/${evidenceId}/compared/${sha256}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  const startConclusion = () => {
    if (c) setForm({ h1: c.h1, h2: c.h2, level: c.level_key, rationale: c.rationale, limitations: c.limitations });
    setConcluding(true);
  };

  return (
    <Card
      title="Examination"
      actions={<Button variant="secondary" onClick={exportReport} busy={busy === "export"} disabled={!analysed}
                       title={analysed ? undefined : "Run the analysis first"}>Examination report (PDF)</Button>}
    >
      <div className="space-y-6">
        <p className="text-sm text-muted">
          Notes, conclusion and review are written into the chain of custody. They can&apos;t be edited or deleted: to change your mind, add a new entry.
        </p>
        {actionError && <ErrorBox>{actionError}</ErrorBox>}

        <section className="space-y-2">
          <h3 className="heading text-lg">Notes</h3>
          {exam.notes.length === 0 ? <p className="text-sm text-muted">No notes yet. Write down what you did and saw, as you go.</p> : (
            <ol className="divide-y divide-border rounded-md border border-border">
              {exam.notes.map((n) => (
                <li key={n.seq} className="grid gap-1 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <span className="text-xs text-muted">#{n.seq} · {formatTs(n.ts)}<br />{n.by}</span>
                  <p className="whitespace-pre-wrap text-sm">{n.text}</p>
                </li>
              ))}
            </ol>
          )}
          {canWrite && (
            <form onSubmit={addNote} className="space-y-2">
              <textarea className={`${inputClass} h-auto py-2`} rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="What did you do, and what did you observe? Facts first, opinions later." aria-label="New note" />
              <Button type="submit" variant="secondary" busy={busy === "note"} disabled={!note.trim()}>Add note</Button>
            </form>
          )}
        </section>

        {exam.comparisons.length > 0 && (
          <section className="space-y-2">
            <h3 className="heading text-lg">Comparisons with copies</h3>
            <ol className="divide-y divide-border rounded-md border border-border">
              {exam.comparisons.map((c) => (
                <li key={c.seq} className="grid gap-2 p-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_auto_auto] sm:items-center">
                  <span className="text-xs text-muted">#{c.seq} · {formatTs(c.ts)}<br />{c.by}</span>
                  <span className="truncate">{c.filename} <span className="font-mono text-xs text-muted">{c.sha256.slice(0, 12)}…</span></span>
                  {c.regions > 0
                    ? <Pill tone="bad">{`${c.regions} changed region(s) · ${(c.changed_ratio * 100).toFixed(1)}%`}</Pill>
                    : <Pill tone="ok">No changes</Pill>}
                  {c.kept
                    ? <Button variant="ghost" onClick={() => downloadCopy(c.sha256, c.filename)} busy={busy === `copy-${c.sha256}`}
                              title="The questioned file, kept with this item. Downloading is logged.">Download copy</Button>
                    : <span className="text-xs text-muted" title="Compared before copies were kept">hash only</span>}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted">Each compared copy is kept with this item so the comparison can be repeated. Difference maps are in the examination report.</p>
          </section>
        )}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="heading text-lg">Conclusion</h3>
            {canWrite && !concluding && <Button variant="secondary" onClick={startConclusion}>{c ? "Revise conclusion" : "Record conclusion"}</Button>}
          </div>
          {c && !concluding && (
            <div className="rounded-lg border border-border">
              <p className="border-b border-border p-3 text-sm font-semibold">
                {c.level_key === "none" ? "The findings do not help decide between H1 and H2." : `The findings provide ${c.level} for H1 rather than H2.`}
              </p>
              <dl className="divide-y divide-border px-3">
                <Field label="H1">{c.h1}</Field>
                <Field label="H2">{c.h2}</Field>
                <Field label="Reasoning"><span className="whitespace-pre-wrap">{c.rationale}</span></Field>
                <Field label="Limitations"><span className="whitespace-pre-wrap">{c.limitations}</span></Field>
                <Field label="By">{c.by} · {formatTs(c.ts)}</Field>
              </dl>
            </div>
          )}
          {!c && !concluding && <p className="text-sm text-muted">No conclusion yet. The automated findings above are indicators, not an opinion.</p>}
          {concluding && (
            <form onSubmit={conclude} className="space-y-3 rounded-lg border border-border p-3">
              <label className="block space-y-1"><span className="eyebrow">H1 · the proposition you are testing</span>
                <input className={inputClass} value={form.h1} onChange={(e) => setForm({ ...form, h1: e.target.value })} required minLength={3} /></label>
              <label className="block space-y-1"><span className="eyebrow">H2 · the alternative</span>
                <input className={inputClass} value={form.h2} onChange={(e) => setForm({ ...form, h2: e.target.value })} required minLength={3} /></label>
              <fieldset className="space-y-1">
                <legend className="eyebrow mb-1">How much do the findings support H1 over H2?</legend>
                {(Object.keys(exam.levels) as ConclusionLevel[]).map((k) => (
                  <label key={k} className={cx("flex cursor-pointer gap-3 rounded-md border border-border p-2 text-sm", form.level === k && "bg-surface-2")}>
                    <input type="radio" name="level" value={k} checked={form.level === k} onChange={() => setForm({ ...form, level: k })} required />
                    <span><span className="font-semibold capitalize">{exam.levels[k]}</span> <span className="text-muted">· {LEVEL_HELP[k]}</span></span>
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-1"><span className="eyebrow">Reasoning · which findings, and why they point this way</span>
                <textarea className={`${inputClass} h-auto py-2`} rows={3} value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} required minLength={10} /></label>
              <label className="block space-y-1"><span className="eyebrow">Limitations · what could make this wrong, what you did not examine</span>
                <textarea className={`${inputClass} h-auto py-2`} rows={2} value={form.limitations} onChange={(e) => setForm({ ...form, limitations: e.target.value })} required minLength={10} /></label>
              <p className="text-xs text-muted">Never &ldquo;proves&rdquo;. Say how strongly the findings support one explanation over the other, and why.</p>
              <div className="flex gap-2">
                <Button type="submit" busy={busy === "conclude"} disabled={!form.level}>Record conclusion</Button>
                <Button type="button" variant="ghost" onClick={() => setConcluding(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </section>

        {c && (
          <section className="space-y-2">
            <h3 className="heading text-lg">Technical review</h3>
            {exam.review ? (
              <div className={cx("rounded-lg p-3 text-sm", exam.review.agrees ? "bg-ok-bg" : "bg-bad-bg")}>
                <Pill tone={exam.review.agrees ? "ok" : "bad"}>{exam.review.agrees ? "Agrees" : "Does not agree"}</Pill>
                <p className="mt-2 whitespace-pre-wrap">{exam.review.comment}</p>
                <p className="mt-1 text-xs text-muted">{exam.review.by} · {formatTs(exam.review.ts)}</p>
              </div>
            ) : ownConclusion ? (
              <p className="text-sm text-muted">Waiting for a second examiner. You can&apos;t review your own conclusion.</p>
            ) : canWrite ? (
              <form onSubmit={submitReview} className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm">Check the method and the wording. Could another examiner reach the same result from these notes?</p>
                <div className="flex gap-2">
                  <Button type="button" variant={review.agrees === true ? "primary" : "secondary"} onClick={() => setReview({ ...review, agrees: true })}>Agree</Button>
                  <Button type="button" variant={review.agrees === false ? "danger" : "secondary"} onClick={() => setReview({ ...review, agrees: false })}>Disagree</Button>
                </div>
                <textarea className={`${inputClass} h-auto py-2`} rows={2} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })}
                          placeholder="What you checked, and anything that should change." aria-label="Review comment" />
                <Button type="submit" busy={busy === "review"} disabled={review.agrees === null || review.comment.trim().length < 3}>Submit review</Button>
              </form>
            ) : (
              <p className="text-sm text-muted">Not reviewed yet.</p>
            )}
          </section>
        )}
      </div>
    </Card>
  );
}
