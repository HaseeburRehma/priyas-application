"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Subscribe to training-assignment + progress changes for the current
 * user and `router.refresh()` when anything relevant moves. The
 * /training page itself stays a server component (so the data load is
 * authoritative); this hook is purely a "kick the page to refetch"
 * primitive.
 *
 * What we subscribe to:
 *   • `training_assignments` — INSERT/DELETE/UPDATE for the current
 *     employee, so a freshly-assigned module pops in within ~1s.
 *   • `training_modules` — UPDATE so module title/locale changes from
 *     a manager's edit propagate without reload (rare but cheap).
 *   • `employee_training_progress` — UPDATE so the manager view
 *     reflects completions as they land.
 *
 * Channel scoping: we listen org-wide on `training_modules` /
 * `employee_training_progress` (RLS already filters at the DB level so
 * we only get rows we can read), and to a per-employee filter on
 * `training_assignments` for the field-staff case. Managers also get
 * the unfiltered stream so they see assignments fanning out to others.
 */
export function useTrainingRealtime(opts: {
  myEmployeeId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(
      `training-realtime-${opts.myEmployeeId ?? "anon"}-${opts.canManage ? "m" : "e"}`,
    );

    // Filter assignment changes to *this* employee unless the user is
    // a manager (managers want the full picture).
    const assignmentFilter = opts.canManage
      ? undefined
      : opts.myEmployeeId
        ? `employee_id=eq.${opts.myEmployeeId}`
        : undefined;

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "training_assignments",
        ...(assignmentFilter ? { filter: assignmentFilter } : {}),
      },
      () => router.refresh(),
    );

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "training_modules" },
      () => router.refresh(),
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "employee_training_progress" },
      () => router.refresh(),
    );

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [opts.myEmployeeId, opts.canManage, router]);
}
