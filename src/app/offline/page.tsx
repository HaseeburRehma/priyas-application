import type { Metadata } from "next";
import { OfflineContent } from "@/components/pwa/OfflineContent";

export const dynamic = "force-static";
export const revalidate = false;

export const metadata: Metadata = {
  title: "Offline",
  description: "You are currently offline.",
};

/**
 * Static offline fallback served by the service worker when navigation
 * requests fail with the network down. No server fetches — anything
 * interactive lives in the client component.
 */
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-tertiary-200 px-6">
      <OfflineContent />
    </main>
  );
}
