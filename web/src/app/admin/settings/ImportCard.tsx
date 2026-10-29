"use client";

import { useState } from "react";

type Counts = {
  csvUsers: number;
  usersToCreate: number;
  usersMatched: number;
  usersSkipped: number;
  daysToInsert: number;
  daysSkippedAlreadyImported: number;
  daysSkippedHasVisit: number;
  daysSkippedTodayOrLater: number;
  daysDuplicateInCsv: number;
};

type Report = {
  dryRun: boolean;
  office?: { name: string; pointsPerVisitDay: number };
  counts?: Counts;
  issues?: Array<{ line: number; email: string; reason: string }>;
  skippedUsers?: Array<{ email: string; reason: string }>;
  applied?: {
    usersCreated: number;
    homeOfficesSet: number;
    visitsInserted: number;
    errors: Array<{ email: string; reason: string }>;
  };
  error?: string;
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export default function ImportCard() {
  const [file, setFile] = useState<File | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? "check" : "import");
    setReport(null);
    try {
      const csv = await file.text();
      const res = await fetch(`/api/admin/imports/office-tracker?dryRun=${dryRun ? "true" : "false"}`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csv,
      });
      const body = (await res.json()) as Report;
      if (!res.ok) {
        setReport({ dryRun, error: body.error || "Import failed" });
        setCheckedKey(null);
        return;
      }
      setReport(body);
      setCheckedKey(dryRun ? fileKey(file) : null);
    } catch {
      setReport({ dryRun, error: "Could not reach the server" });
      setCheckedKey(null);
    } finally {
      setBusy(null);
    }
  }

  const canImport = file != null && checkedKey === fileKey(file) && busy == null;

  return (
    <div className="card" style={{ maxWidth: 820, marginTop: 16, padding: "20px 28px" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Import from Office Tracker</h2>
      <p className="op-sub" style={{ marginTop: 0 }}>
        Download the presence backfill CSV in Office Tracker, then check it here. A day uses the person&apos;s home office, or EGL when they have none. Check file does not write anything.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Office Tracker CSV"
        disabled={busy != null}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setCheckedKey(null);
          setReport(null);
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!file || busy != null}
          onClick={() => void send(true)}
        >
          {busy === "check" ? "Checking..." : "Check file"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canImport}
          onClick={() => void send(false)}
        >
          {busy === "import" ? "Importing..." : "Import visits"}
        </button>
      </div>
      {report?.error ? <p className="status-msg error">{report.error}</p> : null}
      {report?.counts ? <Result report={report} /> : null}
    </div>
  );
}

function Result({ report }: { report: Report }) {
  const c = report.counts!;
  const issues = [...(report.issues ?? []), ...(report.skippedUsers ?? []).map((s) => ({ line: 0, email: s.email, reason: s.reason }))];
  return (
    <div style={{ marginTop: 16 }}>
      <p className="status-msg ok">
        {report.applied
          ? `Imported ${report.applied.visitsInserted} visits and created ${report.applied.usersCreated} users.`
          : `Check only. ${c.daysToInsert} days would be added for ${c.usersToCreate + c.usersMatched} users.`}
      </p>
      <p className="op-meta-row">
        {report.office ? `${report.office.name}, ${report.office.pointsPerVisitDay} points per day. ` : ""}
        New users {c.usersToCreate}. Matched {c.usersMatched}. Skipped users {c.usersSkipped}. Days to add {c.daysToInsert}. Already imported {c.daysSkippedAlreadyImported}. Already has a visit {c.daysSkippedHasVisit}. Today or later {c.daysSkippedTodayOrLater}.
      </p>
      {report.applied && report.applied.errors.length > 0 ? (
        <ul>
          {report.applied.errors.slice(0, 20).map((e) => (
            <li key={`${e.email}-${e.reason}`}>
              {e.email}: {e.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {issues.length > 0 ? (
        <ul>
          {issues.slice(0, 20).map((issue, i) => (
            <li key={`${issue.line}-${issue.email}-${i}`}>
              {issue.line > 0 ? `Line ${issue.line}: ` : ""}
              {issue.email ? `${issue.email}: ` : ""}
              {issue.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
