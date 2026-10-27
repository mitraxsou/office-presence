"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Circle, CircleMarker, Marker } from "leaflet";

type Pin = { id?: string; lat: number; lng: number; radiusMeters: number; label?: string; selected?: boolean };

/** OpenStreetMap tiles via Leaflet. Click to pick when onPick is set. Selected pin is draggable when onMove is set. */
export default function OfficeMap({
  center,
  pins,
  onPick,
  onMove,
  height = 320,
}: {
  center?: { lat: number; lng: number } | null;
  pins: Pin[];
  onPick?: (lat: number, lng: number) => void;
  onMove?: (lat: number, lng: number) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<Array<Circle | CircleMarker | Marker>>([]);
  const pickRef = useRef(onPick);
  const moveRef = useRef(onMove);
  pickRef.current = onPick;
  moveRef.current = onMove;

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
      const selected = Boolean(p.selected);
      const color = selected ? "#FD5108" : "#8C8C8C";
      const ring = L.circle([p.lat, p.lng], {
        radius: p.radiusMeters,
        color,
        weight: selected ? 2 : 1.5,
        dashArray: selected ? undefined : "5 5",
        fillOpacity: selected ? 0.12 : 0,
      }).addTo(m);
      const dot = L.circleMarker([p.lat, p.lng], {
        radius: selected ? 8 : 6,
        color,
        fillColor: color,
        fillOpacity: 1,
        weight: 2,
      }).addTo(m);
      if (p.label) dot.bindTooltip(p.label);
      if (selected && moveRef.current) {
        // Approximate drag: listen to map drag of a temporary marker
        const icon = L.divIcon({
          className: "op-map-pin",
          html: `<div style="width:16px;height:16px;border-radius:999px;background:#FD5108;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([p.lat, p.lng], { draggable: true, icon }).addTo(m);
        marker.on("dragend", () => {
          const ll = marker.getLatLng();
          moveRef.current?.(ll.lat, ll.lng);
        });
        layers.current.push(marker);
        dot.remove();
      } else {
        layers.current.push(dot);
      }
      layers.current.push(ring);
    }
  }

  return <div ref={el} className="map" style={{ height }} />;
}
