"use client";

import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { useSignedUrl } from "@/hooks/chat/useSignedUrl";
import type { Channel, ChatAttachment } from "@/types/chat";

export type Member = {
  id: string;
  full_name: string;
  role: string | null;
  /** Optional role label for display (Pflege, Reinigung, …). */
  role_label?: string | null;
  online?: boolean;
};

export type PinnedMessage = {
  id: string;
  body: string;
  pinned_by_name: string | null;
  pinned_at: string;
};

type Props = {
  channel: Channel;
  members: Member[];
  pinned: PinnedMessage[];
  /** Files extracted from message attachments — image/audio/file. */
  files: ChatAttachment[];
  onClose?: () => void;
};

/**
 * Right-hand info panel for the active channel: description, members
 * with presence dots, pinned messages, and a list of shared files.
 */
export function ChannelInfoPanel({
  channel,
  members,
  pinned,
  files,
  onClose,
}: Props) {
  const t = useTranslations("chat.info");

  return (
    <aside className="flex h-full w-[280px] flex-col border-l border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <h3 className="text-[13px] font-semibold text-neutral-800">
          {t("title")}
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100"
          >
            ✕
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Description */}
        <Section label={t("description")}>
          <p className="text-[12px] leading-[1.5] text-neutral-700">
            {channel.description || (
              <span className="text-neutral-400">{t("noDescription")}</span>
            )}
          </p>
        </Section>

        {/* Members */}
        <Section label={t("members", { n: members.length })}>
          <ul className="flex flex-col gap-2.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="relative">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-50 text-[10px] font-bold text-primary-700">
                    {initials(m.full_name)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white",
                      m.online ? "bg-success-500" : "bg-neutral-300",
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-neutral-800">
                    {m.full_name}
                  </span>
                  {m.role_label && (
                    <span className="block truncate text-[10px] text-neutral-500">
                      {m.role_label}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-primary-700 hover:text-primary-600"
          >
            <span>+</span> {t("addMember")}
          </button>
        </Section>

        {/* Pinned */}
        {pinned.length > 0 && (
          <Section label={t("pinned", { n: pinned.length })}>
            <ul className="flex flex-col gap-2">
              {pinned.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-neutral-100 bg-neutral-50 p-2 text-[12px]"
                >
                  <div className="line-clamp-2 text-neutral-800">{p.body}</div>
                  <div className="mt-1 text-[10px] text-neutral-500">
                    📌 {p.pinned_by_name ?? "—"} · {format(new Date(p.pinned_at), "d. MMM yyyy")}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Files */}
        {files.length > 0 && (
          <Section label={t("files", { n: files.length })}>
            <ul className="flex flex-col gap-2">
              {files.slice(0, 8).map((f, i) => (
                <FileRow key={`${f.path}-${i}`} attachment={f} />
              ))}
              {files.length > 8 && (
                <li className="text-[11px] text-neutral-500">
                  +{files.length - 8}
                </li>
              )}
            </ul>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-neutral-100 px-4 py-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
        {label}
      </div>
      {children}
    </section>
  );
}

function FileRow({ attachment }: { attachment: ChatAttachment }) {
  const url = useSignedUrl("chat-attachments", attachment.path);
  const icon =
    attachment.kind === "image"
      ? "🖼"
      : attachment.kind === "audio"
        ? "🔊"
        : "📄";
  return (
    <li>
      <a
        href={url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center gap-2 rounded-md border border-neutral-100 bg-white px-2 py-1.5 text-[12px] text-neutral-700 hover:border-primary-300 hover:text-primary-700"
      >
        <span aria-hidden>{icon}</span>
        <span className="truncate">{attachment.name}</span>
      </a>
    </li>
  );
}

function initials(s: string): string {
  return s
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
