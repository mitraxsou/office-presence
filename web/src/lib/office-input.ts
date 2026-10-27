export type OfficeInput = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  pointsPerVisitDay: number;
  addressLabel?: string | null;
};

export function parseOfficeInput(raw: Record<string, unknown>): OfficeInput | string {
  const name = String(raw.name ?? "").trim().slice(0, 80);
  const latitude = Number(raw.latitude ?? raw.lat);
  const longitude = Number(raw.longitude ?? raw.lng);
  const radiusMeters = Number(raw.radiusMeters ?? raw.radius ?? 100);
  const pointsPerVisitDay = Number(raw.pointsPerVisitDay ?? raw.points ?? 1);
  if (!name) return "name required";
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return "latitude invalid";
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "longitude invalid";
  if (!Number.isFinite(radiusMeters) || radiusMeters < 20 || radiusMeters > 5000) return "radiusMeters must be 20-5000";
  if (!Number.isInteger(pointsPerVisitDay) || pointsPerVisitDay < 0 || pointsPerVisitDay > 100) {
    return "pointsPerVisitDay must be an integer 0-100";
  }
  const addressLabel = raw.addressLabel ? String(raw.addressLabel).slice(0, 300) : null;
  return { name, latitude, longitude, radiusMeters, pointsPerVisitDay, addressLabel };
}

/** CSV with header: name,latitude,longitude,radiusMeters,pointsPerVisitDay[,addressLabel] */
export function parseOfficeCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}
