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
    case "TRANSFERRED": return `To ${users.get(String(d.to_user_id))?.name ?? "?"} — ${d.reason}`;
    case "VERIFIED": return d.ok ? "All checks passed" : "Some checks failed";
    case "NOTED": return String(d.text).length > 90 ? `${String(d.text).slice(0, 90)}…` : String(d.text);
    case "CONCLUDED": return d.level === "none" ? "No support either way" : `${String(d.level).replaceAll("_", " ")} support for: ${d.h1}`;
    case "REVIEWED": return d.agrees ? "Agrees with the conclusion" : "Does not agree with the conclusion";
    case "EXPORTED": return d.kind === "examination" ? "Examination report" : "Case report";
    case "COMPARED": return `${d.questioned_filename || "A copy"}: ${Number(d.regions) ? `${d.regions} changed region(s)` : "no changes found"}`;
    default: return null;
  }
}

const RECENT = 8;

export function CustodyTimeline({ entries, users, brokenAt, evidenceNames }: {
  entries: CustodyEntry[];
  users: Map<string, User>;
  brokenAt?: number | null;
  evidenceNames: Map<string, string>;
}) {
  const [showAll, setShowAll] = useState(false);
  // Long logs show the latest entries; a broken chain always shows everything so the break is visible.
  const hidden = showAll || brokenAt != null ? 0 : Math.max(0, entries.length - RECENT);
  return (
    <ol className="-m-4">
      {hidden > 0 && (
        <li className="border-b border-border px-4 py-2">
          <button type="button" onClick={() => setShowAll(true)} className="min-h-9 text-xs uppercase tracking-[0.08em] underline underline-offset-4">
            Show {hidden} earlier entries
          </button>
        </li>
      )}
      {entries.slice(hidden).map((e) => {
        const broken = brokenAt != null && e.seq >= brokenAt;
        const first = brokenAt != null && e.seq === brokenAt;
        const note = describe(e, users);
        return (
          <li key={e.seq} className={cx("grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 border-b border-border px-4 py-3 last:border-b-0", first ? "bg-bad-bg" : broken && "text-bad")}>
            <span className={cx("font-semibold", first && "text-bad")}>#{e.seq}</span>
            <div className="min-w-0 text-xs">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold uppercase tracking-[0.04em]">{ACTION_LABEL[e.action] ?? e.action}</span>
                {e.evidence_id && (
                  <Link href={`/evidence/${e.evidence_id}`} className="underline underline-offset-4 hover:text-bad">
                    {evidenceNames.get(e.evidence_id) ?? "evidence"}
                  </Link>
                )}
              </div>
              {note && <p>{note}</p>}
              <div className="text-muted">
                {e.actor_id === "system" ? "system" : users.get(e.actor_id)?.name ?? "unknown user"} · {formatTs(e.ts)}
              </div>
              <div className="flex flex-wrap gap-x-1.5 text-[11px] text-muted">
                <Hash value={e.entry_hash} short={6} /> <span aria-label="follows">←</span> <Hash value={e.prev_hash} short={4} />
              </div>
              {first && <p className="mt-1 font-semibold text-bad">Chain broken here. This entry or the one before it was altered.</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
