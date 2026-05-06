"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/* ============================================================================
 * Create channel — public or private named channel.
 * ========================================================================== */

const createChannelSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional().or(z.literal("")),
  is_private: z.boolean().default(false),
  member_ids: z.array(z.string().uuid()).default([]),
});

export async function createChannelAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createChannelSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  const cleanName = input.name.replace(/^#/, "").trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("chat_channels") as any))
    .insert({
      org_id: orgId,
      name: `#${cleanName}`,
      description: input.description || null,
      kind: "channel",
      is_direct: false,
      is_private: input.is_private,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const channelId = (data as { id: string }).id;

  // Always add the creator as a member.
  const memberRows = Array.from(
    new Set([user.id, ...input.member_ids]),
  ).map((uid) => ({
    channel_id: channelId,
    user_id: uid,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("chat_members") as any)).upsert(memberRows, {
    onConflict: "channel_id,user_id",
  });

  revalidatePath(routes.chat);
  return { ok: true, data: { id: channelId } };
}

/* ============================================================================
 * Start (or reuse) a direct-message channel between current user and target.
 * ========================================================================== */

export async function startDirectMessageAction(
  targetProfileId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!targetProfileId) return { ok: false, error: "Missing target" };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.id === targetProfileId) {
    return { ok: false, error: "Cannot DM yourself" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // Check whether an existing 1:1 channel already exists between these two.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await ((supabase.from("chat_channels") as any))
    .select("id, members:chat_members ( user_id )")
    .eq("org_id", orgId)
    .eq("is_direct", true);

  type Row = { id: string; members: Array<{ user_id: string }> };
  for (const row of (existing ?? []) as unknown as Row[]) {
    const ids = new Set(row.members.map((m) => m.user_id));
    if (
      ids.size === 2 &&
      ids.has(user.id) &&
      ids.has(targetProfileId)
    ) {
      return { ok: true, data: { id: row.id } };
    }
  }

  // Resolve a friendly name (concatenated full names).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nameRows } = await ((supabase.from("profiles") as any))
    .select("id, full_name")
    .in("id", [user.id, targetProfileId]);
  type Name = { id: string; full_name: string };
  const names = (nameRows ?? []) as Name[];
  const left = names.find((n) => n.id === user.id)?.full_name ?? "Me";
  const right =
    names.find((n) => n.id === targetProfileId)?.full_name ?? "Teammate";
  const dmName = `${left} ↔ ${right}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await ((supabase.from("chat_channels") as any))
    .insert({
      org_id: orgId,
      name: dmName,
      kind: "direct",
      is_direct: true,
      is_private: true,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const channelId = (created as { id: string }).id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("chat_members") as any)).upsert(
    [
      { channel_id: channelId, user_id: user.id },
      { channel_id: channelId, user_id: targetProfileId },
    ],
    { onConflict: "channel_id,user_id" },
  );

  revalidatePath(routes.chat);
  return { ok: true, data: { id: channelId } };
}

/* ============================================================================
 * Create a small group channel.
 * ========================================================================== */

const createGroupSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional().or(z.literal("")),
  member_ids: z.array(z.string().uuid()).min(1),
});

export async function createGroupAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createGroupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("chat_channels") as any))
    .insert({
      org_id: orgId,
      name: input.name.trim(),
      description: input.description || null,
      kind: "group",
      is_direct: false,
      is_private: true,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const channelId = (data as { id: string }).id;
  const memberRows = Array.from(
    new Set([user.id, ...input.member_ids]),
  ).map((uid) => ({ channel_id: channelId, user_id: uid }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("chat_members") as any)).upsert(memberRows, {
    onConflict: "channel_id,user_id",
  });

  revalidatePath(routes.chat);
  return { ok: true, data: { id: channelId } };
}

/* ============================================================================
 * Add (or remove) members on an existing channel.
 * ========================================================================== */

export async function addChannelMemberAction(
  channel_id: string,
  user_ids: string[],
): Promise<ActionResult<{ added: number }>> {
  if (!channel_id || user_ids.length === 0) {
    return { ok: false, error: "Missing channel or members" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("chat_members") as any)).upsert(
    user_ids.map((uid) => ({ channel_id, user_id: uid })),
    { onConflict: "channel_id,user_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.chat);
  return { ok: true, data: { added: user_ids.length } };
}

export async function removeChannelMemberAction(
  channel_id: string,
  user_id: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("chat_members") as any))
    .delete()
    .eq("channel_id", channel_id)
    .eq("user_id", user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.chat);
  return { ok: true, data: undefined };
}

/* ============================================================================
 * Pin / unpin a message.
 * ========================================================================== */

export async function togglePinMessageAction(
  channel_id: string,
  message_id: string,
): Promise<ActionResult<{ pinned: boolean }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await ((supabase.from("chat_pinned_messages") as any))
    .select("message_id")
    .eq("channel_id", channel_id)
    .eq("message_id", message_id)
    .maybeSingle();

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("chat_pinned_messages") as any))
      .delete()
      .eq("channel_id", channel_id)
      .eq("message_id", message_id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.chat);
    return { ok: true, data: { pinned: false } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("chat_pinned_messages") as any)).insert({
    channel_id,
    message_id,
    pinned_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.chat);
  return { ok: true, data: { pinned: true } };
}
