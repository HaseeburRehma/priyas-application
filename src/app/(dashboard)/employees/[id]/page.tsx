import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadEmployeeDetail } from "@/lib/api/employees";
import { can, requireRoute } from "@/lib/rbac/permissions";
import { EmployeeDetail } from "@/components/employees/EmployeeDetail";

export const metadata: Metadata = { title: "Mitarbeiterdetails" };
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function Page({
  params,
}: {
  params: Promise<Params>;
}) {
  await requireRoute("employee");
  const { id } = await params;
  const detail = await loadEmployeeDetail(id);
  if (!detail) notFound();
  const [canUpdate, canArchive] = await Promise.all([
    can("employee.update"),
    can("employee.archive"),
  ]);
  return (
    <EmployeeDetail
      detail={detail}
      canUpdate={canUpdate}
      canArchive={canArchive}
    />
  );
}
