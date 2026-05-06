"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routes } from "@/lib/constants/routes";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function markNotificationReadAction(
  id: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("notifications") as any))
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.notifications);
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("notifications") as any))
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.notifications);
  return { ok: true };
}
