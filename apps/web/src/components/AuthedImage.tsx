"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "./ui";

/** <img> can't send the auth header, so fetch the bytes and show them from an object URL. */
export function AuthedImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    api.blob(path).then(
      ({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) return <div className={cx("grid place-items-center bg-surface-2 text-xs text-muted", className)}>No preview</div>;
  if (!url) return <div className={cx("animate-pulse bg-surface-2", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
