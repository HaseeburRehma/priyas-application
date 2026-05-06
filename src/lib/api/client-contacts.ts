import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClientContact = {
  id: string;
  client_id: string;
  full_name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
};

export async function loadContactsForClient(
  clientId: string,
): Promise<ClientContact[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("client_contacts")
    .select("id, client_id, full_name, role, email, phone, is_primary, notes, created_at")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("full_name", { ascending: true });
  return ((data ?? []) as ClientContact[]).map((c) => ({
    ...c,
    is_primary: !!c.is_primary,
  }));
}
