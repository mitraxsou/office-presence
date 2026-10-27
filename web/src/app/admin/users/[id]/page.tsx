import { redirect } from "next/navigation";

export default async function UserVisitsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/people/${id}`);
}
