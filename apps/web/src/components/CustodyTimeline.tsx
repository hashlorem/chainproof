"use client";

import type { CustodyEntry } from "@chainproof/shared";
import Link from "next/link";
import { useState } from "react";
import { formatTs, type User } from "@/lib/api";
import { Hash, cx } from "./ui";

const ACTION_LABEL: Record<string, string> = {
  CASE_OPENED: "Case opened",
  CASE_CLOSED: "Case closed",
  CASE_REOPENED: "Case reopened",
  CAPTURED: "Captured on device",
  UPLOADED: "Uploaded",
  TIMESTAMPED: "Trusted timestamp",
  VIEWED: "Original viewed",
  DOWNLOADED: "Original downloaded",
  ANALYZED: "Forensic analysis",
  TRANSFERRED: "Custody transferred",
  EXPORTED: "Report exported",
  VERIFIED: "Integrity verified",
  NOTED: "Examiner note",
  CONCLUDED: "Examiner conclusion",
  REVIEWED: "Technical review",
  COMPARED: "Compared with a copy",
  ANCHORED: "Log anchored",
};

function describe(e: CustodyEntry, users: Map<string, User>): string | null {
  const d = e.details as Record<string, unknown>;
  switch (e.action) {
    case "CASE_OPENED": return String(d.title ?? "");
    case "CASE_CLOSED": return `${d.reason} (${d.evidence_count} items sealed)`;
    case "CASE_REOPENED": return String(d.reason);
    case "CAPTURED": return d.gps ? `GPS ${(d.gps as { lat: number }).lat.toFixed(5)}, ${(d.gps as { lon: number }).lon.toFixed(5)}` : "No GPS";
    case "UPLOADED": return d.provenance === "device_signed" ? "Signed by device" : "Imported file";
    case "TIMESTAMPED": return `Existed by ${formatTs(String(d.tsa_time))}`;
    case "ANALYZED": return `Verdict: ${String(d.verdict).replaceAll("_", " ")}`;
    case "TRANSFERRED": return `To ${users.get(String(d.to_user_id))?.name ?? "?"}: ${d.reason}`;
    case "VERIFIED": return d.ok ? "All checks passed" : "Some checks failed";
    case "NOTED": return String(d.text).length > 90 ? `${String(d.text).slice(0, 90)}…` : String(d.text);
    case "CONCLUDED": return d.level === "none" ? "No support either way" : `${String(d.level).replaceAll("_", " ")} support for: ${d.h1}`;
    case "REVIEWED": return d.agrees ? "Agrees with the conclusion" : "Does not agree with the conclusion";
    case "EXPORTED": return d.kind === "examination" ? "Examination report" : "Case report";
    case "COMPARED": return `${d.questioned_filename || "A copy"}: ${Number(d.regions) ? `${d.regions} changed region(s)` : "no changes found"}`;
    case "ANCHORED": return `Entries up to #${d.head_seq} timestamped by FreeTSA, ${formatTs(String(d.tsa_time))}`;
    default: return null;
  }
}

/** The newest entry covered by a FreeTSA anchor in these entries, if any. */
export function sealedUpTo(entries: CustodyEntry[]): number | null {
  const heads = entries.filter((e) => e.action === "ANCHORED").map((e) => Number((e.details as { head_seq?: number }).head_seq));
  return heads.length ? Math.max(...heads) : null;
}

const RECENT = 8;

/**
 * The custody log as a chain: each entry is a link that names the hash of the one before it. The spine is solid up to
 * the newest entry sealed by a FreeTSA anchor and dashed after it (linked, not yet sealed). A break turns it red.
 */
export function CustodyTimeline({ entries, users, brokenAt, evidenceNames, sealed }: {
  entries: CustodyEntry[];
  users: Map<string, User>;
  brokenAt?: number | null;
  evidenceNames: Map<string, string>;
  /** Pass when `entries` is a subset (one item's entries) so the seal still reflects the whole case. */
  sealed?: number | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const seal = sealed !== undefined ? sealed : sealedUpTo(entries);
  // Long logs show the latest entries; a broken chain always shows everything so the break is visible.
  const hidden = showAll || brokenAt != null ? 0 : Math.max(0, entries.length - RECENT);
  const shown = entries.slice(hidden);
  if (!entries.length) return <p className="text-muted">No entries yet.</p>;
  return (
    <div>
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="mb-2 ml-8 min-h-8 text-[13px] text-accent underline-offset-4 hover:underline">
          Show {hidden} earlier entries
        </button>
      )}
      <ol>
        {shown.map((e, i) => {
          const broken = brokenAt != null && e.seq >= brokenAt;
          const first = brokenAt != null && e.seq === brokenAt;
          const isSealed = seal != null && e.seq < seal;
          const anchor = e.action === "ANCHORED";
          const last = i === shown.length - 1;
          const note = describe(e, users);
          return (
            <li key={e.seq} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
              {/* The link to the next entry: solid when sealed by an anchor, dashed when only hash-linked so far. */}
              {!last && (
                <span aria-hidden className={cx("absolute top-6 bottom-0.5 left-[9px] border-l-2",
                  broken ? "border-bad" : isSealed ? "border-muted/70" : "border-dashed border-muted/40")} />
              )}
              <span aria-hidden className={cx("relative z-10 mt-0.5 grid size-5 place-items-center rounded-full",
                first ? "bg-bad text-white" : anchor ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted")}>
                {anchor ? (
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></svg>
                ) : (
                  <span className={cx("size-1.5 rounded-full", first ? "bg-white" : broken ? "bg-bad" : "bg-muted")} />
                )}
              </span>
              <div className={cx("min-w-0 text-xs", first && "-m-2 rounded-md bg-bad-bg p-2", broken && !first && "text-bad")}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[11px] text-muted">#{e.seq}</span>
                  <span className="text-[13px] font-semibold">{ACTION_LABEL[e.action] ?? e.action}</span>
                  {e.evidence_id && (
                    <Link href={`/evidence/${e.evidence_id}`} className="text-accent underline-offset-4 hover:underline">
                      {evidenceNames.get(e.evidence_id) ?? "evidence"}
                    </Link>
                  )}
                </div>
                {note && <p className="mt-0.5">{note}</p>}
                <div className="mt-0.5 text-muted">
                  {e.actor_id === "system" ? "system" : users.get(e.actor_id)?.name ?? "unknown user"} · {formatTs(e.ts)}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
                  <Hash value={e.entry_hash} short={6} /> <span title="Each entry names the hash of the one before it">← prev</span> <Hash value={e.prev_hash} short={4} />
                </div>
                {first && <p className="mt-1 font-semibold text-bad">Chain broken here. This entry or the one before it was altered.</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {seal != null && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2.5 text-[11px] text-muted">
          <li className="flex items-center gap-2"><span className="inline-block w-5 border-t-2 border-muted/70" aria-hidden /> Sealed by a FreeTSA anchor</li>
          <li className="flex items-center gap-2"><span className="inline-block w-5 border-t-2 border-dashed border-muted/40" aria-hidden /> Linked, not yet anchored</li>
        </ul>
      )}
    </div>
  );
}
