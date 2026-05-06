"use client";

import type { ReactNode } from "react";
import { Topbar } from "./Topbar";
import { useUiStore } from "@/stores/useUiStore";
import { cn } from "@/lib/utils/cn";

type Props = {
  user: { name: string; email: string; role: string; initials: string };
  children: ReactNode;
};

/**
 * Responsive content column. Reacts to the persisted sidebarCollapsed flag
 * so the left margin always matches the current sidebar width on tablet
 * and desktop. On mobile the sidebar is a drawer (overlay), so the column
 * has no offset.
 */
export function AppShell({ user, children }: Props) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col transition-[margin-left] duration-200",
        // Mobile: no offset.
        // Tablet+desktop: offset depends on collapsed state.
        collapsed ? "md:ml-[72px]" : "md:ml-[240px]",
      )}
    >
      <Topbar user={user} />
      <main className="w-full max-w-[1440px] flex-1 px-4 pb-24 pt-5 md:px-7 md:pb-7 md:pt-7">
        {children}
      </main>
    </div>
  );
}
