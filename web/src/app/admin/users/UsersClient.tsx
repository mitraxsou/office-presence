"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { displayName } from "@/lib/display-name";
import { fmtLastSeen, fmtSyncAgo, initials } from "@/lib/format";
import { toCsv } from "@/lib/export-csv";

type Office = { id: string; name: string };

type Phone = {
  id: string;
  label: string | null;
  platform: string;
  lastSeenAt: string | null;
};

type ApiActivityRow = {
  id: string;
  deviceId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number | null;
  note: string | null;
  at: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  colleagueDisplayMode: string;
  role: "admin" | "user";
  isTestAccount: boolean;
  isDummy: boolean;
  deactivatedAt: string | null;
  homeOfficeId: string | null;
  homeOffice: { id: string; name: string } | null;
  phones: Phone[];
  lastSeenAt: string | null;
  statusLabel: string;
  createdAt?: string;
};

type UserDetail = UserRow & {
  hasPassword?: boolean;
  viewAsSessions?: {
    id: string;
    mode: string;
    startedAt: string;
    endedAt: string | null;
    expiresAt: string;
    admin: { id: string; email: string; name: string | null };
  }[];
};

type StatusFilter = "active" | "deactivated" | "all";
type DrawerMode = "add" | "edit" | null;
type ModalMode = "viewAs" | "deactivate" | "reactivate" | "delete" | null;

type FormState = {
  fullName: string;
  email: string;
  role: "admin" | "user";
  homeOfficeId: string;
  isTestAccount: boolean;
};

const emptyForm = (): FormState => ({
  fullName: "",
  email: "",
  role: "user",
  homeOfficeId: "",
  isTestAccount: false,
});

