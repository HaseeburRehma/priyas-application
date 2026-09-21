/**
 * "My Files & Notes" widget for the PM dashboard (feature-update #19).
 *
 * Loader is per-user (RLS enforces `owner_id = auth.uid()` on both
 * pm_notes and pm_files) so a manager only ever sees their own
 * folder — this is a personal working area, not a shared org-wide
 * store. The dashboard page skips calling this loader for field
 * staff (RBAC gate on `time.read_all`), so we don't spend any
 * round-trips when the widget isn't shown.
 */

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PmNote = {
  id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type PmFile = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  pinned: boolean;
  created_at: string;
};

export type PmWidgetData = {
  notes: PmNote[];
  files: PmFile[];
};

const NOTES_CAP = 20;
const FILES_CAP = 20;

export async function loadPmWidget(): Promise<PmWidgetData> {
  const supabase = await createSupabaseServerClient();

  // Fire both reads in parallel; RLS returns only rows the caller owns.
  // Pinned rows first so the widget can render them in a fixed order.
  const [notesRes, filesRes] = await Promise.all([
    supabase
      .from("pm_notes")
      .select("id, title, body, pinned, created_at, updated_at")
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(NOTES_CAP),
    supabase
      .from("pm_files")
      .select("id, name, storage_path, mime_type, size_bytes, pinned, created_at")
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(FILES_CAP),
  ]);

  const notes = ((notesRes.data ?? []) as PmNote[]).map((n) => ({
    ...n,
    // Coerce nullable columns so consumers don't need defensive checks.
    title: n.title ?? null,
    body: n.body ?? "",
  }));
  const files = ((filesRes.data ?? []) as PmFile[]).map((f) => ({
    ...f,
    mime_type: f.mime_type ?? null,
    size_bytes: f.size_bytes ?? null,
  }));

  return { notes, files };
}
