import { NextResponse } from "next/server";

/** Liveness probe — used by Vercel + uptime checks. No DB calls. */
export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
