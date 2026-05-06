"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useChannels } from "@/hooks/chat/useChannels";
import { useChannelInfo } from "@/hooks/chat/useChannelInfo";
import { usePresence } from "@/hooks/chat/usePresence";
import { ChannelList } from "./ChannelList";
import { ChatThread } from "./ChatThread";
import { ChannelInfoPanel } from "./ChannelInfoPanel";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { routes } from "@/lib/constants/routes";
import type { Channel } from "@/types/chat";
import { cn } from "@/lib/utils/cn";

type Props = {
  /** When set, the matching channel is shown on the right pane. */
  selectedChannelId: string | null;
};

/**
 * Page-level shell for /chat and /chat/[channelId].
 *
 * Top: dashboard breadcrumb + page title + Verlauf / Neuer Kanal actions.
 * Body: three-column layout — channel list, thread, info panel.
 *
 * On mobile we collapse to a single column and rely on routing: a row click
 * goes to /chat/[id], which re-renders this component with `selectedChannelId`
 * set so the thread takes over.
 */
export function ChatPage({ selectedChannelId }: Props) {
  const t = useTranslations("chat.page");
  const { data: channels = [] } = useChannels();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("id", uid)
          .maybeSingle();
        setOrgId((profile as { org_id: string | null } | null)?.org_id ?? null);
      }
    });
  }, []);

  const onlineUserIds = usePresence(orgId);
  const [infoOpen, setInfoOpen] = useState(true);

  const selected: Channel | undefined = channels.find(
    (c) => c.id === selectedChannelId,
  );
  const { data: info } = useChannelInfo(selected?.id ?? null);

  // Decorate members with current online status from presence.
  const decoratedMembers = info.members.map((m) => ({
    ...m,
    online: onlineUserIds.has(m.id),
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Page header ---- */}
      <div>
        <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
          <Link href={routes.dashboard} className="hover:text-neutral-700">
            {t("breadcrumbDashboard")}
          </Link>
          <span className="text-neutral-400">/</span>
          <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
          <span className="text-neutral-400">/</span>
          <span className="text-neutral-700">{t("title")}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
              {t("title")}
            </h1>
            <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn--ghost border border-neutral-200 bg-white"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <circle cx={12} cy={12} r={9} />
                <path d="M12 7v5l3 2" />
              </svg>
              {t("history")}
            </button>
            <button type="button" className="btn btn--primary">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("newChannel")}
            </button>
          </div>
        </div>
      </div>

      {/* ---- 3-column chat layout ---- */}
      <div
        className={cn(
          "flex overflow-hidden rounded-lg border border-neutral-100 bg-white",
          "h-[calc(100vh-220px)] min-h-[560px]",
        )}
      >
        {/* List pane */}
        <div
          className={cn(
            "w-full md:w-[320px] md:flex-shrink-0",
            selectedChannelId ? "hidden md:flex" : "flex",
          )}
        >
          <ChannelList
            channels={channels}
            selectedId={selectedChannelId ?? undefined}
            onlineUserIds={onlineUserIds}
          />
        </div>

        {/* Thread pane */}
        <div
          className={cn(
            "min-w-0 flex-1",
            selectedChannelId ? "flex" : "hidden md:flex",
          )}
        >
          {selected ? (
            <ChatThread channel={selected} currentUserId={currentUserId} />
          ) : (
            <div className="grid h-full w-full place-items-center bg-tertiary-200/40 p-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary-600">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-6 w-6"
                  >
                    <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
                  </svg>
                </div>
                <h2 className="mb-1 text-[16px] font-semibold text-secondary-500">
                  {t("emptyTitle")}
                </h2>
                <p className="text-[13px] text-neutral-500">
                  {t("emptyBody")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right rail — channel info. Hidden on mobile, toggleable on desktop. */}
        {selected && infoOpen && (
          <div className="hidden lg:flex">
            <ChannelInfoPanel
              channel={selected}
              members={decoratedMembers}
              pinned={info.pinned}
              files={info.files}
              onClose={() => setInfoOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
