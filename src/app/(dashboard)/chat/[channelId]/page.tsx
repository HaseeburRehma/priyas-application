import type { Metadata } from "next";
import { ChatPage } from "@/components/chat/ChatPage";

export const metadata: Metadata = { title: "Team-Chat" };

type RouteParams = { channelId: string };

export default async function Page({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { channelId } = await params;
  return <ChatPage selectedChannelId={channelId} />;
}
