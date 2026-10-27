"use client";

import dynamic from "next/dynamic";

const OfficeMap = dynamic(() => import("@/components/OfficeMap"), {
  ssr: false,
  loading: () => <span className="skeleton map" />,
});

export default function OfficeDetailMap(p: { lat: number; lng: number; radiusMeters: number; label: string }) {
  return <OfficeMap center={{ lat: p.lat, lng: p.lng }} pins={[{ lat: p.lat, lng: p.lng, radiusMeters: p.radiusMeters, label: p.label }]} />;
}
