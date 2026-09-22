"use client";

/**
 * Feature-update #6 · Inline-editable notes on the client overview.
 *
 * Replaces the previous read-only NotesCard that had a disabled "Add
 * note" button. Now:
 *   * Body text is always visible.
 *   * "Bearbeiten" toggles a textarea + Save/Cancel row.
 *   * Save calls updateClientNotesAction — the server stamps
 *     notes_updated_at + notes_updated_by on the client row.
 *   * router.refresh() after a successful save so the surrounding
 *     server components (ClientDetail, DocumentsCard, list view) see
 *     the new note without a full page reload.
 *
 * Meta line under the note ("Zuletzt aktualisiert am …") uses the
 * notes_updated_at value from loadClientDetail — reflects the actual
 * DB stamp, not the last time the browser rendered.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateClientNotesAction } from "@/app/actions/clients";
import { cn } from "@/lib/utils/cn";

type Props = {
  clientId: string;
  initialNotes: string | null;
  updatedAt: string | null;
  canUpdate: boolean;
};

export function EditableNotesCard({
  clientId,
  initialNotes,
  updatedAt,
  canUpdate,
}: Props) {
  const t = useTranslations("clients.detail");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [displayedNotes, setDisplayedNotes] = useState(initialNotes ?? "");
  const [stampedAt, setStampedAt] = useState<string | null>(updatedAt);

  function save() {
    start(async () => {
      const res = await updateClientNotesAction(clientId, notes);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Local optimistic-ish refresh so the panel updates immediately
      // even if router.refresh has a slight delay.
      setDisplayedNotes(notes.trim());
      if (res.data.notes_updated_at) {
        setStampedAt(res.data.notes_updated_at);
      }
      setEditing(false);
      toast.success("Notiz gespeichert");
      router.refresh();
    });
  }

  function cancel() {
    setNotes(displayedNotes);
    setEditing(false);
  }

  return (
    <section className="mt-5 rounded-lg border border-warning-50 bg-warning-50/40">
      <header className="flex items-center justify-between border-b border-warning-50 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-warning-700">
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
              <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01" />
            </svg>
            {t("notesTitle")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("notesSubtitle")}
          </div>
          {stampedAt && !editing && (
            <div className="mt-1 text-[11px] text-neutral-500">
              Zuletzt aktualisiert am{" "}
              {new Date(stampedAt).toLocaleString("de-DE", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </div>
          )}
        </div>
        {canUpdate && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-warning-200 bg-white px-3 py-1.5",
              "text-[12px] font-medium text-warning-700 shadow-xs transition hover:bg-warning-50",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Bearbeiten
          </button>
        )}
      </header>
      <div className="p-5 text-[13px] leading-[1.55] text-neutral-700">
        {editing ? (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interne Notizen — nur Team sichtbar"
              rows={4}
              className="input min-h-[110px] w-full"
              disabled={pending}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-md bg-warning-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-xs transition hover:bg-warning-600 disabled:opacity-60"
              >
                {pending ? "Speichern…" : "Speichern"}
              </button>
            </div>
          </div>
        ) : displayedNotes ? (
          <p className="whitespace-pre-wrap">{displayedNotes}</p>
        ) : (
          <em className="text-neutral-500">{t("notesEmpty")}</em>
        )}
      </div>
    </section>
  );
}
