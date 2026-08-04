import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Per-client document loader. Backs the Documents section on
 * `/clients/[id]` and is org-scoped by RLS. Only lists live docs;
 * soft-deleted rows are hidden from the UI but retained for audit.
 */

export type ClientDocumentCategory =
  | "contract"
  | "form"
  | "decision"
  | "id_card"
  | "invoice"
  | "photo"
  | "other";

export type ClientDocument = {
  id: string;
  name: string;
  category: ClientDocumentCategory;
  notes: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
};

export async function loadClientDocuments(
  clientId: string,
): Promise<ClientDocument[]> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("client_documents") as any))
    .select(
      "id, name, category, notes, storage_path, mime_type, size_bytes, uploaded_at, uploaded_by",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(200);
  return (data ?? []) as ClientDocument[];
}
