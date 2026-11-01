"use client";

import { useState } from "react";
import type { ForensicReport } from "@/lib/api";
import { AuthedImage } from "./AuthedImage";
import { cx } from "./ui";

type Region = { matches: number; scale: number; angle: number };

/**
 * The examination viewer: one item, several views of it. The preview is a server-made copy; "Original" fetches the
 * evidence itself, which the server logs as a VIEWED custody entry, so it is only loaded when chosen.
 */
export function Viewer({ evidenceId, filename, report, isVideo }: {
  evidenceId: string; filename: string; report: ForensicReport | null | undefined; isVideo: boolean;
}) {
  const cm = report?.checks.copy_move;
  const views = [
    { id: "preview", label: "Preview", path: `/evidence/${evidenceId}/thumbnail.jpg` },
    { id: "original", label: isVideo ? "Play original" : "Original", path: `/evidence/${evidenceId}/file?purpose=view` },
    ...(cm?.has_copymove_image ? [{ id: "clones", label: "Clone map", path: `/evidence/${evidenceId}/forensics/${cm.copymove_file ?? "copymove.png"}` }] : []),
    ...(report?.checks.ela.has_ela_image ? [{ id: "ela", label: "ELA", path: `/evidence/${evidenceId}/forensics/ela.png` }] : []),
  ];
  const [view, setView] = useState(isVideo ? "original" : cm?.has_copymove_image ? "clones" : "preview");
  const current = views.find((v) => v.id === view) ?? views[0];
  const regions = (cm?.regions ?? []) as Region[];

  return (
    <section aria-label="Viewer" className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <div role="tablist" aria-label="View" className="flex flex-wrap rounded-md bg-bg p-0.5">
          {views.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={v.id === current.id} onClick={() => setView(v.id)}
                    className={cx("h-7 rounded-[5px] px-3 text-[12px]", v.id === current.id ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:text-ink")}>
              {v.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-xs text-muted">
          {current.id === "original" ? "Original evidence: this view is recorded in the chain of custody"
            : current.id === "preview" ? "Preview copy made by the server"
            : current.id === "ela" ? "Visual aid only: it doesn't affect the verdict"
            : "Yellow = source, red = copy"}
        </span>
      </div>
      <div className="relative grid min-h-[260px] flex-1 place-items-center bg-black/40 p-3 sm:min-h-[420px] sm:p-4">
        <AuthedImage key={current.path} path={current.path} alt={`${current.label}: ${filename}`} video={isVideo && current.id === "original"}
                     className="max-h-[560px] w-full object-contain" />
        {current.id === "clones" && regions.length > 0 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-x-4 gap-y-1 rounded-full bg-surface/90 px-4 py-1.5 text-xs backdrop-blur">
            {regions.map((r, i) => (
              <span key={i}>
                <span className="text-warn">Source</span> → <span className="text-bad">copy</span>
                {` · scale ${(r.scale ?? 1).toFixed(2)} · ${(r.angle ?? 0).toFixed(1)}° · ${r.matches} matching points`}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
