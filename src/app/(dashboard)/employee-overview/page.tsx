import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { loadEmployeeOverview } from "@/lib/api/employee-overview";
import { EmployeeOverview } from "@/components/employees/EmployeeOverview";

export const metadata: Metadata = { title: "Mitarbeiterübersicht" };
export const dynamic = "force-dynamic";

/**
 * HR-flavoured employee dashboard separate from the operational
 * /employees list. Surfaces utilization, attendance, certificates and
 * personnel events. Managers + admins only — field staff don't need
 * org-wide HR insight.
 */
export default async function Page() {
  if (!(await can("employee.read"))) redirect(routes.dashboard);
  const data = await loadEmployeeOverview();
  return <EmployeeOverview data={data} />;
}
