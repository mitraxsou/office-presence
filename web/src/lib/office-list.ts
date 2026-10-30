/** Offices shown on the admin Offices screen. Deleted rows stay in the database for past days. */
export function isListedOffice(o: { status: string; deletedAt?: string | null }): boolean {
  if (o.deletedAt) return false;
  return o.status === "active" || o.status === "inactive";
}
