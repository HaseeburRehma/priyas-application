import type { Metadata } from "next";
import { loadScheduleWeek } from "@/lib/api/schedule";
import { SchedulePage } from "@/components/schedule/SchedulePage";

export const metadata: Metadata = { title: "Einsatzplan" };
export const dynamic = "force-dynamic";

type SearchParams = { date?: string };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const anchor = sp.date ? new Date(sp.date) : new Date();
  const week = await loadScheduleWeek(anchor);
  return <SchedulePage week={week} />;
}
