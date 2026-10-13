"use client";

import type { CustodyEntry } from "@chainproof/shared";
import Link from "next/link";
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
    default: return null;
  }
}

export function CustodyTimeline({ entries, users, brokenAt, evidenceNames }: {
  entries: CustodyEntry[];
  users: Map<string, User>;
  brokenAt?: number | null;
  evidenceNames: Map<string, string>;
}) {
  return (
    <ol className="relative space-y-0">
      {entries.map((e) => {
        const broken = brokenAt != null && e.seq >= brokenAt;
        const first = brokenAt != null && e.seq === brokenAt;
        const note = describe(e, users);
        return (
          <li key={e.seq} className="relative flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <span className={cx("grid size-7 shrink-0 place-items-center rounded-full border text-xs font-mono", first ? "border-bad bg-bad text-white" : broken ? "border-bad/50 text-bad" : "border-border bg-surface-2 text-muted")}>
                {e.seq}
              </span>
              <span className={cx("mt-1 w-px flex-1", broken ? "bg-bad/40" : "bg-border")} />
            </div>
            <div className={cx("min-w-0 flex-1 rounded-lg px-3 py-2", first && "bg-bad-bg")}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                {e.evidence_id && (
                  <Link href={`/evidence/${e.evidence_id}`} className="text-accent hover:underline">
                    {evidenceNames.get(e.evidence_id) ?? "evidence"}
                  </Link>
                )}
                <span className="text-xs text-muted">
                  {e.actor_id === "system" ? "system" : users.get(e.actor_id)?.name ?? "unknown user"} · {formatTs(e.ts)}
                </span>
              </div>
              {note && <p className="text-sm text-muted">{note}</p>}
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]">
                <span className="text-muted">hash</span> <Hash value={e.entry_hash} short={10} />
                <span className="text-muted">prev</span> <Hash value={e.prev_hash} short={6} />
              </div>
              {first && <p className="mt-1 text-sm font-medium text-bad">Chain broken here. This entry or the one before it was altered.</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
