import { NextResponse } from "next/server";
import { loadClientDetail } from "@/lib/api/clients";
import { v1Guard, v1ItemResponse, v1ErrorResponse } from "@/lib/api/v1-respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients/{id} — single client detail.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const guard = await v1Guard(request, "read:clients");
  if (guard instanceof NextResponse) return guard;

  try {
    const { id } = await Promise.resolve(context.params);
    const detail = await loadClientDetail(id);
    if (!detail) return v1ErrorResponse(404, "client_not_found");
    return v1ItemResponse(detail);
  } catch (err) {
    return v1ErrorResponse(
      500,
      err instanceof Error ? err.message : "load_client_failed",
    );
  }
}
