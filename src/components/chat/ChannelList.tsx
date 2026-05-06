"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { format, isToday, isYesterday } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import type { Channel } from "@/types/chat";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { NewChannelDialog } from "./NewChannelDialog";

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

type Props = {
  channels: Channel[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Set of online profile ids — drives presence dots on DMs. */
  onlineUserIds?: Set<string>;
};

/**
 * Three-section channel sidebar matching the redesigned chat layout:
 *  1. Kanäle (channels) — public/private named channels (#prefix)
 *  2. Direktnachrichten (DMs) — 1:1 with online indicator
 *  3. Gruppen (groups) — small ad-hoc groups
 *
 * Search box filters across all sections; section headers stay visible
 * while a section has any matching items.
 */
export function ChannelList({
  channels,
  selectedId,
  onSelect,
  onlineUserIds,
}: Props) {
  const t = useTranslations("chat.channels");
  const locale = useLocale() as keyof typeof localeMap;
  const [filter, setFilter] = useState("");
  const [dialogMode, setDialogMode] = useState<
    "channel" | "direct" | "group" | null
  >(null);

  const buckets = useMemo(() => {
    const channelList: Channel[] = [];
    const directList: Channel[] = [];
    const groupList: Channel[] = [];
    for (const c of channels) {
      const kind = c.kind ?? (c.is_direct ? "direct" : "channel");
      if (kind === "direct") directList.push(c);
      else if (kind === "group") groupList.push(c);
      else channelList.push(c);
    }
    const sortByName = (a: Channel, b: Channel) =>
      a.name.localeCompare(b.name);
    channelList.sort(sortByName);
    directList.sort(sortByName);
    groupList.sort(sortByName);
    return { channels: channelList, directs: directList, groups: groupList };
  }, [channels]);

  const f = filter.trim().toLowerCase();
  const matches = (c: Channel) =>
    !f ||
    c.name.toLowerCase().includes(f) ||
    (c.description ?? "").toLowerCase().includes(f);

  const visible = {
    channels: buckets.channels.filter(matches),
    directs: buckets.directs.filter(matches),
    groups: buckets.groups.filter(matches),
  };

  return (
    <aside className="flex h-full flex-col border-r border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <h3 className="text-[14px] font-bold text-secondary-500">
          {t("conversations")}
        </h3>
        <button
          type="button"
          aria-label={t("newChannel")}
          onClick={() => setDialogMode("channel")}
          className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100"
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
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      <div className="border-b border-neutral-100 px-3 py-2.5">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filterPlaceholder")}
          className="input h-8 w-full text-[12px]"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section
          label={t("sectionChannels")}
          count={buckets.channels.length}
          onAdd={() => setDialogMode("channel")}
          emptyHint={!f && buckets.channels.length === 0 ? t("emptyChannels") : null}
          onEmptyClick={() => setDialogMode("channel")}
        >
          {visible.channels.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              selected={c.id === selectedId}
              onSelect={onSelect}
              locale={locale}
              prefix={c.is_private ? "🔒" : "#"}
            />
          ))}
        </Section>
        <Section
          label={t("sectionDirects")}
          count={buckets.directs.length}
          onAdd={() => setDialogMode("direct")}
          emptyHint={!f && buckets.directs.length === 0 ? t("emptyDirects") : null}
          onEmptyClick={() => setDialogMode("direct")}
        >
          {visible.directs.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              selected={c.id === selectedId}
              onSelect={onSelect}
              locale={locale}
              avatar
              online={
                c.counterpart_id
                  ? onlineUserIds?.has(c.counterpart_id) ?? false
                  : false
              }
            />
          ))}
        </Section>
        <Section
          label={t("sectionGroups")}
          count={buckets.groups.length}
          onAdd={() => setDialogMode("group")}
          emptyHint={!f && buckets.groups.length === 0 ? t("emptyGroups") : null}
          onEmptyClick={() => setDialogMode("group")}
        >
          {visible.groups.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              selected={c.id === selectedId}
              onSelect={onSelect}
              locale={locale}
              avatar
            />
          ))}
        </Section>

        {f &&
          visible.channels.length +
            visible.directs.length +
            visible.groups.length ===
            0 && (
            <div className="px-4 py-8 text-center text-[12px] text-neutral-500">
              {t("emptyFilter")}
            </div>
          )}
      </div>

      <NewChannelDialog
        open={dialogMode != null}
        mode={dialogMode ?? "channel"}
        onClose={() => setDialogMode(null)}
      />
    </aside>
  );
}

