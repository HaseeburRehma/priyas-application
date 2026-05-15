import type { Metadata } from "next";
import { loadEmployeesSummary } from "@/lib/api/employees";
import { can, requireRoute } from "@/lib/rbac/permissions";
import { EmployeesPageClient } from "@/components/employees/EmployeesPageClient";

export const metadata: Metadata = { title: "Mitarbeiter" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireRoute("employees");
  const [summary, canCreate, canArchive] = await Promise.all([
    loadEmployeesSummary(),
    can("employee.create"),
    can("employee.archive"),
  ]);
  return (
    <EmployeesPageClient
      summary={summary}
      canCreate={canCreate}
      canArchive={canArchive}
    />
  );
}
