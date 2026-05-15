-- =============================================================================
-- Invoice system follow-ups
-- -----------------------------------------------------------------------------
-- 1) `recalc_alltagshilfe_budget` now accounts for *partial* payments:
--    paid_amount_cents counts toward `used`; the remainder of partially-paid
--    invoices is reflected in `reserved`. Previously a partly-paid invoice
--    showed as 100% reserved / 0% used, understating the actual draw against
--    the annual cap.
-- 2) Threshold flags (`alerted_80/90/100`) are now flipped inside the recalc
--    function when usage crosses each boundary. The trigger on invoices will
--    therefore set the flag on the very write that pushes a client past 80,
--    90, or 100 %. A separate worker can fan out the actual notification by
--    watching for rows where the flag was just set; the schema records the
--    state-change point either way.
-- =============================================================================

create or replace function public.recalc_alltagshilfe_budget(
  p_client_id uuid,
  p_year      integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id        uuid;
  v_used          bigint;
  v_reserved      bigint;
  v_budget        bigint;
  v_prev_pct      int;
  v_new_pct       int;
  v_alerted_80    boolean;
  v_alerted_90    boolean;
  v_alerted_100   boolean;
begin
  select org_id, coalesce(annual_budget_cents, 157500)
    into v_org_id, v_budget
    from public.clients
   where id = p_client_id;

  if v_org_id is null then return; end if;

  -- used     = sum of every cent actually paid on Alltagshilfe invoices for
  --            the year (paid in full → total; partial → paid_amount_cents)
  -- reserved = total - paid_amount_cents for invoices still open
  select
    coalesce(sum(
      case
        when status = 'paid' then total_cents
        else paid_amount_cents
      end
    ), 0),
    coalesce(sum(
      case
        when status in ('draft','sent','overdue')
          then greatest(0, total_cents - paid_amount_cents)
        else 0
      end
    ), 0)
    into v_used, v_reserved
    from public.invoices
   where client_id    = p_client_id
     and invoice_kind = 'alltagshilfe'
     and deleted_at is null
     and extract(year from issue_date) = p_year;

  -- Preserve any previously-fired flags (don't un-set on dip).
  select coalesce(alerted_80, false),
         coalesce(alerted_90, false),
         coalesce(alerted_100, false)
    into v_alerted_80, v_alerted_90, v_alerted_100
    from public.alltagshilfe_budgets
   where client_id = p_client_id and year = p_year;

  v_new_pct := case when v_budget > 0
                    then least(100, ((v_used + v_reserved) * 100) / v_budget)
                    else 0
               end;
  if v_new_pct >= 80  then v_alerted_80  := true; end if;
  if v_new_pct >= 90  then v_alerted_90  := true; end if;
  if v_new_pct >= 100 then v_alerted_100 := true; end if;

  insert into public.alltagshilfe_budgets
        (org_id, client_id, year, budget_cents,
         used_cents, reserved_cents,
         alerted_80, alerted_90, alerted_100)
       values (v_org_id, p_client_id, p_year, v_budget,
               v_used, v_reserved,
               v_alerted_80, v_alerted_90, v_alerted_100)
       on conflict (client_id, year) do update
       set used_cents     = excluded.used_cents,
           reserved_cents = excluded.reserved_cents,
           budget_cents   = excluded.budget_cents,
           alerted_80     = excluded.alerted_80,
           alerted_90     = excluded.alerted_90,
           alerted_100    = excluded.alerted_100,
           updated_at     = now();
end;
$$;

-- Re-fire the recalc once so existing rows pick up the new accounting.
do $$
declare
  r record;
begin
  for r in
    select distinct client_id, extract(year from issue_date)::int as yr
      from public.invoices
     where invoice_kind = 'alltagshilfe'
       and deleted_at is null
  loop
    perform public.recalc_alltagshilfe_budget(r.client_id, r.yr);
  end loop;
end $$;

-- Payments also need to update the budget — adding an invoice_payment row
-- changes the running paid_amount_cents on the invoice but the existing
-- trigger only fires on `invoices`. Patch that gap with a payments trigger.
create or replace function public.tg_alltagshilfe_payment_budget()
returns trigger
language plpgsql
as $$
declare
  v_client uuid;
  v_year   int;
  v_kind   text;
begin
  select client_id, invoice_kind, extract(year from issue_date)::int
    into v_client, v_kind, v_year
    from public.invoices
   where id = coalesce(new.invoice_id, old.invoice_id);
  if v_kind = 'alltagshilfe' then
    perform public.recalc_alltagshilfe_budget(v_client, v_year);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_inv_pay_ah_budget on public.invoice_payments;
create trigger trg_inv_pay_ah_budget
after insert or update or delete on public.invoice_payments
for each row execute function public.tg_alltagshilfe_payment_budget();
