"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type MapPoint = { lat: number; lon: number; label: string; accuracy?: number | null };

/** Leaflet touches `window`, so it is imported only in the browser. */
export function MapView({ points, className = "h-72" }: { points: MapPoint[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || points.length === 0) return;
      map.current?.remove();
      const m = L.map(el.current, { scrollWheelZoom: false });
      map.current = m;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(m);
      const bounds = L.latLngBounds([]);
      for (const p of points) {
        const ll = L.latLng(p.lat, p.lon);
        bounds.extend(ll);
        L.circleMarker(ll, { radius: 7, color: "#c8281e", fillOpacity: 0.8 }).bindPopup(p.label).addTo(m);
        if (p.accuracy) L.circle(ll, { radius: p.accuracy, color: "#c8281e", weight: 1, fillOpacity: 0.1 }).addTo(m);
      }
      m.fitBounds(bounds.pad(0.3), { maxZoom: 17 });
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [points]);

  if (points.length === 0) return <div className={`${className} grid place-items-center bg-surface-2 text-sm text-muted`}>No GPS data yet</div>;
  return <div ref={el} className={`${className} overflow-hidden `} />;
}