function Section({
  label,
  count,
  emptyHint,
  onAdd,
  onEmptyClick,
  children,
}: {
  label: string;
  count: number;
  emptyHint?: string | null;
  onAdd?: () => void;
  onEmptyClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
        <span className="flex items-center gap-2">
          {label}
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 font-bold text-neutral-600">
            {count}
          </span>
        </span>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`+ ${label}`}
            className="grid h-5 w-5 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            +
          </button>
        )}
      </div>
      <ul>{children}</ul>
      {emptyHint && count === 0 && (
        <button
          type="button"
          onClick={onEmptyClick}
          className="mx-4 my-1 block w-[calc(100%-2rem)] rounded-md border border-dashed border-neutral-200 px-3 py-2 text-left text-[11px] italic text-neutral-400 transition hover:border-primary-300 hover:text-primary-600"
        >
          {emptyHint}
        </button>
      )}
    </section>
  );
}

function ChannelRow({
  channel,
  selected,
  onSelect,
  locale,
  prefix,
  avatar,
  online,
}: {
  channel: Channel;
  selected: boolean;
  onSelect?: (id: string) => void;
  locale: keyof typeof localeMap;
  prefix?: string;
  avatar?: boolean;
  online?: boolean;
}) {
  const display = channel.name.replace(/^#/, "");
  const unread = channel.unread_count ?? 0;
  const last = channel.last_message;
  return (
    <li>
      <Link
        href={`${routes.chat}/${channel.id}` as Route}
        onClick={() => onSelect?.(channel.id)}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex items-start gap-3 px-4 py-2 transition hover:bg-neutral-50",
          selected && "bg-tertiary-200/60",
        )}
      >
        {avatar ? (
          <span className="relative">
            <span
              className={cn(
                "grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                "bg-secondary-100 text-secondary-700",
              )}
            >
              {initials(display)}
            </span>
            {online != null && (
              <span
                aria-hidden
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                  online ? "bg-success-500" : "bg-neutral-300",
                )}
              />
            )}
          </span>
        ) : (
          <span
            className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-md text-[14px] font-semibold",
              channel.is_private
                ? "bg-warning-50 text-warning-700"
                : "bg-primary-50 text-primary-700",
            )}
          >
            {prefix ?? "#"}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-[13px]",
                unread > 0
                  ? "font-bold text-neutral-900"
                  : "font-medium text-neutral-800",
              )}
            >
              {display}
            </span>
            {last && (
              <span className="text-[10px] text-neutral-400">
                {fmtRelative(last.created_at, locale)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-[11px] text-neutral-500">
              {last?.body ?? channel.description ?? ""}
            </span>
            {unread > 0 && (
              <span className="ml-auto grid h-4 min-w-[18px] flex-shrink-0 place-items-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

function initials(s: string): string {
  return s
    .split(/[ \-_]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtRelative(iso: string, locale: keyof typeof localeMap): string {
  const d = new Date(iso);
  const lo = localeMap[locale];
  if (isToday(d)) return format(d, "HH:mm", { locale: lo });
  if (isYesterday(d))
    return locale === "de" ? "gestern" : locale === "ta" ? "நேற்று" : "yest";
  return format(d, "d. MMM", { locale: lo });
}
