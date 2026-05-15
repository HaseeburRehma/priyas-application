"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { useLocale } from "next-intl";
import type { Channel, Message } from "@/types/chat";
import { useMessages } from "@/hooks/chat/useMessages";
import { useSendMessage, useMarkChannelRead } from "@/hooks/chat/useSendMessage";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { routes } from "@/lib/constants/routes";

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

type Props = {
  channel: Channel;
  currentUserId: string | null;
};

/**
 * Right-pane message thread. Loads messages via useMessages (which also
 * subscribes to realtime), renders day-grouped bubbles, and posts via
 * useSendMessage with optimistic insertion.
 *
 * Marks the channel as read on mount and whenever new messages arrive.
 */
export function ChatThread({ channel, currentUserId }: Props) {
  const locale = useLocale() as keyof typeof localeMap;
  const { messages, loading, error, append, replace } = useMessages(channel.id);
  const { send, error: sendError } = useSendMessage();
  const markAsRead = useMarkChannelRead();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Mark as read on mount + on new messages. We debounce 500 ms so a
  // burst of incoming messages on a busy channel doesn't hammer the
  // server with one POST per message — the trailing call covers the last
  // message in the burst. Cleanup cancels any pending timeout when the
  // channel switches (no stale read for the previous channel).
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void markAsRead(channel.id);
    }, 500);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [channel.id, messages.length, markAsRead]);

  // Group messages by day for the day separators.
  const grouped = useMemo(() => {
    const out: Array<{ day: Date; items: Message[] }> = [];
    for (const m of messages) {
      const d = new Date(m.created_at);
      const last = out[out.length - 1];
      if (last && isSameDay(last.day, d)) {
        last.items.push(m);
      } else {
        out.push({ day: d, items: [m] });
      }
    }
    return out;
  }, [messages]);

  return (
    <section className="flex h-full flex-col bg-white">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-neutral-100 px-3 py-3 md:px-5">
        <Link
          href={routes.chat}
          aria-label="Back"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800 md:hidden"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        {/*
          Direct-message avatar — green-on-white initials of the *other*
          participant, matching the rest of the app's avatar style.
          Channels keep the icon-style square chip; private channels
          get a lock glyph.
        */}
        <span
          className={
            channel.is_direct
              ? "grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary-500 text-[12px] font-bold text-white"
              : channel.is_private
                ? "grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-warning-50 text-[14px] font-bold text-warning-700"
                : "grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-primary-50 text-[14px] font-bold text-primary-700"
          }
        >
          {channel.is_direct
            ? dmInitials(channel.name)
            : channel.is_private
              ? "🔒"
              : "#"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="truncate text-[15px] font-semibold text-secondary-500">
              {channel.is_direct ? channel.name : channel.name.replace(/^#/, "")}
            </span>
          </div>
          <div className="truncate text-[11px] text-neutral-500">
            {channel.is_direct
              ? "Direktnachricht"
              : [
                  channel.description ?? null,
                  `erstellt ${format(new Date(channel.created_at), "d. MMM yyyy", { locale: localeMap[locale] })}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </div>
        </div>
        {/* Action icons — call / video / search / more */}
        <div className="hidden items-center gap-1 md:flex">
          <HeaderIconButton label="Call">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
          </HeaderIconButton>
          <HeaderIconButton label="Video">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x={1} y={5} width={15} height={14} rx={2} ry={2} />
          </HeaderIconButton>
          <HeaderIconButton label="Search">
            <circle cx={11} cy={11} r={8} />
            <path d="M21 21l-4.35-4.35" />
          </HeaderIconButton>
          <HeaderIconButton label="More">
            <circle cx={5} cy={12} r={1} />
            <circle cx={12} cy={12} r={1} />
            <circle cx={19} cy={12} r={1} />
          </HeaderIconButton>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 md:px-5"
      >
        {loading && (
          <div className="grid h-full place-items-center text-[13px] text-neutral-500">
            Wird geladen…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-error-100 bg-error-50 px-3 py-2 text-[12px] text-error-700">
            Fehler beim Laden: {error}
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="grid h-full place-items-center text-center text-[13px] text-neutral-500">
            <div>
              <div className="mb-1 font-semibold text-neutral-700">
                Sei der Erste, der hier schreibt.
              </div>
              <div>Nachrichten erscheinen sofort für alle Mitglieder.</div>
            </div>
          </div>
        )}

        {!loading &&
          grouped.map((group) => {
            return (
              <div key={group.day.toISOString()} className="mb-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-neutral-100" />
                  <span className="rounded-full bg-neutral-50 px-3 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-neutral-500">
                    {format(group.day, "EEEE · d. MMMM yyyy", {
                      locale: localeMap[locale],
                    })}
                  </span>
                  <div className="h-px flex-1 bg-neutral-100" />
                </div>
                {group.items.map((m, idx) => {
                  const prev = group.items[idx - 1];
                  const showHeader =
                    !prev ||
                    prev.user_id !== m.user_id ||
                    new Date(m.created_at).getTime() -
                      new Date(prev.created_at).getTime() >
                      5 * 60 * 1000;
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      isOwn={!!currentUserId && m.user_id === currentUserId}
                      showHeader={showHeader}
                    />
                  );
                })}
              </div>
            );
          })}
      </div>

      {sendError && (
        <div className="border-t border-error-100 bg-error-50 px-3 py-2 text-[12px] text-error-700">
          {sendError}
        </div>
      )}

      <Composer
        channelId={channel.id}
        orgId={channel.org_id}
        onSend={async ({ body, attachments }) => {
          await send({
            channelId: channel.id,
            body,
            attachments,
            // Render the optimistic placeholder immediately so the user
            // sees their message land without waiting for the round-trip…
            onOptimistic: append,
            // …then swap it for the persisted row once the insert
            // resolves. This is what stops the "I sent one, see two"
            // duplication that the realtime INSERT used to cause.
            onPersisted: (tempId, real) => {
              void replace(tempId, real);
            },
          });
        }}
      />
    </section>
  );
}

/**
 * Pull initials out of a DM channel name. Backend formats those as
 * "Alice Müller ↔ Bob Schmidt" — split on the arrow, take both
 * participants, then prefer the *other* participant's initials when we
 * can identify ourselves. Falls back to first two letters of the full
 * name (which is what the previous code did).
 */
function dmInitials(name: string): string {
  if (!name) return "?";
  // Split on the directional arrows the chat-channels factory uses.
  const parts = name.split(/\s*[↔–—-]\s*/).filter(Boolean);
  // Pick the longest part as the "other" person heuristically — both
  // halves are present, so the longer one is unlikely to be empty.
  const target = parts.length > 0 ? parts[parts.length - 1] : name;
  const initials = (target ?? name)
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || name.slice(0, 2).toUpperCase();
}

function HeaderIconButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        {children}
      </svg>
    </button>
  );
}
