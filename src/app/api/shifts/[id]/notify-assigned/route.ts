import { NextResponse } from "next/server";
import { createPushServiceClient } from "@/lib/push/service-client";
import { notifyShiftAssigned } from "@/lib/notifications/shift-assigned";

/**
 * Announce a freshly planned shift to its assignee.
 *
 *   POST /api/shifts/:id/notify-assigned
 *   Authorization: Bearer <Supabase access token>
 *
 * The mobile app plans shifts by writing to Supabase directly, so the
 * server never sees those inserts. Right after a successful insert the
 * app calls this route. Only an admin/dispatcher of the shift's org may
 * call it, and a given shift is announced to its employee at most once,
 * so retries can't spam anyone.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "invalid shift id" }, { status: 400 });
  }
  const admin = createPushServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const {
    data: { user },
  } = await admin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: me } = await admin
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  const caller = me as { org_id: string; role: string } | null;
  if (!caller || !["admin", "dispatcher"].includes(caller.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: shiftRow } = await admin
    .from("shifts")
    .select("id, org_id, employee:employees ( profile_id )")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle();
  const shift = shiftRow as unknown as {
    id: string;
    org_id: string;
    employee: { profile_id: string | null } | null;
  } | null;
  if (!shift || shift.org_id !== caller.org_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const profileId = shift.employee?.profile_id;
  if (!profileId) return NextResponse.json({ notified: false });

  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", profileId)
    .eq("category", "shift_assigned")
    .eq("link_url", `/schedule?shift=${shift.id}`)
    .limit(1);
  if ((existing ?? []).length > 0) {
    return NextResponse.json({ notified: false, reason: "already notified" });
  }

  await notifyShiftAssigned([shift.id], { actorId: user.id, client: admin });
  return NextResponse.json({ notified: true });
}
