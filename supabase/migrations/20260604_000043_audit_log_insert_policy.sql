-- Restore the audit trail
--
-- The foundation migration (000001) enables RLS on `audit_log` and adds
-- a SELECT policy for dispatchers/admins, but no INSERT policy. Default
-- RLS denies inserts. That means every `audit_log.insert(...)` call
-- across the application — there are ~12 of them, covering invoice
-- mark-paid, Lexware sync, role changes, photo uploads, training
-- progress, vacation approvals, monthly-report sends, etc — has been
-- silently dropped since launch. The compliance log is empty.
--
-- This adds the missing INSERT policy. The check is intentionally
-- permissive in two ways:
--
--   1. Any authenticated user can insert *for their own org*. The
--      `org_id = public.current_org_id()` predicate is the only
--      isolation we need — without it a user could spoof events
--      against another tenant. The `is_dispatcher_or_admin()` gate
--      from the SELECT policy is NOT applied here because audit
--      rows are emitted by every workflow, including ones that
--      regular employees run (clock in/out, complete training, etc).
--
--   2. We don't constrain `user_id` to match auth.uid(). The audit
--      table records "who acted" via `user_id`, but the *inserter*
--      is sometimes a system path (cron-driven Lexware sync writing
--      on behalf of a user) where matching auth.uid() would break.
--      The application code already populates `user_id` correctly;
--      RLS just needs to allow the insert to land.
--
-- UPDATE and DELETE policies are intentionally NOT added — the audit
-- log is append-only by design. Tampering attempts will fail with the
-- same default-deny that previously blocked legitimate inserts.

drop policy if exists "audit: members insert own org" on public.audit_log;
create policy "audit: members insert own org"
  on public.audit_log
  for insert
  with check (org_id = public.current_org_id());

comment on policy "audit: members insert own org" on public.audit_log is
  'Allow any authenticated org member to append audit rows for their own org. Append-only — no UPDATE/DELETE policy exists, so rows are immutable once written.';
