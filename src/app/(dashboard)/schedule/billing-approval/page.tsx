import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { loadPendingBillingShifts } from "@/lib/api/shift-billing";
import { ShiftBillingApprovalPage } from "@/components/schedule/ShiftBillingApprovalPage";

export const metadata: Metadata = { title: "Freigabe für Abrechnung" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await can("shift.update"))) redirect(routes.schedule);
  const shifts = await loadPendingBillingShifts();
  return <ShiftBillingApprovalPage shifts={shifts} />;
}
