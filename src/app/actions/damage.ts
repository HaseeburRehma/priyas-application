"use server";

import { revalidatePath } from "next/cache";
import {
  createDamageReportSchema,
  resolveDamageReportSchema,
} from "@/lib/validators/damage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function audit(action: string, recordId: string, message: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user.id,
    action,
    table_name: "damage_reports",
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

export async function createDamageReportAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("damage.create");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = createDamageReportSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // Best-effort: link to the requesting user's employee row if available.
  let employeeId = input.employee_id ?? null;
  if (!employeeId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emp } = await ((supabase.from("employees") as any))
      .select("id")
      .eq("profile_id", user?.id ?? "")
      .maybeSingle();
    employeeId = (emp as { id: string } | null)?.id ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("damage_reports") as any))
    .insert({
      org_id: orgId,
      property_id: input.property_id,
      shift_id: input.shift_id ?? null,
      employee_id: employeeId,
      severity: input.severity,
      category: input.category,
      description: input.description,
      photo_paths: input.photo_paths ?? [],
      resolved: false,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const newId = (data as { id: string }).id;
  await audit(
    "create",
    newId,
    `Schadensmeldung (${input.category}, S${input.severity}) erfasst.`,
  );
  revalidatePath(routes.property(input.property_id));
  return { ok: true, data: { id: newId } };
}

/**
 * Post a structured "discuss this damage report" card into the property's
 * auto-created chat channel. Returns the channel id so the UI can deep-link.
 */
export async function discussDamageReportAction(
  reportId: string,
): Promise<ActionResult<{ channel_id: string }>> {
  try {
    await requirePermission("damage.read");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

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

  // Load the report + property name in one shot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rowRaw } = await ((supabase.from("damage_reports") as any))
    .select(
      "id, severity, category, description, photo_paths, created_at, property:properties ( id, name )",
    )
    .eq("id", reportId)
    .maybeSingle();
  type Row = {
    id: string;
    severity: number;
    category: string;
    description: string;
    photo_paths: string[];
    created_at: string;
    property: { id: string; name: string } | null;
  };
  const row = rowRaw as Row | null;
  if (!row || !row.property) {
    return { ok: false, error: "Report not found" };
  }

  // Find the property's auto-channel (#prop-<name truncated to 60 chars>).
  const channelName = "#prop-" + row.property.name.slice(0, 60);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: channelRaw } = await ((supabase.from("chat_channels") as any))
    .select("id")
    .eq("org_id", orgId)
    .eq("name", channelName)
    .maybeSingle();
  let channelId = (channelRaw as { id: string } | null)?.id;

  // Fall back: if for some reason the channel doesn't exist (e.g. a
  // pre-trigger property), create it on the fly.
  if (!channelId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newCh, error: chErr } = await ((supabase.from("chat_channels") as any))
      .insert({
        org_id: orgId,
        name: channelName,
        is_direct: false,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (chErr || !newCh) {
      return { ok: false, error: chErr?.message ?? "Channel create failed" };
    }
    channelId = (newCh as { id: string }).id;
  }

  // Post the structured card. We render a markdown-ish summary in the
  // body so it stays readable even on clients that don't render the
  // structured attachment payload (mobile, plaintext exports).
  const summary =
    `🔧 Schaden gemeldet — ${row.category.toUpperCase()} · S${row.severity}\n` +
    `${row.description}\n` +
    `Objekt: ${row.property.name}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: msgErr } = await ((supabase.from("chat_messages") as any)).insert({
    org_id: orgId,
    channel_id: channelId,
    user_id: user.id,
    body: summary,
    attachments: [
      {
        kind: "damage_card",
        report_id: row.id,
        property_id: row.property.id,
        property_name: row.property.name,
        category: row.category,
        severity: row.severity,
        description: row.description,
        photo_paths: row.photo_paths,
        created_at: row.created_at,
      },
    ],
  });
  if (msgErr) return { ok: false, error: msgErr.message };

  return { ok: true, data: { channel_id: channelId } };
}

export async function resolveDamageReportAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("damage.resolve");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = resolveDamageReportSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  // We need the property_id to revalidate the right path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await ((supabase.from("damage_reports") as any))
    .select("property_id")
    .eq("id", input.id)
    .maybeSingle();
  const propertyId = (row as { property_id: string } | null)?.property_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("damage_reports") as any))
    .update({
      resolved: input.resolved,
      resolved_at: input.resolved ? new Date().toISOString() : null,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await audit(
    input.resolved ? "resolve" : "reopen",
    input.id,
    input.resolved ? "Schaden als erledigt markiert." : "Schaden erneut geöffnet.",
  );
  if (propertyId) revalidatePath(routes.property(propertyId));
  return { ok: true, data: { id: input.id } };
}
