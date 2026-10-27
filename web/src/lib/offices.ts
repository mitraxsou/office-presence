import { prisma } from "./db";
import type { OfficeFenceInput } from "./visit-calculator";

function toFence(r: {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  pointsPerVisitDay: number;
}): OfficeFenceInput {
  return {
    id: r.id,
    lat: r.latitude,
    lng: r.longitude,
    radiusMeters: r.radiusMeters,
    pointsPerVisitDay: r.pointsPerVisitDay,
  };
}

export async function listActiveOffices(): Promise<OfficeFenceInput[]> {
  const rows = await prisma.officeLocation.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
  });
  return rows.map(toFence);
}

/** Active plus deactivated offices: deactivated sites no longer match new fixes but keep past points. */
export async function listPointOffices() {
  return prisma.officeLocation.findMany({
    where: { status: { in: ["active", "inactive"] } },
    orderBy: { name: "asc" },
  });
}

export { toFence };

const geoCache = new Map<string, { at: number; label: string | null }>();
let lastGeoCall = 0;

const NOMINATIM_HEADERS = {
  "User-Agent": "OfficePresence/1.0 (+https://office-presence-psi.vercel.app)",
  Accept: "application/json",
  "Accept-Language": "en",
};

async function throttleNominatim() {
  const wait = lastGeoCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeoCall = Date.now();
}

/** Server-side Nominatim reverse lookup. Cached and throttled to 1 req/s per instance per OSM policy. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < 7 * 24 * 3600_000) return hit.label;
  await throttleNominatim();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`;
  try {
    const res = await fetch(url, {
      headers: NOMINATIM_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    const label = data.display_name ?? null;
    geoCache.set(key, { at: Date.now(), label });
    return label;
  } catch {
    return null;
  }
}

export type PlaceSearchHit = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const searchCache = new Map<string, { at: number; hits: PlaceSearchHit[] }>();

/** Server-side Nominatim place search. Cached and throttled with reverse lookups. */
export async function searchPlaces(query: string, limit = 6): Promise<PlaceSearchHit[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.hits;
  await throttleNominatim();
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${Math.min(10, Math.max(1, limit))}` +
    `&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: NOMINATIM_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      display_name?: string;
      name?: string;
      lat?: string;
      lon?: string;
    }>;
    const hits: PlaceSearchHit[] = [];
    for (const r of rows) {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const address = r.display_name ?? "";
      const name = (r.name && r.name.trim()) || address.split(",")[0]?.trim() || "Place";
      hits.push({ name, address, lat, lng });
    }
    searchCache.set(key, { at: Date.now(), hits });
    return hits;
  } catch {
    return [];
  }
}
