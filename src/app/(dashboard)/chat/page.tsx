import type { Metadata } from "next";
import { ChatPage } from "@/components/chat/ChatPage";

export const metadata: Metadata = { title: "Team-Chat" };

export default function Page() {
  return <ChatPage selectedChannelId={null} />;
}
