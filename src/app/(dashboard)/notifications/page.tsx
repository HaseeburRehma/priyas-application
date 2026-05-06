import type { Metadata } from "next";
import {
  loadNotifications,
  type NotificationsTab,
} from "@/lib/api/notifications";
import { NotificationsPage } from "@/components/notifications/NotificationsPage";

export const metadata: Metadata = { title: "Benachrichtigungen" };
export const dynamic = "force-dynamic";

const VALID: NotificationsTab[] = [
  "all",
  "unread",
  "mentions",
  "invoices",
  "schedule",
  "alltagshilfe",
];

type SearchParams = { tab?: string };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const tab: NotificationsTab = VALID.includes(sp.tab as NotificationsTab)
    ? (sp.tab as NotificationsTab)
    : "all";
  const data = await loadNotifications(tab);
  return <NotificationsPage data={data} tab={tab} />;
}
