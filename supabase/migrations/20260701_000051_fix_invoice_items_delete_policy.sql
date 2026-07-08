-- =============================================================================
-- Fix invoice_items delete policy to match invoice.update permission.
--
-- updateDraftInvoiceAction() (src/app/actions/invoice-draft.ts) replaces a
-- draft's line items via delete-all-then-insert-new, and is gated on the
-- app-level "invoice.update" permission (admin + dispatcher). But
-- invoice_items only had a generic "%I:delete admin" RLS policy applied to
-- it via the table-loop in 20260504_000002_domain.sql, restricting DELETE
-- to admins. For a dispatcher, the delete silently matched zero rows (RLS
-- filters rows out of an UPDATE/DELETE without raising an error), so the
-- old line items were never removed — only the new ones were inserted
-- alongside them, corrupting the invoice's line-item list.
-- =============================================================================

drop policy if exists "invoice_items:delete admin" on public.invoice_items;
drop policy if exists "invoice_items:delete dispatcher" on public.invoice_items;
create policy "invoice_items:delete dispatcher" on public.invoice_items for delete
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

