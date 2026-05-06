"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ChatAttachment } from "@/types/chat";

type Props = {
  channelId: string;
  orgId: string;
  onSend: (args: {
    body: string;
    attachments: ChatAttachment[];
  }) => Promise<void> | void;
  disabled?: boolean;
};

type PendingAttachment = ChatAttachment & {
  /** Local object URL for previewing before upload completes (image/audio). */
  previewUrl?: string;
};

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Multi-line composer with photo and voice attachments.
 * - Click 📎 to pick image / audio / generic files (multiple).
 * - Click 🎤 to record a voice memo via MediaRecorder.
 * - Files upload to the `chat-attachments` bucket directly from the browser.
 * - Once all uploads finish, Enter (or 📨) sends a message with the
 *   attachments JSON and the body in one round-trip.
 */
export function Composer({ channelId, orgId, onSend, disabled }: Props) {
  const t = useTranslations("chat.composer");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const supabase = createSupabaseBrowserClient();

  // Auto-grow
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 144) + "px";
  }, [value]);

  // Cleanup pending object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const a of pending) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function classifyKind(mime: string): "image" | "audio" | "file" {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    return "file";
  }

  async function uploadOne(file: File | Blob, name: string, mime: string): Promise<ChatAttachment | null> {
    if (file.size > MAX_BYTES) {
      toast.error(t("tooLarge"));
      return null;
    }
    const ext = name.split(".").pop()?.toLowerCase() || mime.split("/")[1] || "bin";
    const path = `${orgId}/${channelId}/${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("chat-attachments")
      .upload(path, file, { upsert: false, contentType: mime });
    if (error) {
      toast.error(error.message);
      return null;
    }
    return {
      kind: classifyKind(mime),
      path,
      name,
      mime,
      size: file.size,
    };
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploadCount((c) => c + list.length);
    try {
      for (const file of Array.from(list)) {
        const previewUrl =
          file.type.startsWith("image/") || file.type.startsWith("audio/")
            ? URL.createObjectURL(file)
            : undefined;
        const att = await uploadOne(file, file.name, file.type || "application/octet-stream");
        if (att) {
          setPending((arr) => [...arr, { ...att, previewUrl }]);
        } else if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      }
    } finally {
      setUploadCount((c) => Math.max(0, c - list.length));
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function startRecording() {
    if (recording) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast.error(t("recordUnsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        for (const track of stream.getTracks()) track.stop();
        setRecording(false);
        setUploadCount((c) => c + 1);
        try {
          const ext = mime.split("/")[1]?.split(";")[0] || "webm";
          const previewUrl = URL.createObjectURL(blob);
          const att = await uploadOne(blob, `voice-${Date.now()}.${ext}`, mime);
          if (att) {
            setPending((arr) => [...arr, { ...att, previewUrl }]);
          } else {
            URL.revokeObjectURL(previewUrl);
          }
        } finally {
          setUploadCount((c) => Math.max(0, c - 1));
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      toast.error(t("recordPermission"));
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
  }

  function removePending(idx: number) {
    setPending((arr) => {
      const p = arr[idx];
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return arr.filter((_, i) => i !== idx);
    });
  }

  async function send() {
    if (busy || uploadCount > 0) return;
    const v = value.trim();
    if (!v && pending.length === 0) return;
    setBusy(true);
    try {
      const atts: ChatAttachment[] = pending.map(
        ({ previewUrl, ...rest }) => {
          // strip the preview URL — it's not for persistence
          void previewUrl;
          return rest;
        },
      );
      await onSend({ body: v, attachments: atts });
      // Clean up local preview URLs.
      for (const a of pending) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      setValue("");
      setPending([]);
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const sendDisabled =
    disabled ||
    busy ||
    uploadCount > 0 ||
    (!value.trim() && pending.length === 0);

  return (
    <div
      className="border-t border-neutral-100 bg-white p-3"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
    >
      {/* Pending attachments preview */}
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((a, i) => (
            <PendingChip
              key={`${a.path}-${i}`}
              attachment={a}
              onRemove={() => removePending(i)}
            />
          ))}
        </div>
      )}
      {(uploadCount > 0 || recording) && (
        <div className="mb-2 text-[11px] text-neutral-500">
          {recording ? t("recording") : t("uploading", { n: uploadCount })}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5 focus-within:border-primary-500 focus-within:shadow-focus">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,audio/*,application/pdf"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          aria-label={t("attach")}
          title={t("attach")}
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy}
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50"
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
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <button
          type="button"
          aria-label={recording ? t("stopRecord") : t("record")}
          title={recording ? t("stopRecord") : t("record")}
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled || busy}
          className={cn(
            "grid h-8 w-8 flex-shrink-0 place-items-center rounded-md transition",
            recording
              ? "bg-error-500 text-white hover:bg-error-700"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800",
            (disabled || busy) && "opacity-50",
          )}
        >
          {recording ? (
            <span className="block h-2.5 w-2.5 rounded-sm bg-white" />
          ) : (
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
              <rect x={9} y={2} width={6} height={12} rx={3} />
              <path d="M19 10a7 7 0 01-14 0M12 19v3" />
            </svg>
          )}
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled || busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={t("placeholder")}
          className="flex-1 resize-none border-0 bg-transparent py-1.5 text-[13px] leading-[1.5] text-neutral-800 outline-none placeholder:text-neutral-400 disabled:opacity-60"
        />

        <button
          type="button"
          onClick={() => void send()}
          disabled={sendDisabled}
          aria-label={t("send")}
          className={cn(
            "grid h-8 w-8 flex-shrink-0 place-items-center rounded-md transition",
            !sendDisabled
              ? "bg-primary-500 text-white hover:bg-primary-600"
              : "bg-neutral-100 text-neutral-400",
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
            className="h-4 w-4"
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function PendingChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  if (attachment.kind === "image" && attachment.previewUrl) {
    return (
      <div className="relative h-16 w-16 overflow-hidden rounded-md border border-neutral-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.previewUrl}
          alt={attachment.name}
          className="h-full w-full object-cover"
        />
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }
  if (attachment.kind === "audio" && attachment.previewUrl) {
    return (
      <div className="relative flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1">
        <audio src={attachment.previewUrl} controls className="h-8" />
        <RemoveButton onRemove={onRemove} />
      </div>
    );
  }
  return (
    <div className="relative flex max-w-[220px] items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5">
      <span className="truncate text-[12px] text-neutral-700">
        {attachment.name}
      </span>
      <RemoveButton onRemove={onRemove} />
    </div>
  );
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label="Remove"
      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-error-500 text-[10px] font-bold text-white shadow"
    >
      ×
    </button>
  );
}
