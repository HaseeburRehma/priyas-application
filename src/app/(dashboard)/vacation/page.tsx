import type { Metadata } from "next";
import { loadVacation } from "@/lib/api/vacation";
import { VacationPage } from "@/components/vacation/VacationPage";

export const metadata: Metadata = { title: "Urlaub" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await loadVacation();
  return <VacationPage data={data} />;
}
