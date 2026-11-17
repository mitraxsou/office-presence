import { prisma } from "./db";
import { splitCsvLine } from "./holidays";
import { wouldCreateManagerCycle } from "./team-scope";

export type TeamCsvRow = { line: number; email: string; managerEmail: string | null; teamName: string | null };
export type TeamImportProblem = { line: number; email: string; error: string };
export type TeamImportChange = {
  line: number;
  userId: string;
  email: string;
  managerId?: string | null;
  managerEmail?: string | null;
  teamName?: string | null;
};
export type TeamImportPlan = {
  rows: number;
  changes: TeamImportChange[];
  problems: TeamImportProblem[];
  newTeams: string[];
};

/** CSV: email,managerEmail,teamName. Header row optional. A blank cell leaves that field as it is. */
export function parseTeamCsv(text: string): { rows: TeamCsvRow[]; problems: TeamImportProblem[] } {
  const rows: TeamCsvRow[] = [];
  const problems: TeamImportProblem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const [email = "", managerEmail = "", teamName = ""] = splitCsvLine(trimmed).map((c) => c.trim());
    if (i === 0 && email.toLowerCase() === "email") return;
    if (!email.includes("@")) {
      problems.push({ line, email, error: "Email is missing" });
      return;
    }
    rows.push({
      line,
      email: email.toLowerCase(),
      managerEmail: managerEmail ? managerEmail.toLowerCase() : null,
      teamName: teamName ? teamName.slice(0, 80) : null,
    });
  });
  return { rows, problems };
}

/** Pure planning step. Rows are applied in order so a later row sees earlier manager changes. */
export function planTeamImport(
  rows: TeamCsvRow[],
  users: { id: string; email: string; managerId: string | null }[],
  teamNames: string[],
): TeamImportPlan {
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const managerOf = new Map(users.map((u) => [u.id, u.managerId]));
  const known = new Set(teamNames.map((n) => n.toLowerCase()));
  const newTeams: string[] = [];
  const changes: TeamImportChange[] = [];
  const problems: TeamImportProblem[] = [];

  for (const r of rows) {
    const user = byEmail.get(r.email);
    if (!user) {
      problems.push({ line: r.line, email: r.email, error: "Unknown person" });
      continue;
    }
    const change: TeamImportChange = { line: r.line, userId: user.id, email: user.email };
    if (r.managerEmail) {
      const manager = byEmail.get(r.managerEmail);
      if (!manager) {
        problems.push({ line: r.line, email: r.email, error: "Unknown manager" });
        continue;
      }
      if (wouldCreateManagerCycle(user.id, manager.id, managerOf)) {
        problems.push({ line: r.line, email: r.email, error: "Manager loop" });
        continue;
      }
      change.managerId = manager.id;
      change.managerEmail = manager.email;
    }
    if (r.teamName) {
      change.teamName = r.teamName;
      if (!known.has(r.teamName.toLowerCase())) {
        known.add(r.teamName.toLowerCase());
        newTeams.push(r.teamName);
      }
    }
    if (change.managerId === undefined && change.teamName === undefined) continue;
    if (change.managerId !== undefined) managerOf.set(user.id, change.managerId);
    changes.push(change);
  }
  return { rows: rows.length, changes, problems, newTeams };
}

export async function runTeamImport(opts: { adminId: string; csv: string; dryRun: boolean }) {
  const parsed = parseTeamCsv(opts.csv);
  const [users, teams] = await Promise.all([
    prisma.user.findMany({ where: { deactivatedAt: null }, select: { id: true, email: true, managerId: true } }),
    prisma.team.findMany({ select: { id: true, name: true } }),
  ]);
  const plan = planTeamImport(parsed.rows, users, teams.map((t) => t.name));
  const problems = [...parsed.problems, ...plan.problems].sort((a, b) => a.line - b.line);
  if (opts.dryRun) return { dryRun: true, ...plan, problems };

  const teamId = new Map(teams.map((t) => [t.name.toLowerCase(), t.id]));
  for (const name of plan.newTeams) {
    const t = await prisma.team.create({ data: { name }, select: { id: true } });
    teamId.set(name.toLowerCase(), t.id);
  }
  for (const c of plan.changes) {
    await prisma.user.update({
      where: { id: c.userId },
      data: {
        ...(c.managerId !== undefined ? { managerId: c.managerId } : {}),
        ...(c.teamName ? { teamId: teamId.get(c.teamName.toLowerCase()) ?? null } : {}),
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      actorId: opts.adminId,
      action: "team.import",
      targetType: "User",
      targetId: "bulk",
      afterJson: { changed: plan.changes.length, skipped: problems.length, newTeams: plan.newTeams },
    },
  });
  return { dryRun: false, ...plan, problems };
}
