"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import type { ChatAttachment, Message, ReactionAggregate } from "@/types/chat";
import { cn } from "@/lib/utils/cn";
import { useSignedUrl } from "@/hooks/chat/useSignedUrl";
import { toggleChatReactionAction } from "@/app/actions/chat-reactions";

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

const QUICK_REACTIONS = ["👍", "❤️", "🙏", "👀", "🎉", "✅"];

const ROLE_STYLE: Record<string, { label: string; cls: string }> = {
  admin: { label: "Geschäftsleitung", cls: "bg-secondary-50 text-secondary-700" },
  dispatcher: { label: "Teamleitung", cls: "bg-primary-50 text-primary-700" },
  employee: { label: "Field", cls: "bg-neutral-100 text-neutral-700" },
};

type Props = {
  message: Message & {
    sender_role?: string | null;
    sender_role_label?: string | null;
  };
  isOwn: boolean;
  showHeader: boolean;
  reactions?: ReactionAggregate[];
};

/**
 * One row in the conversation. Groups consecutive messages from the same
 * author by hiding the header on follow-up bubbles (showHeader=false).
 *
 * Attachments are rendered inline with lazily-signed URLs from the
 * `chat-attachments` bucket. Images preview directly; audio gets a
 * native control; everything else falls back to a download link.
 */
export function MessageBubble({
  message,
  isOwn,
  showHeader,
  reactions,
}: Props) {
  const locale = useLocale() as keyof typeof localeMap;
  const time = format(new Date(message.created_at), "HH:mm", {
    locale: localeMap[locale],
  });
  const [pending, start] = useTransition();
  const [showPicker, setShowPicker] = useState(false);

  function react(emoji: string) {
    setShowPicker(false);
    start(async () => {
      const r = await toggleChatReactionAction({
        message_id: message.id,
        emoji,
      });
      if (!r.ok) toast.error(r.error);
    });
  }

  const role = message.sender_role
    ? (ROLE_STYLE[message.sender_role] ?? null)
    : null;
  const roleLabel = message.sender_role_label ?? role?.label;
  const senderName = message.sender?.full_name ?? "—";
  const initials = senderName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const attachments = message.attachments ?? [];
  const hasBody = !!message.body && message.body.length > 0;

  return (
    <div
      className={cn(
        "flex gap-3",
        isOwn ? "flex-row-reverse" : "flex-row",
        !showHeader && "mt-1",
      )}
    >
      <span
        className={cn(
          "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold",
          showHeader
            ? isOwn
              ? "bg-primary-500 text-white"
              : "bg-secondary-100 text-secondary-700"
            : "invisible",
        )}
        aria-hidden={!showHeader}
      >
        {initials || "?"}
      </span>

      <div className={cn("flex max-w-[78%] flex-col gap-1.5", isOwn && "items-end")}>
        {showHeader && (
          <div
            className={cn(
              "flex items-baseline gap-2 text-[12px]",
              isOwn ? "flex-row-reverse" : "flex-row",
            )}
          >
            <span className="font-semibold text-neutral-800">{senderName}</span>
            {roleLabel && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]",
                  role?.cls ?? "bg-neutral-100 text-neutral-700",
                )}
              >
                {roleLabel}
              </span>
            )}
            <span className="text-neutral-400">{time}</span>
          </div>
        )}

        {hasBody && (
          <div
            className={cn(
              "whitespace-pre-wrap rounded-lg px-3.5 py-2 text-[13px] leading-[1.5]",
              isOwn
                ? "rounded-tr-[2px] bg-primary-500 text-white"
                : "rounded-tl-[2px] bg-neutral-100 text-neutral-800",
            )}
          >
            {message.body}
          </div>
        )}

        {attachments.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap gap-1.5",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            {attachments.map((a, i) => (
              <AttachmentView key={`${a.path}-${i}`} attachment={a} isOwn={isOwn} />
            ))}
          </div>
        )}

        {/* Reactions strip + add-reaction picker */}
        {(reactions && reactions.length > 0) || showPicker ? (
          <div
            className={cn(
              "flex flex-wrap gap-1",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            {(reactions ?? []).map((r) => (
              <button
                key={r.emoji}
                type="button"
                disabled={pending}
                onClick={() => react(r.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition",
                  r.reacted_by_me
                    ? "border-primary-300 bg-primary-50 text-primary-700"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                )}
              >
                <span>{r.emoji}</span>
                <span className="font-mono text-[10px]">{r.count}</span>
              </button>
            ))}
            {showPicker && (
              <div
                className={cn(
                  "flex gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 shadow-sm",
                )}
              >
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    disabled={pending}
                    onClick={() => react(e)}
                    className="text-[14px] leading-none transition hover:scale-110"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Hover action: add reaction */}
        <div
          className={cn(
            "flex",
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          <button
            type="button"
            onClick={() => setShowPicker((s) => !s)}
            aria-label="Add reaction"
            className="rounded px-1.5 py-0.5 text-[11px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            {showPicker ? "✕" : "+ 😊"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentView({
  attachment,
  isOwn,
}: {
  attachment: ChatAttachment;
  isOwn: boolean;
}) {
  const url = useSignedUrl("chat-attachments", attachment.path);

  if (attachment.kind === "image") {
    return (
      <a
        href={url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          "block max-h-[260px] max-w-[240px] overflow-hidden rounded-lg border",
          isOwn ? "border-primary-300" : "border-neutral-200",
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.name}
            className="block h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-32 w-32 place-items-center bg-neutral-100 text-[11px] text-neutral-500">
            …
          </div>
        )}
      </a>
    );
  }

  if (attachment.kind === "audio") {
    return (
      <div
        className={cn(
          "rounded-lg border px-2 py-1.5",
          isOwn
            ? "border-primary-300 bg-primary-50"
            : "border-neutral-200 bg-white",
        )}
      >
        {url ? (
          <audio src={url} controls preload="metadata" className="h-8" />
        ) : (
          <div className="text-[11px] text-neutral-500">…</div>
        )}
      </div>
    );
  }

  // Generic file fallback.
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition",
        isOwn
          ? "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100"
          : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50",
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 flex-shrink-0"
      >
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <span className="max-w-[200px] truncate">{attachment.name}</span>
      <span className="ml-1 text-[10px] text-neutral-500">
        {formatBytes(attachment.size)}
      </span>
    </a>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
