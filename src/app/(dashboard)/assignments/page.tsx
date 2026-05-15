import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PermissionError, requirePermission } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { loadAssignments } from "@/lib/api/assignments";
import { AssignmentsPage } from "@/components/assignments/AssignmentsPage";

export const metadata: Metadata = { title: "Aufträge" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("property.read");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.dashboard);
    throw err;
  }
  const rows = await loadAssignments();
  return <AssignmentsPage rows={rows} />;
}
