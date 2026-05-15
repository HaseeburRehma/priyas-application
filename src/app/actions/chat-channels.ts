"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Returns true if the signed-in user is a member of the channel. The
 * permissions matrix in src/lib/rbac/permissions.ts has no chat-specific
 * entries (chat is open to everyone in the org), so for per-channel
 * actions we gate on actual membership.
 */
async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("chat_members") as any))
    .select("user_id")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Returns the channel row visible to the caller (RLS applies) and the
 * caller's role + org.
 */
async function loadChannelContext(channelId: string): Promise<
  | {
      ok: true;
      userId: string;
      role: "admin" | "dispatcher" | "employee";
      orgId: string;
      channel: { id: string; org_id: string; created_by: string | null };
    }
  | { ok: false; error: string }
> {
  const ctx = await getCurrentRole();
  if (!ctx.userId) return { ok: false, error: "Not signed in" };
  if (!ctx.orgId || !ctx.role) {
    return { ok: false, error: "Profile not attached to org" };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("chat_channels") as any))
    .select("id, org_id, created_by")
    .eq("id", channelId)
    .maybeSingle();
  const channel = data as
    | { id: string; org_id: string; created_by: string | null }
    | null;
  if (!channel) return { ok: false, error: "Channel not found" };
  if (channel.org_id !== ctx.orgId) {
    return { ok: false, error: "Forbidden" };
  }
  return {
    ok: true,
    userId: ctx.userId,
    role: ctx.role,
    orgId: ctx.orgId,
    channel,
  };
}

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
  // SECURITY: gate on a signed-in profile attached to an org. The chat
  // matrix has no role-level restrictions on channel creation, but we
  // still need org context to set the row's org_id correctly.
  const ctx = await getCurrentRole();
  if (!ctx.userId) return { ok: false, error: "Not signed in" };
  if (!ctx.orgId || !ctx.role) {
    return { ok: false, error: "Profile not attached to org" };
  }
  const user = { id: ctx.userId };
  const orgId = ctx.orgId;
  const supabase = await createSupabaseServerClient();

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
  // SECURITY: signed-in + org-attached gate. Without the auth/org check
  // an anonymous request could still trigger the DB call (where it
  // would fail under RLS, but with a less helpful error).
  const ctx = await getCurrentRole();
  if (!ctx.userId) return { ok: false, error: "Not signed in" };
  if (!ctx.orgId) {
    return { ok: false, error: "Profile not attached to org" };
  }
  if (ctx.userId === targetProfileId) {
    return { ok: false, error: "Cannot DM yourself" };
  }
  const user = { id: ctx.userId };
  const orgId = ctx.orgId;
  const supabase = await createSupabaseServerClient();

  // Cross-org DM attempts are blocked by checking the target's org_id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetProfile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", targetProfileId)
    .maybeSingle();
  const targetOrg = (targetProfile as { org_id: string | null } | null)?.org_id;
  if (!targetOrg || targetOrg !== orgId) {
    return { ok: false, error: "Forbidden" };
  }

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
  // SECURITY: signed-in + org-attached gate.
  const ctx = await getCurrentRole();
  if (!ctx.userId) return { ok: false, error: "Not signed in" };
  if (!ctx.orgId) {
    return { ok: false, error: "Profile not attached to org" };
  }
  const user = { id: ctx.userId };
  const orgId = ctx.orgId;
  const supabase = await createSupabaseServerClient();

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
  // SECURITY: only existing channel members, the owner, or org
  // admins/dispatchers can add new members.
  const loaded = await loadChannelContext(channel_id);
  if (!loaded.ok) return loaded;
  const { userId, role, orgId, channel } = loaded;
  const isOwner = channel.created_by === userId;
  const isManager = role === "admin" || role === "dispatcher";
  const isMember = await isChannelMember(channel_id, userId);
  if (!isOwner && !isManager && !isMember) {
    return { ok: false, error: "Forbidden" };
  }

  // All target users must belong to the same org.
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targets } = await ((supabase.from("profiles") as any))
    .select("id, org_id")
    .in("id", user_ids);
  const rows = (targets ?? []) as Array<{ id: string; org_id: string }>;
  if (rows.length !== user_ids.length) {
    return { ok: false, error: "Unknown member(s)" };
  }
  if (rows.some((r) => r.org_id !== orgId)) {
    return { ok: false, error: "Forbidden" };
  }

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
  // SECURITY: removing other members must be limited to the channel
  // owner, admins or dispatchers. Members may always remove themselves.
  const loaded = await loadChannelContext(channel_id);
  if (!loaded.ok) return loaded;
  const { userId, role, channel } = loaded;
  const isSelf = user_id === userId;
  const isOwner = channel.created_by === userId;
  const isManager = role === "admin" || role === "dispatcher";
  if (!isSelf && !isOwner && !isManager) {
    return { ok: false, error: "Forbidden" };
  }

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
  // SECURITY: pin/unpin is limited to the channel owner OR an
  // admin/dispatcher. Regular members can read pins but not toggle them.
  const loaded = await loadChannelContext(channel_id);
  if (!loaded.ok) return loaded;
  const { userId, role, channel } = loaded;
  const isOwner = channel.created_by === userId;
  const isManager = role === "admin" || role === "dispatcher";
  if (!isOwner && !isManager) {
    return { ok: false, error: "Forbidden" };
  }
  const user = { id: userId };
  const supabase = await createSupabaseServerClient();

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
