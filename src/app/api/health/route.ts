import { NextResponse } from "next/server";

/**
 * Liveness probe — used by Vercel + uptime checks. No DB calls.
 *
 * Also returns the git commit SHA + short deploy metadata so we can
 * verify which commit is actually serving traffic without needing a
 * Vercel dashboard trip (handy during deploy debugging).
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    env: process.env.VERCEL_ENV ?? "local",
  });
}