function personLabel(u: {
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  colleagueDisplayMode?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return displayName(u);
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function firstNameOf(full: string) {
  return full.trim().split(/\s+/)[0] || full.trim();
}

export default function UsersClient({
  offices,
  adminUserId,
  endedToast,
}: {
  offices: Office[];
  adminUserId: string;
  endedToast: { you: string; as: string; mins: number } | null;
}) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [stats, setStats] = useState({ active: 0, admins: 0, test: 0, deactivated: 0 });
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [office, setOffice] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [includeTest, setIncludeTest] = useState(true);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(
    endedToast
      ? {
          kind: "ok",
          text: `You are back as ${endedToast.you}. Viewing as ${endedToast.as} ended after ${endedToast.mins} min and was logged.`,
        }
      : null,
  );

  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [emailError, setEmailError] = useState<{ text: string; id?: string; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [viewAsTarget, setViewAsTarget] = useState<UserRow | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordBusy, setAdminPasswordBusy] = useState(false);
  const [apiActivity, setApiActivity] = useState<ApiActivityRow[]>([]);
  const [apiActivityLoading, setApiActivityLoading] = useState(false);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/admin/users?status=all&includeTest=1", { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { users: UserRow[] };
    const list = j.users ?? [];
    setStats({
      active: list.filter((u) => !u.deactivatedAt).length,
      admins: list.filter((u) => !u.deactivatedAt && u.role === "admin").length,
      test: list.filter((u) => u.isTestAccount || u.isDummy).length,
      deactivated: list.filter((u) => !!u.deactivatedAt).length,
    });
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (role) sp.set("role", role);
    if (office) sp.set("office", office);
    sp.set("status", status);
    if (includeTest) sp.set("includeTest", "1");
    const res = await fetch(`/api/admin/users?${sp}`, { cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as { users: UserRow[] };
      setUsers(j.users ?? []);
    } else {
      setUsers([]);
      setMsg({ kind: "error", text: "Could not load users" });
    }
    setLoading(false);
  }, [q, role, office, status, includeTest]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadList(), 200);
    return () => window.clearTimeout(t);
  }, [loadList]);

  useEffect(() => {
    if (endedToast) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("ended")) {
        url.search = "";
        window.history.replaceState({}, "", url.pathname);
      }
    }
  }, [endedToast]);

  const selected = useMemo(
    () => users?.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  );

  async function loadApiActivity(userId: string) {
    setApiActivityLoading(true);
    setApiActivity([]);
    try {
      const res = await fetch(`/api/admin/users/${userId}/api-activity`, { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as { activity: ApiActivityRow[] };
        setApiActivity(j.activity ?? []);
      }
    } finally {
      setApiActivityLoading(false);
    }
  }

  async function openEdit(u: UserRow) {
    setSelectedId(u.id);
    setDrawer("edit");
    setModal(null);
    setEmailError(null);
    setAdminPassword("");
    setApiActivity([]);
    setForm({
      fullName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || "",
      email: u.email,
      role: u.role,
      homeOfficeId: u.homeOfficeId ?? "",
      isTestAccount: u.isTestAccount || u.isDummy,
    });
    const res = await fetch(`/api/admin/users/${u.id}`, { cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as { user: UserDetail };
      setDetail(j.user);
      void loadApiActivity(u.id);
      setForm({
        fullName:
          [j.user.firstName, j.user.lastName].filter(Boolean).join(" ") || j.user.name || "",
        email: j.user.email,
        role: j.user.role,
        homeOfficeId: j.user.homeOfficeId ?? "",
        isTestAccount: j.user.isTestAccount || j.user.isDummy,
      });
    } else {
      setDetail(u);
    }
  }

  function openAdd() {
    setSelectedId(null);
    setDetail(null);
    setDrawer("add");
    setModal(null);
    setEmailError(null);
    setAdminPassword("");
    setForm(emptyForm());
  }

  function closeDrawer() {
    setDrawer(null);
    setSelectedId(null);
    setDetail(null);
    setEmailError(null);
    setAdminPassword("");
    setForm(emptyForm());
  }

  async function saveAdminPassword() {
    if (!detail) return;
    if (!adminPassword.trim()) {
      setMsg({ kind: "error", text: "Enter a password (at least 8 characters)" });
      return;
    }
    setAdminPasswordBusy(true);
    const res = await fetch(`/api/admin/users/${detail.id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    const j = await res.json().catch(() => ({}));
    setAdminPasswordBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not set password" });
      return;
    }
    setAdminPassword("");
    setDetail({ ...detail, hasPassword: true });
    setMsg({ kind: "ok", text: "Password set. They can sign in with email and password." });
  }

  async function clearAdminPassword() {
    if (!detail) return;
    if (!window.confirm("Remove password sign-in for this user? Teams code sign-in still works.")) return;
    setAdminPasswordBusy(true);
    const res = await fetch(`/api/admin/users/${detail.id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
    const j = await res.json().catch(() => ({}));
    setAdminPasswordBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not clear password" });
      return;
    }
    setDetail({ ...detail, hasPassword: false });
    setMsg({ kind: "ok", text: "Password removed" });
  }

  async function checkEmailInUse(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    if (!email.includes("@")) {
      setEmailError(null);
      return;
    }
    if (drawer === "edit" && detail && email === detail.email.toLowerCase()) {
      setEmailError(null);
      return;
    }
    const res = await fetch(
      `/api/admin/users?q=${encodeURIComponent(email)}&status=all&includeTest=1`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const j = (await res.json()) as { users: UserRow[] };
    const hit = (j.users ?? []).find((u) => u.email.toLowerCase() === email);
    if (hit && hit.id !== detail?.id) {
      setEmailError({
        text: `This email already belongs to ${personLabel(hit)}.`,
        id: hit.id,
        name: personLabel(hit),
      });
    } else {
      setEmailError(null);
    }
  }

  async function submitAdd() {
    if (busy || emailError) return;
    const { firstName, lastName } = splitFullName(form.fullName);
    if (!firstName || !lastName) {
      setMsg({ kind: "error", text: "Enter a first and last name" });
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: form.email,
        role: form.role,
        homeOfficeId: form.homeOfficeId || null,
        isTestAccount: form.isTestAccount,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409) {
      setEmailError({
        text: `This email already belongs to ${j.id ? "an existing user" : form.email}.`,
        id: j.id,
        name: form.fullName || form.email,
      });
      return;
    }
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not add user" });
      return;
    }
    setMsg({ kind: "ok", text: "User added. No invite was sent." });
    closeDrawer();
    void loadList();
    void loadStats();
  }

  async function submitEdit() {
    if (!detail || busy) return;
    if (emailError) return;
    const { firstName, lastName } = splitFullName(form.fullName);
    if (!firstName || !lastName) {
      setMsg({ kind: "error", text: "Enter a first and last name" });
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/users/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: form.email,
        role: form.role,
        homeOfficeId: form.homeOfficeId || null,
        isTestAccount: form.isTestAccount,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409) {
      setEmailError({
        text: "This email is already in use.",
        id: j.id,
      });
      return;
    }
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not save changes" });
      return;
    }
    setMsg({ kind: "ok", text: "Changes saved" });
    closeDrawer();
    void loadList();
    void loadStats();
  }

  async function revokeDevice(deviceId: string) {
    if (!detail) return;
    if (!window.confirm("Sign this device out? It stops sending presence until they sign in again.")) return;
    const res = await fetch(`/api/admin/users/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revokeDeviceId: deviceId }),
    });
    if (!res.ok) {
      setMsg({ kind: "error", text: "Could not sign out device" });
      return;
    }
    const refreshed = await fetch(`/api/admin/users/${detail.id}`, { cache: "no-store" });
    if (refreshed.ok) {
      const j = (await refreshed.json()) as { user: UserDetail };
      setDetail(j.user);
    }
    void loadList();
  }

  async function confirmDeactivate() {
    if (!detail || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${detail.id}/deactivate`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not deactivate" });
      return;
    }
    setMsg({ kind: "ok", text: `${personLabel(detail)} deactivated` });
    setModal(null);
    closeDrawer();
    void loadList();
    void loadStats();
  }

  async function confirmReactivate() {
    if (!detail || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${detail.id}/reactivate`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not reactivate" });
      return;
    }
    setMsg({ kind: "ok", text: `${personLabel(detail)} reactivated` });
    setModal(null);
    const refreshed = await fetch(`/api/admin/users/${detail.id}`, { cache: "no-store" });
    if (refreshed.ok) {
      const body = (await refreshed.json()) as { user: UserDetail };
      setDetail(body.user);
    }
    void loadList();
    void loadStats();
  }

  async function confirmDelete() {
    if (!detail || busy) return;
    if (confirmEmail.trim().toLowerCase() !== detail.email.toLowerCase()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${detail.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: confirmEmail.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not delete" });
      return;
    }
    setMsg({ kind: "ok", text: "User deleted permanently" });
    setModal(null);
    setConfirmEmail("");
    closeDrawer();
    void loadList();
    void loadStats();
  }

  async function startViewAs() {
    if (!viewAsTarget || busy) return;
    setBusy(true);
    const res = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: viewAsTarget.id }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "error", text: typeof j.error === "string" ? j.error : "Could not start view as" });
      return;
    }
    if (j.session?.id) {
      sessionStorage.setItem(`op-viewas-started-${j.session.id}`, String(Date.now()));
    }
    window.location.href = "/month";
  }

  function exportCsv() {
    const rows = users ?? [];
    const csv = toCsv(
      ["name", "email", "role", "homeOffice", "status", "phones", "lastSeen", "testAccount"],
      rows.map((u) => [
        personLabel(u),
        u.email,
        u.role === "admin" ? "Admin" : "Employee",
        u.homeOffice?.name ?? "",
        u.deactivatedAt ? "Deactivated" : "Active",
        u.phones?.length ?? 0,
        fmtLastSeen(u.lastSeenAt),
        u.isTestAccount || u.isDummy ? "yes" : "no",
      ]),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const isSelf = (id: string) => id === adminUserId;
  const canViewAs = (u: UserRow) =>
    !u.deactivatedAt && u.role !== "admin" && u.id !== adminUserId;

  const emptySearch = !loading && users && users.length === 0 && (q.trim() || role || office || status !== "all");

  return (
    <>
      <div className="op-whead">
        <div>
          <h1>Users</h1>
          <p className="op-sub">
            Everyone who can sign in. People sign in with their PwC email and a code in Teams.
          </p>
        </div>
        <div className="row" style={{ gap: 10, display: "flex" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>
            Export CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
            Add user
          </button>
        </div>
      </div>

      {msg ? (
        <div className={`op-toast ${msg.kind === "ok" ? "ok" : "err"}`} role="status">
          {msg.kind === "ok" ? <span aria-hidden>✓</span> : null}
          <div>{msg.text}</div>
          <button type="button" className="btn btn-ghost" onClick={() => setMsg(null)} aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="op-strip op-strip-inline">
        <button
          type="button"
          className={`op-stat ${status === "active" ? "on" : ""}`}
          onClick={() => setStatus("active")}
        >
          <div className="n">{stats.active}</div>
          <div className="l">Active</div>
        </button>
        <div className="op-stat" style={{ cursor: "default" }}>
          <div className="n">{stats.admins}</div>
          <div className="l">Admins</div>
        </div>
        <button
          type="button"
          className={`op-stat ${includeTest ? "on" : ""}`}
          onClick={() => setIncludeTest((v) => !v)}
        >
          <div className="n">{stats.test}</div>
          <div className="l">Test accounts</div>
        </button>
        <button
          type="button"
          className={`op-stat ${status === "deactivated" ? "on" : ""}`}
          onClick={() => setStatus("deactivated")}
        >
          <div className="n">{stats.deactivated}</div>
          <div className="l">Deactivated</div>
        </button>
      </div>

      <div className="op-filters">
        <label className="op-search">
          <span className="op-search-ic" aria-hidden>
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search name or email"
          />
        </label>
        <select className="op-sel" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="">All roles</option>
          <option value="user">Employee</option>
          <option value="admin">Admin</option>
        </select>
        <select
          className="op-sel"
          value={office}
          onChange={(e) => setOffice(e.target.value)}
          aria-label="Home office"
        >
          <option value="">All offices</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <div className="op-seg" role="group" aria-label="Status">
          {(
            [
              ["active", "Active"],
              ["deactivated", "Deactivated"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={status === id ? "on" : undefined} onClick={() => setStatus(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="op-chk">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => setIncludeTest(e.target.checked)}
          />
          Include test accounts
        </label>
      </div>

      {loading && !users ? (
        <div className="card">
          <span className="skeleton" style={{ height: 240, display: "block" }} />
        </div>
      ) : emptySearch ? (
        <div className="op-empty">
          <div className="op-empty-icon" aria-hidden>
            {initials("U")}
          </div>
          <h2>No users match</h2>
          <p>
            No one matches {q.trim() ? `"${q.trim()}"` : "these filters"} in{" "}
            {status === "active" ? "Active" : status === "deactivated" ? "Deactivated" : "All"} users. Try
            Deactivated or All, or add a new user.
          </p>
          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQ("");
                setRole("");
                setOffice("");
                setStatus("all");
                setIncludeTest(true);
              }}
            >
              Show all users
            </button>
          </div>
        </div>
      ) : (
        <div className="op-tbl">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Home office</th>
                <th>Status</th>
                <th className="r">Phones</th>
                <th>Last seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => {
                const label = personLabel(u);
                const hl = selectedId === u.id;
                return (
                  <tr key={u.id} className={hl ? "hl" : undefined}>
                    <td>
                      <div className="row" style={{ gap: 8, display: "flex", alignItems: "center" }}>
                        <span className="person-name">{label}</span>
                        {u.isTestAccount || u.isDummy ? <span className="op-tag">Test</span> : null}
                        {u.isTestAccount || u.isDummy ? <span className="op-tag">Test</span> : null}
                      </div>
                      <div className="person-email">{u.email}</div>
                    </td>
                    <td>{u.role === "admin" ? "Admin" : "Employee"}</td>
                    <td>{u.homeOffice?.name ?? "Not set"}</td>
                    <td>
                      {u.deactivatedAt ? (
                        <span className="op-badge out">Deactivated</span>
                      ) : (
                        <span className="op-ink2">Active</span>
                      )}
                    </td>
                    <td className="r tab">{u.phones?.length ?? 0}</td>
                    <td className="op-ink2">{fmtLastSeen(u.lastSeenAt)}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 6, display: "flex", justifyContent: "flex-end" }}>
                        {canViewAs(u) ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 13 }}
                            onClick={() => {
                              setViewAsTarget(u);
                              setModal("viewAs");
                            }}
                          >
                            View as
                          </button>
                        ) : null}
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => void openEdit(u)}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawer ? (
        <>
          <button type="button" className="op-drawer-scrim" aria-label="Close drawer" onClick={closeDrawer} />
          <aside className="op-drawer" role="dialog" aria-label={drawer === "add" ? "Add user" : "Edit user"}>
            <div className="op-drawer-head">
              <span className="op-meta">{drawer === "add" ? "Users" : "Edit user"}</span>
              <button type="button" className="op-icon-btn" aria-label="Close" onClick={closeDrawer}>
                ×
              </button>
            </div>
            <h2 className="op-drawer-title">
              {drawer === "add" ? "Add user" : personLabel(detail ?? selected ?? { name: form.fullName })}
            </h2>
            {drawer === "edit" && detail ? (
              <p className="op-meta" style={{ marginTop: 4 }}>
                {detail.createdAt
                  ? `Added ${new Date(detail.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. `
                  : null}
                Last seen {fmtLastSeen(detail.lastSeenAt).toLowerCase()}.
              </p>
            ) : null}

            <UserForm
              form={form}
              setForm={setForm}
              offices={offices}
              emailError={emailError}
              onEmailBlur={() => void checkEmailInUse(form.email)}
              onOpenExisting={
                emailError?.id
                  ? () => {
                      const hit = users?.find((u) => u.id === emailError.id);
                      if (hit) void openEdit(hit);
                      else {
                        void fetch(`/api/admin/users/${emailError.id}`)
                          .then((r) => r.json())
                          .then((j) => {
                            if (j.user) void openEdit(j.user);
                          });
                      }
                    }
                  : undefined
              }
              roleLocked={drawer === "edit" && isSelf(detail?.id ?? "")}
              testHint
            />

            {drawer === "add" ? (
              <p className="op-meta" style={{ margin: "16px 0 0" }}>
                No invite is sent.{" "}
                {form.fullName.trim() ? firstNameOf(form.fullName) : "They"} signs in on the phone app with this
                email and gets a code in Teams.
              </p>
            ) : null}

            {drawer === "edit" && detail ? (
              <>
                <div className="op-meta" style={{ fontWeight: 600, margin: "18px 0 4px" }}>
                  Password
                </div>
                <p className="op-meta" style={{ margin: "0 0 8px" }}>
                  {detail.hasPassword
                    ? "Password sign-in is on. Setting a new one replaces it."
                    : "No password yet. Useful for test accounts and when Teams is unavailable."}
                </p>
                <label className="op-field">
                  <span className="op-field-lab">New password</span>
                  <input
                    className="op-input op-input-sm"
                    type="password"
                    autoComplete="new-password"
                    value={adminPassword}
                    disabled={adminPasswordBusy || !!detail.deactivatedAt}
                    onChange={(e) => setAdminPassword(e.target.value)}
                  />
                </label>
                <div className="row" style={{ marginTop: 10, gap: 10, display: "flex", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={adminPasswordBusy || !!detail.deactivatedAt || !adminPassword}
                    onClick={() => void saveAdminPassword()}
                  >
                    {adminPasswordBusy ? "Saving" : "Set password"}
                  </button>
                  {detail.hasPassword ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 13.5 }}
                      disabled={adminPasswordBusy || !!detail.deactivatedAt}
                      onClick={() => void clearAdminPassword()}
                    >
                      Remove password
                    </button>
                  ) : null}
                </div>

                <div className="op-meta" style={{ fontWeight: 600, margin: "18px 0 4px" }}>
                  Phones
                </div>
                {(detail.phones ?? []).length === 0 ? (
                  <p className="op-meta" style={{ margin: 0 }}>
                    No phones signed in.
                  </p>
                ) : (
                  <div className="op-lst">
                    {detail.phones.map((d) => {
                      const rows = apiActivity.filter((a) => a.deviceId === d.id);
                      return (
                        <div key={d.id} className="op-lst-it" style={{ flexDirection: "column", alignItems: "stretch" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <div className="grow">
                              <b>{d.label ?? "Phone"}</b>
                              <div className="op-meta">
                                {d.platform} · {fmtSyncAgo(d.lastSeenAt)}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => void revokeDevice(d.id)}
                            >
                              Sign out device
                            </button>
                          </div>
                          <div className="op-meta" style={{ fontWeight: 600, margin: "10px 0 4px" }}>
                            Recent API activity
                          </div>
                          {apiActivityLoading ? (
                            <p className="op-meta" style={{ margin: 0 }}>
                              Loading activity...
                            </p>
                          ) : rows.length === 0 ? (
                            <p className="op-meta" style={{ margin: 0 }}>
                              No calls logged yet
                            </p>
                          ) : (
                            <div className="op-meta" style={{ color: "var(--op-ink)" }}>
                              {rows.slice(0, 20).map((a) => {
                                const when = new Date(a.at).toLocaleString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                });
                                const bits = [
                                  when,
                                  a.method,
                                  a.path,
                                  String(a.statusCode),
                                  a.note,
                                  a.durationMs != null ? `${a.durationMs} ms` : null,
                                ].filter(Boolean);
                                return (
                                  <div key={a.id} style={{ marginBottom: 4 }}>
                                    {bits.join(" · ")}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="op-meta" style={{ fontWeight: 600, margin: "16px 0 4px" }}>
                  Admin activity
                </div>
                {(detail.viewAsSessions ?? []).length === 0 ? (
                  <p className="op-meta" style={{ margin: 0, color: "var(--op-ink)" }}>
                    No view-as sessions yet.
                  </p>
                ) : (
                  <div className="op-meta" style={{ color: "var(--op-ink)" }}>
                    {(detail.viewAsSessions ?? []).slice(0, 5).map((s) => {
                      const mins = Math.max(
                        1,
                        Math.round(
                          ((s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) -
                            new Date(s.startedAt).getTime()) /
                            60_000,
                        ),
                      );
                      const when = new Date(s.startedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      });
                      const admin = s.admin.name || s.admin.email;
                      const short = firstNameOf(personLabel(detail));
                      return (
                        <div key={s.id} style={{ marginBottom: 6 }}>
                          {admin} viewed the app as {short} on {when} for {mins} min.
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}

            <div
              className="op-drawer-foot"
              style={{
                marginTop: "auto",
                paddingTop: 18,
                borderTop: "1px solid var(--op-line)",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div className="row" style={{ gap: 10, display: "flex" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !!emailError || !form.fullName.trim() || !form.email.trim()}
                  onClick={() => void (drawer === "add" ? submitAdd() : submitEdit())}
                >
                  {drawer === "add" ? "Add user" : "Save changes"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={closeDrawer}>
                  Cancel
                </button>
              </div>
              {drawer === "edit" && detail && !isSelf(detail.id) ? (
                <div className="row" style={{ gap: 14, display: "flex", alignItems: "center" }}>
                  {!detail.deactivatedAt ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setModal("deactivate")}
                    >
                      Deactivate user
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setModal("reactivate")}
                    >
                      Reactivate user
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 13.5 }} onClick={() => {
                    setConfirmEmail("");
                    setModal("delete");
                  }}>
                    Delete user
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}

      {modal === "viewAs" && viewAsTarget ? (
        <Modal onClose={() => setModal(null)}>
          <h2 className="op-modal-title">View as {personLabel(viewAsTarget)}?</h2>
          <div className="op-drows">
            {(viewAsTarget.isTestAccount || viewAsTarget.isDummy
              ? [
                  "Tracking on this session counts for this test account while it lasts.",
                  "Visits are marked test and left out of the roster and reports.",
                  "You can send corrections and change settings as this account.",
                  "Ends after 30 minutes. Your own session resumes after.",
                ]
              : [
                  "Read only. You cannot send corrections, change sharing, edit the profile, or sign out devices.",
                  `You see My month, Colleagues and Settings exactly as ${firstNameOf(personLabel(viewAsTarget))} does. Admin pages are hidden.`,
                  "Ends after 30 minutes, when you tap End, or when you close the tab.",
                  `Logged with your name on ${firstNameOf(personLabel(viewAsTarget))}'s user record.`,
                ]
            ).map((t) => (
              <div key={t} className="op-drow">
                <span aria-hidden>•</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 24, gap: 10, display: "flex" }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void startViewAs()}>
              {viewAsTarget.isTestAccount || viewAsTarget.isDummy ? "Start testing" : "Start viewing"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {modal === "deactivate" && detail ? (
        <Modal onClose={() => setModal(null)}>
          <h2 className="op-modal-title">Deactivate {personLabel(detail)}?</h2>
          <div className="op-drows">
            <div className="op-drow">
              <span aria-hidden>•</span>
              <span>
                Signs out {detail.phones?.length ?? 0} phone{(detail.phones?.length ?? 0) === 1 ? "" : "s"} and stops
                tracking.
              </span>
            </div>
            <div className="op-drow">
              <span aria-hidden>•</span>
              <span>
                Removes {firstNameOf(personLabel(detail))} from Colleagues, the roster, and new reports.
              </span>
            </div>
            <div className="op-drow">
              <span aria-hidden>•</span>
              <span>Keeps all visits and past reports. You can reactivate at any time.</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 24, gap: 10, display: "flex" }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void confirmDeactivate()}>
              Deactivate user
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {modal === "reactivate" && detail ? (
        <Modal onClose={() => setModal(null)}>
          <h2 className="op-modal-title">Reactivate {personLabel(detail)}?</h2>
          <div className="op-drows">
            <div className="op-drow">
              <span aria-hidden>•</span>
              <span>They can sign in again on the phone and web.</span>
            </div>
            <div className="op-drow">
              <span aria-hidden>•</span>
              <span>Visit history and past reports are kept.</span>
            </div>
            <div className="op-drow">
              <span aria-hidden>•</span>
              <span>They need to sign in fresh; old device sessions stay signed out.</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 24, gap: 10, display: "flex" }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void confirmReactivate()}>
              Reactivate user
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {modal === "delete" && detail ? (
        <Modal onClose={() => setModal(null)}>
          <h2 className="op-modal-title">Delete {personLabel(detail)} permanently?</h2>
          <p className="op-ink2" style={{ margin: "12px 0 0", fontSize: 15 }}>
            This removes the account and related visits and correction requests. Past reports will no longer include{" "}
            {firstNameOf(personLabel(detail))}. This cannot be undone.
          </p>
          <label className="op-field" style={{ marginTop: 18 }}>
            <span className="op-field-lab">Type {detail.email} to confirm</span>
            <input
              className="op-input op-input-sm"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div
            className="btw"
            style={{ marginTop: 24, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
          >
            <div className="row" style={{ gap: 10, display: "flex" }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || confirmEmail.trim().toLowerCase() !== detail.email.toLowerCase()}
                onClick={() => void confirmDelete()}
              >
                Delete permanently
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>
                Cancel
              </button>
            </div>
            {!detail.deactivatedAt ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 13.5 }}
                onClick={() => setModal("deactivate")}
              >
                Deactivate instead
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function UserForm({
  form,
  setForm,
  offices,
  emailError,
  onEmailBlur,
  onOpenExisting,
  roleLocked,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  offices: Office[];
  emailError: { text: string; id?: string; name?: string } | null;
  onEmailBlur: () => void;
  onOpenExisting?: () => void;
  roleLocked?: boolean;
  testHint?: boolean;
}) {
  return (
    <>
      <label className="op-field" style={{ marginTop: 22 }}>
        <span className="op-field-lab">Full name</span>
        <input
          className="op-input op-input-sm"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          placeholder="First and last name"
        />
      </label>
      <label className="op-field" style={{ marginTop: 14 }}>
        <span className="op-field-lab">PwC email</span>
        <input
          className={`op-input op-input-sm ${emailError ? "err" : ""}`}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          onBlur={onEmailBlur}
          placeholder="name@pwc.com"
        />
        {emailError ? (
          <div className="op-ferr">
            <span aria-hidden>!</span>
            <span>
              {emailError.text}{" "}
              {onOpenExisting && emailError.name ? (
                <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onOpenExisting}>
                  Open {emailError.name}
                </button>
              ) : null}
            </span>
          </div>
        ) : null}
      </label>
      <div style={{ marginTop: 16 }}>
        <span className="op-field-lab" style={{ display: "block", marginBottom: 8 }}>
          Role
        </span>
        <div className="op-seg" role="group" aria-label="Role">
          <button
            type="button"
            className={form.role === "user" ? "on" : undefined}
            disabled={roleLocked}
            onClick={() => setForm({ ...form, role: "user" })}
          >
            Employee
          </button>
          <button
            type="button"
            className={form.role === "admin" ? "on" : undefined}
            disabled={roleLocked}
            onClick={() => setForm({ ...form, role: "admin" })}
          >
            Admin
          </button>
        </div>
        {roleLocked ? (
          <p className="op-meta" style={{ marginTop: 8 }}>
            You cannot change your own role.
          </p>
        ) : null}
      </div>
      <label className="op-field" style={{ marginTop: 16 }}>
        <span className="op-field-lab">Home office</span>
        <select
          className="op-input op-input-sm"
          value={form.homeOfficeId}
          onChange={(e) => setForm({ ...form, homeOfficeId: e.target.value })}
        >
          <option value="">Choose an office</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div
        className="op-set-row"
        style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--op-line)" }}
      >
        <div>
          <div className="op-set-h" style={{ fontSize: 14.5 }}>
            Test account
          </div>
          <div className="op-meta">
            Admins can test the phone app as this user. Data is marked test and left out of reports.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.isTestAccount}
          aria-label="Test account"
          className={`op-switch ${form.isTestAccount ? "on" : ""}`}
          onClick={() => setForm({ ...form, isTestAccount: !form.isTestAccount })}
        />
      </div>
    </>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <button type="button" className="op-drawer-scrim" aria-label="Close dialog" onClick={onClose} />
      <div className="op-wmodal" role="dialog">
        {children}
      </div>
    </>
  );
}
