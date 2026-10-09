/**
 * Employee status helpers shared by the employee list and detail
 * screens (kept out of app/ so expo-router only sees screens there).
 */

import { type Tone } from "@/components/ui";
import { type EmployeeRow } from "@/lib/employees";
import { t } from "@/lib/i18n";

export type EmployeeDisplayStatus =
  | "active"
  | "overtime"
  | "vacation"
  | "sick"
  | "on_leave"
  | "unavailable"
  | "inactive"
  | "terminated";

/** Employment status first, then availability, then week workload. */
export function displayStatusOf(r: EmployeeRow): EmployeeDisplayStatus {
  if (r.status === "terminated") return "terminated";
  if (r.status === "inactive") return "inactive";
  if (r.status === "on_leave") return "on_leave";
  if (r.availability_status === "on_vacation") return "vacation";
  if (r.availability_status === "sick") return "sick";
  if (r.availability_status === "inactive") return "unavailable";
  if (r.weekly_hours && (r.hours_this_week ?? 0) > r.weekly_hours) return "overtime";
  return "active";
}

export function displayStatusBadge(s: EmployeeDisplayStatus): { label: string; tone: Tone } {
  switch (s) {
    case "active":
      return { label: t("mobile.employees.status.active"), tone: "success" };
    case "overtime":
      return { label: t("employees.status.overtime"), tone: "warning" };
    case "vacation":
      return { label: t("mobile.ui.employees.status.vacation"), tone: "info" };
    case "on_leave":
      return { label: t("mobile.employees.status.on_leave"), tone: "info" };
    case "sick":
      return { label: t("vacation.table.kindSick"), tone: "warning" };
    case "unavailable":
      return { label: t("mobile.ui.employees.status.unavailable"), tone: "neutral" };
    case "inactive":
      return { label: t("mobile.employees.status.inactive"), tone: "neutral" };
    case "terminated":
      return { label: t("mobile.ui.employees.status.terminated"), tone: "neutral" };
  }
}
