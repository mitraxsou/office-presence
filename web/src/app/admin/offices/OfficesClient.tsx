"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { countsAs } from "@/lib/points-format";

const OfficeMap = dynamic(() => import("@/components/OfficeMap"), {
  ssr: false,
  loading: () => <span className="skeleton map" style={{ height: 560 }} />,
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

type Draft = {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  pointsPerVisitDay: string;
  addressLabel: string | null;
};

const emptyDraft = (): Draft => ({
  id: "",
  name: "",
  latitude: "",
  longitude: "",
  radiusMeters: "100",
  pointsPerVisitDay: "1",
  addressLabel: null,
});

export default function OfficesClient() {
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [inByOffice, setInByOffice] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [adding, setAdding] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [places, setPlaces] = useState<PlaceHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const [offRes, statusRes] = await Promise.all([
      fetch("/api/admin/offices", { cache: "no-store" }),
      fetch("/api/admin/status", { cache: "no-store" }),
    ]);
    if (offRes.ok) {
      const j = await offRes.json();
      setOffices(j.offices);
    }
    if (statusRes.ok) {
      const j = await statusRes.json();
      const map: Record<string, number> = {};
      for (const u of j.users ?? []) {
        if (u.inOffice && u.officeLocationId) {
          map[u.officeLocationId] = (map[u.officeLocationId] ?? 0) + 1;
        }
      }
      setInByOffice(map);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const listed = useMemo(
    () => (offices ?? []).filter((o) => o.status === "active" || o.status === "inactive"),
    [offices],
  );
  const pending = useMemo(() => (offices ?? []).filter((o) => o.status === "pending"), [offices]);

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

  function selectOffice(o: Office) {
    setAdding(false);
    // Keep dirty draft when re-selecting the already expanded office (Enter in Name must not clobber).
    if (selectedId === o.id && !adding) {
      setSelectedId(o.id);
      return;
    }
    setSelectedId(o.id);
    setDraft({
      id: o.id,
      name: o.name,
      latitude: String(o.latitude),
      longitude: String(o.longitude),
      radiusMeters: String(o.radiusMeters),
      pointsPerVisitDay: String(o.pointsPerVisitDay),
      addressLabel: o.addressLabel,
    });
  }

  function startAdd() {
    setAdding(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setSearchQ("");
    setPlaces([]);
  }

  function setLatLng(lat: number, lng: number, label?: string | null, nameHint?: string) {
    setDraft((f) => ({
      ...f,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      name: f.name || (nameHint ?? ""),
      addressLabel: label ?? f.addressLabel,
    }));
    if (!label) {
      void fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.addressLabel) setDraft((f) => ({ ...f, addressLabel: j.addressLabel }));
        })
        .catch(() => undefined);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name,
      latitude: Number(draft.latitude),
      longitude: Number(draft.longitude),
      radiusMeters: Number(draft.radiusMeters),
      pointsPerVisitDay: Number(draft.pointsPerVisitDay),
      addressLabel: draft.addressLabel,
    };
    const res = await fetch("/api/admin/offices", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: j.error ?? "Save failed" });
      return;
    }
    setMsg({ kind: "ok", text: draft.id ? "Office saved" : "Office added" });
    setAdding(false);
    await load();
    if (j.office?.id) {
      const office = j.office as Office;
      setSelectedId(office.id);
      setDraft({
        id: office.id,
        name: office.name ?? draft.name,
        latitude: String(office.latitude ?? draft.latitude),
        longitude: String(office.longitude ?? draft.longitude),
        radiusMeters: String(office.radiusMeters ?? draft.radiusMeters),
        pointsPerVisitDay: String(office.pointsPerVisitDay ?? draft.pointsPerVisitDay),
        addressLabel: office.addressLabel ?? draft.addressLabel,
      });
    }
  }

  async function softDelete(o: Office) {
    if (!window.confirm(`Delete office ${o.name}? It will stop matching new visits. Past days stay.`)) return;
    const res = await fetch("/api/admin/offices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, status: "inactive" }),
    });
    setMsg(res.ok ? { kind: "ok", text: `${o.name} deleted` } : { kind: "error", text: "Delete failed" });
    if (selectedId === o.id) {
      setSelectedId(null);
      setDraft(emptyDraft());
    }
    await load();
  }

  async function decidePending(o: Office, decision: "approve" | "reject") {
    let points: number | undefined;
    if (decision === "approve") {
      const v = window.prompt(`Counts as how many points for ${o.name}?`, String(o.pointsPerVisitDay));
      if (v == null) return;
      points = Number(v);
    }
    const res = await fetch("/api/admin/offices/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, decision, pointsPerVisitDay: points }),
    });
    setMsg(res.ok ? { kind: "ok", text: `${o.name} ${decision}d` } : { kind: "error", text: "Review failed" });
    await load();
  }

  const lat = Number(draft.latitude);
  const lng = Number(draft.longitude);
  const hasPoint = draft.latitude !== "" && Number.isFinite(lat) && Number.isFinite(lng);
  const radius = Number(draft.radiusMeters) || 100;
  const editing = adding || Boolean(selectedId);

  const mapPins = useMemo(() => {
    const pins = listed.map((o) => ({
      id: o.id,
      lat: o.latitude,
      lng: o.longitude,
      radiusMeters: o.radiusMeters,
      label: o.name,
      selected: !adding && o.id === selectedId,
    }));
    if (adding && hasPoint) {
      pins.push({
        id: "__new",
        lat,
        lng,
        radiusMeters: radius,
        label: draft.name || "New office",
        selected: true,
      });
    } else if (selectedId && hasPoint) {
      return pins.map((p) =>
        p.id === selectedId
          ? { ...p, lat, lng, radiusMeters: radius, label: draft.name || p.label, selected: true }
          : { ...p, selected: false },
      );
    }
    return pins;
  }, [listed, selectedId, adding, hasPoint, lat, lng, radius, draft.name]);

  return (
    <div>
      <div className="op-whead">
        <div>
          <h1>Offices</h1>
          <p className="op-sub">
            {listed.length} office{listed.length === 1 ? "" : "s"}
            {pending.length ? `, ${pending.length} suggestion${pending.length === 1 ? "" : "s"} to review` : ""}
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={startAdd}>
          Add office
        </button>
      </div>

      {pending.length ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Suggestions to review</h2>
          {pending.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--op-line)" }}>
              <div>
                <strong>{o.name}</strong>
                <div className="muted">{o.addressLabel ?? `${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`}</div>
                <div className="muted">Suggested by {o.createdBy?.email ?? "someone"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void decidePending(o, "approve")}>
                  Approve
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void decidePending(o, "reject")}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="op-offices-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {adding ? (
            <div className="op-ocard on" style={{ cursor: "default" }}>
              <b style={{ fontWeight: 700 }}>New office</b>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <label className="field">
                  <span className="lab">Name</span>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Office name"
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label className="field">
                    <span className="lab">Radius (m)</span>
                    <input
                      type="number"
                      value={draft.radiusMeters}
                      onChange={(e) => setDraft({ ...draft, radiusMeters: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="lab">Counts as (points)</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.pointsPerVisitDay}
                      onChange={(e) => setDraft({ ...draft, pointsPerVisitDay: e.target.value })}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setDraft(emptyDraft()); }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || !draft.name || !hasPoint}
                    onClick={() => void save()}
                  >
                    Save office
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {!offices ? (
            <div className="op-ocard">
              <span className="op-sk" style={{ width: "60%" }} />
            </div>
          ) : listed.length === 0 && !adding ? (
            <div className="op-empty" style={{ padding: 40 }}>
              <h2>No offices yet</h2>
              <p>Add an office so phones can match visits.</p>
            </div>
          ) : (
            listed.map((o) => {
              const on = !adding && selectedId === o.id;
              const inCount = inByOffice[o.id] ?? 0;
              return (
                <div
                  key={o.id}
                  className={`op-ocard${on ? " on" : ""}`}
                  role={on ? undefined : "button"}
                  tabIndex={on ? undefined : 0}
                  onClick={() => {
                    if (!on) selectOffice(o);
                  }}
                  onKeyDown={(e) => {
                    if (on) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectOffice(o);
                    }
                  }}
                >
                  {!on ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <b style={{ fontWeight: 700 }}>{o.name}</b>
                        <span className="op-badge out">{inCount} In</span>
                      </div>
                      <div className="op-meta-row" style={{ marginTop: 4 }}>
                        {o.addressLabel ?? `${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`}
                      </div>
                      <div className="meta">
                        <span>
                          Radius <b>{o.radiusMeters} m</b>
                        </span>
                        <span>
                          Counts as <b>{o.pointsPerVisitDay === 1 ? "1 point" : `${o.pointsPerVisitDay} points`}</b>
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="field" style={{ flex: 1, margin: 0 }}>
                          <span className="lab">Name</span>
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Office name"
                            aria-label="Office name"
                          />
                        </label>
                        <span className="op-badge out" style={{ marginTop: 22 }}>
                          {inCount} In
                        </span>
                      </div>
                      <div className="op-meta-row" style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                        {draft.addressLabel ??
                          o.addressLabel ??
                          `${Number(draft.latitude || o.latitude).toFixed(5)}, ${Number(draft.longitude || o.longitude).toFixed(5)}`}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 10,
                          marginTop: 16,
                          paddingTop: 16,
                          borderTop: "1px solid var(--op-line)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="field">
                          <span className="lab">Radius (m)</span>
                          <input
                            type="number"
                            value={draft.radiusMeters}
                            onChange={(e) => setDraft({ ...draft, radiusMeters: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span className="lab">Counts as (points)</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.pointsPerVisitDay}
                            onChange={(e) => setDraft({ ...draft, pointsPerVisitDay: e.target.value })}
                          />
                        </label>
                      </div>
                      <div
                        style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void softDelete(o)}>
                          Delete office
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy || !draft.name.trim()}
                          onClick={() => void save()}
                        >
                          Save office
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="op-map-wrap">
          <div className="op-map-search">
            <label className="op-search" style={{ width: "100%", background: "var(--op-surface)" }}>
              <span aria-hidden>⌕</span>
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search an address"
                aria-label="Search an address"
              />
            </label>
            {searchBusy ? <div className="op-meta-row" style={{ marginTop: 6 }}>Searching...</div> : null}
            {places.length ? (
              <div className="op-map-hits">
                {places.map((p, i) => (
                  <button
                    key={`${p.lat}-${p.lng}-${i}`}
                    type="button"
                    onClick={() => {
                      setLatLng(p.lat, p.lng, p.address, p.name);
                      setSearchQ("");
                      setPlaces([]);
                      if (!adding && !selectedId) startAdd();
                    }}
                  >
                    <strong>{p.name}</strong>
                    <span className="help">{p.address}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <OfficeMap
            height={560}
            center={hasPoint ? { lat, lng } : listed[0] ? { lat: listed[0].latitude, lng: listed[0].longitude } : null}
            pins={mapPins}
            onPick={(a, b) => {
              if (!editing) startAdd();
              setLatLng(a, b);
            }}
            onMove={(a, b) => {
              if (editing) setLatLng(a, b);
            }}
          />
          <div className="op-map-note">
            Drag the pin or set radius above. Changes apply when you save.
            {draft.addressLabel ? ` ${draft.addressLabel}` : ""}
            {hasPoint ? ` (${countsAs(Number(draft.pointsPerVisitDay) || 1)}, ${radius} m)` : ""}
          </div>
        </div>
      </div>

      {msg ? <p className={`status-msg ${msg.kind}`}>{msg.text}</p> : null}
    </div>
  );
}
