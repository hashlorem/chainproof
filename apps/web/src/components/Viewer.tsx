"use client";

import { useState, type ReactNode } from "react";
import type { ForensicReport } from "@/lib/api";
import { AuthedImage } from "./AuthedImage";
import { cx } from "./ui";

type Region = { matches: number; scale: number; angle: number };
/** An image to show: inline (a photo being checked, nothing stored) or from an evidence endpoint (needs the token). */
export type ViewSource = { kind: "inline"; url: string } | { kind: "path"; path: string; video?: boolean };
export type View = { id: string; label: string; hint: string; src: ViewSource };

/** The views a forensic report adds to the photo itself: the clone map and the ELA heatmap. */
export function reportViews(report: ForensicReport | null | undefined, src: (name: "clones" | "ela") => ViewSource): View[] {
  const views: View[] = [];
  if (report?.checks.copy_move.has_copymove_image || report?.checks.copy_move.overlay_jpg) {
    views.push({ id: "clones", label: "Clone map", hint: "Yellow = source, red = copy", src: src("clones") });
  }
  if (report?.checks.ela.has_ela_image || report?.checks.ela.heatmap_png) {
    views.push({ id: "ela", label: "ELA", hint: "Visual aid only: it doesn't affect the verdict", src: src("ela") });
  }
  return views;
}

/** One item, several views of it, with the clone regions spelled out under the clone map. */
export function ImageViewer({ views, initial, report, footer }: { views: View[]; initial?: string; report?: ForensicReport | null; footer?: ReactNode }) {
  const [view, setView] = useState(initial ?? views[0]?.id);
  const current = views.find((v) => v.id === view) ?? views[0];
  const regions = (report?.checks.copy_move.regions ?? []) as Region[];
  if (!current) return null;
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
        <span className="text-xs text-muted">{current.hint}</span>
      </div>
      <div className="relative grid min-h-[260px] flex-1 place-items-center bg-black/40 p-3 sm:min-h-[420px] sm:p-4">
        {current.src.kind === "inline" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={current.src.url} src={current.src.url} alt={current.label} className="max-h-[560px] w-full object-contain" />
        ) : (
          <AuthedImage key={current.src.path} path={current.src.path} alt={current.label} video={current.src.video}
                       className="max-h-[560px] w-full object-contain" />
        )}
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
      {footer}
    </section>
  );
}

/**
 * The examination viewer for stored evidence. The preview is a server-made copy; "Original" fetches the evidence
 * itself, which the server logs as a VIEWED custody entry, so it is only loaded when chosen.
 */
export function Viewer({ evidenceId, report, isVideo }: { evidenceId: string; report: ForensicReport | null | undefined; isVideo: boolean }) {
  const cm = report?.checks.copy_move;
  const views: View[] = [
    { id: "preview", label: "Preview", hint: "Preview copy made by the server", src: { kind: "path", path: `/evidence/${evidenceId}/thumbnail.jpg` } },
    { id: "original", label: isVideo ? "Play original" : "Original", hint: "Original evidence: this view is recorded in the chain of custody",
      src: { kind: "path", path: `/evidence/${evidenceId}/file?purpose=view`, video: isVideo } },
    ...reportViews(report, (name) => ({ kind: "path", path: `/evidence/${evidenceId}/forensics/${name === "ela" ? "ela.png" : cm?.copymove_file ?? "copymove.png"}` })),
  ];
  return <ImageViewer views={views} report={report} initial={isVideo ? "original" : cm?.has_copymove_image ? "clones" : "preview"} />;
}
