"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Circle, CircleMarker } from "leaflet";

type Pin = { id?: string; lat: number; lng: number; radiusMeters: number; label?: string };

/** OpenStreetMap tiles via Leaflet. Click to pick when onPick is set. */
export default function OfficeMap({
  center,
  pins,
  onPick,
  height = 320,
}: {
  center?: { lat: number; lng: number } | null;
  pins: Pin[];
  onPick?: (lat: number, lng: number) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<Array<Circle | CircleMarker>>([]);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const start = center ?? pins[0] ?? { lat: 22.5726, lng: 88.3639 };
      const m = L.map(el.current).setView([start.lat, start.lng], center || pins.length ? 16 : 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      m.on("click", (e) => pickRef.current?.(e.latlng.lat, e.latlng.lng));
      map.current = m;
      draw(L);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!map.current) return;
      const L = (await import("leaflet")).default;
      draw(L);
      if (center) map.current.setView([center.lat, center.lng], Math.max(map.current.getZoom(), 15));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pins), center?.lat, center?.lng]);

  function draw(L: typeof import("leaflet")) {
    const m = map.current;
    if (!m) return;
    layers.current.forEach((l) => l.remove());
    layers.current = [];
    for (const p of pins) {
      const ring = L.circle([p.lat, p.lng], { radius: p.radiusMeters, color: "#FD5108", weight: 2, fillOpacity: 0.12 }).addTo(m);
      const dot = L.circleMarker([p.lat, p.lng], { radius: 6, color: "#FD5108", fillColor: "#FD5108", fillOpacity: 1 }).addTo(m);
      if (p.label) dot.bindTooltip(p.label);
      layers.current.push(ring, dot);
    }
  }

  return <div ref={el} className="map" style={{ height }} />;
}
