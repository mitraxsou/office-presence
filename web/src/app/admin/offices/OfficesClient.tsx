"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const OfficeMap = dynamic(() => import("@/components/OfficeMap"), {
  ssr: false,
  loading: () => <span className="skeleton map" />,
});

type Office = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  pointsPerVisitDay: number;
  addressLabel: string | null;
  status: "active" | "inactive" | "pending" | "rejected";
  createdBy?: { email: string } | null;
};

type PlaceHit = { name: string; address: string; lat: number; lng: number };

const empty = { id: "", name: "", latitude: "", longitude: "", radiusMeters: "100", pointsPerVisitDay: "1" };

export default function OfficesClient() {
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [form, setForm] = useState(empty);
  const [address, setAddress] = useState<string | null>(null);
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [places, setPlaces] = useState<PlaceHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const res = await fetch("/api/admin/offices", { cache: "no-store" });
    if (res.ok) setOffices((await res.json()).offices);
  }
  useEffect(() => {
    load();
  }, []);

  async function lookup(lat: number, lng: number) {
    setAddress("Looking up address...");
    const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
    setAddress(res.ok ? (await res.json()).addressLabel ?? "No address found" : null);
  }

  function pick(lat: number, lng: number, label?: string | null, nameHint?: string) {
    setForm((f) => ({
      ...f,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      name: f.name || (nameHint ?? ""),
    }));
    if (label) setAddress(label);
    else lookup(lat, lng);
    setPlaces([]);
  }

  const savedMatches = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (q.length < 2 || !offices) return [];
    return offices
      .filter((o) => o.status === "active" || o.status === "inactive")
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.addressLabel ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [searchQ, offices]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQ.trim();
    if (q.length < 2) {
      setPlaces([]);
      setSearchBusy(false);
      return;
    }
    setSearchBusy(true);
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setPlaces(res.ok ? (j.places as PlaceHit[]) ?? [] : []);
      setSearchBusy(false);
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQ]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      radiusMeters: Number(form.radiusMeters),
      pointsPerVisitDay: Number(form.pointsPerVisitDay),
    };
    const res = await fetch("/api/admin/offices", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: form.id ? "Office updated" : "Office added" });
      setForm(empty);
      setAddress(null);
      load();
    } else setMsg({ kind: "error", text: j.error ?? "Save failed" });
  }

  async function setStatus(o: Office, status: Office["status"]) {
    if (status === "inactive" && !window.confirm(`Deactivate ${o.name}? New fixes stop matching it. Past points stay.`)) return;
    const res = await fetch("/api/admin/offices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, status }),
    });
    setMsg(res.ok ? { kind: "ok", text: `${o.name} is now ${status}` } : { kind: "error", text: "Update failed" });
    load();
  }

  async function decide(o: Office, decision: "approve" | "reject") {
    let points: number | undefined;
    if (decision === "approve") {
      const v = window.prompt(`Points per visit day for ${o.name}?`, String(o.pointsPerVisitDay));
      if (v == null) return;
      points = Number(v);
    }
    const res = await fetch("/api/admin/offices/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, decision, pointsPerVisitDay: points }),
    });
    setMsg(res.ok ? { kind: "ok", text: `${o.name} ${decision}d` } : { kind: "error", text: "Review failed" });
    load();
  }

  async function uploadBulk() {
    setBusy(true);
    setMsg(null);
    const text = bulk.trim();
    let body: unknown;
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text);
        body = { offices: Array.isArray(parsed) ? parsed : parsed.offices };
      } catch {
        setBusy(false);
        setMsg({ kind: "error", text: "JSON could not be parsed" });
        return;
      }
    } else body = { csv: text };
    const res = await fetch("/api/admin/offices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: "ok", text: `Added ${j.created} offices` });
      setBulk("");
      load();
    } else setMsg({ kind: "error", text: j.error ?? "Upload failed" });
  }

  const lat = Number(form.latitude);
  const lng = Number(form.longitude);
  const hasPoint = form.latitude !== "" && Number.isFinite(lat) && Number.isFinite(lng);
  const pending = (offices ?? []).filter((o) => o.status === "pending");
  const listed = (offices ?? []).filter((o) => o.status !== "pending" && o.status !== "rejected");

  return (
    <>
      <div className="card card-brand">
        <span className="card-title">Admin</span>
        <h1>Offices</h1>
        <p className="lead" style={{ marginBottom: 0 }}>
          Each office sets points per visit day. Phones geofence every active office.
        </p>
      </div>

      {pending.length ? (
        <div className="card">
          <h2>Pending suggestions ({pending.length})</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Name</th><th>Location</th><th>Suggested by</th><th></th></tr></thead>
              <tbody>
                {pending.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{o.addressLabel ?? `${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`}</td>
                    <td>{o.createdBy?.email ?? "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-primary btn-sm" onClick={() => decide(o, "approve")}>Approve</button>{" "}
                      <button className="btn btn-danger btn-sm" onClick={() => decide(o, "reject")}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2>{form.id ? "Edit office" : "Add office"}</h2>
        <p className="help">Search a place or saved office, click the map, or type coordinates. Then Save.</p>
        <div className="form-stack" style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="osearch">Search place or office</label>
          <input
            id="osearch"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="PwC Kolkata, Pune office, street address"
            autoComplete="off"
          />
          {searchBusy ? <p className="help">Searching...</p> : null}
          {savedMatches.length || places.length ? (
            <div className="search-results" role="listbox" aria-label="Search results">
              {savedMatches.length ? (
                <>
                  <div className="search-group">Saved offices</div>
                  {savedMatches.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="search-hit"
                      onClick={() => {
                        setForm({
                          id: o.id,
                          name: o.name,
                          latitude: String(o.latitude),
                          longitude: String(o.longitude),
                          radiusMeters: String(o.radiusMeters),
                          pointsPerVisitDay: String(o.pointsPerVisitDay),
                        });
                        setAddress(o.addressLabel);
                        setSearchQ("");
                        setPlaces([]);
                      }}
                    >
                      <strong>{o.name}</strong>
                      <span className="help">{o.addressLabel ?? `${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {places.length ? (
                <>
                  <div className="search-group">Places (OpenStreetMap)</div>
                  {places.map((p, i) => (
                    <button
                      key={`${p.lat}-${p.lng}-${i}`}
                      type="button"
                      className="search-hit"
                      onClick={() => {
                        pick(p.lat, p.lng, p.address, p.name);
                        setSearchQ("");
                      }}
                    >
                      <strong>{p.name}</strong>
                      <span className="help">{p.address}</span>
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <OfficeMap
          center={hasPoint ? { lat, lng } : null}
          pins={hasPoint ? [{ lat, lng, radiusMeters: Number(form.radiusMeters) || 100 }] : listed.map((o) => ({ lat: o.latitude, lng: o.longitude, radiusMeters: o.radiusMeters, label: o.name }))}
          onPick={(a, b) => pick(a, b)}
        />
        {address ? <p className="help">{address}</p> : null}
        <div className="form-stack">
          <label htmlFor="oname">Name</label>
          <input id="oname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kolkata office" />
          <div className="grid-2">
            <div>
              <label htmlFor="olat">Latitude</label>
              <input id="olat" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} inputMode="decimal" />
            </div>
            <div>
              <label htmlFor="olng">Longitude</label>
              <input id="olng" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} inputMode="decimal" />
            </div>
            <div>
              <label htmlFor="orad">Radius (meters)</label>
              <input id="orad" type="number" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} />
            </div>
            <div>
              <label htmlFor="opts">Points per visit day</label>
              <input id="opts" type="number" min={0} value={form.pointsPerVisitDay} onChange={(e) => setForm({ ...form, pointsPerVisitDay: e.target.value })} />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" disabled={busy || !form.name || !hasPoint} onClick={save}>
              {busy ? "Saving..." : form.id ? "Save office" : "Add office"}
            </button>
            {form.id ? (
              <button className="btn btn-secondary" onClick={() => { setForm(empty); setAddress(null); }}>Cancel</button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>All offices</h2>
        {!offices ? (
          <>
            <span className="skeleton" style={{ height: 20, marginBottom: 10 }} />
            <span className="skeleton" style={{ height: 20, marginBottom: 10 }} />
            <span className="skeleton" style={{ height: 20 }} />
          </>
        ) : listed.length === 0 ? (
          <p className="muted">No offices yet. Add one above.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Name</th><th>Points/day</th><th>Radius</th><th>Address</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {listed.map((o) => (
                  <tr key={o.id}>
                    <td><a href={`/admin/offices/${o.id}`}>{o.name}</a></td>
                    <td>{o.pointsPerVisitDay}</td>
                    <td>{o.radiusMeters} m</td>
                    <td className="help">{o.addressLabel ?? `${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`}</td>
                    <td><span className={`badge ${o.status === "active" ? "badge-in" : ""}`}>{o.status}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setForm({
                            id: o.id,
                            name: o.name,
                            latitude: String(o.latitude),
                            longitude: String(o.longitude),
                            radiusMeters: String(o.radiusMeters),
                            pointsPerVisitDay: String(o.pointsPerVisitDay),
                          });
                          setAddress(o.addressLabel);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit
                      </button>{" "}
                      {o.status === "active" ? (
                        <button className="btn btn-danger btn-sm" onClick={() => setStatus(o, "inactive")}>Deactivate</button>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => setStatus(o, "active")}>Activate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Bulk upload</h2>
        <p className="help">
          Paste JSON (array of objects) or CSV with header <code>name,latitude,longitude,radiusMeters,pointsPerVisitDay</code>.
        </p>
        <textarea
          rows={6}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"name,latitude,longitude,radiusMeters,pointsPerVisitDay\nKolkata,22.5726,88.3639,150,1\nPune,18.5204,73.8567,150,4"}
        />
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy || !bulk.trim()} onClick={uploadBulk}>Upload offices</button>
        </div>
      </div>

      {msg ? <p className={`status-msg ${msg.kind}`}>{msg.text}</p> : null}
    </>
  );
}
