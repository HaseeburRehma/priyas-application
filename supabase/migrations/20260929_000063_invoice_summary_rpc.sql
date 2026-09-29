create or replace function public.invoice_summary_kpis()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
    org as (select public.current_org_id() as id),
    base as (
      select status, total_cents, issue_date, paid_at, due_date
      from public.invoices
      where org_id = (select id from org)
        and deleted_at is null
    ),
    agg as (
      select
        count(*) as total_count,
        coalesce(sum(total_cents), 0)::bigint as total_amount,
        count(*) filter (where status = 'paid') as paid_count,
        coalesce(sum(total_cents) filter (where status = 'paid'), 0)::bigint as paid_amount,
        count(*) filter (where status = 'sent') as open_count,
        coalesce(sum(total_cents) filter (where status = 'sent'), 0)::bigint as open_amount,
        count(*) filter (where status = 'overdue') as overdue_count,
        coalesce(sum(total_cents) filter (where status = 'overdue'), 0)::bigint as overdue_amount,
        coalesce(sum(total_cents) filter (
          where status = 'paid'
            and paid_at >= date_trunc('month', now())
            and paid_at < date_trunc('month', now()) + interval '1 month'
        ), 0)::bigint as collected_this_month,
        coalesce(sum(total_cents) filter (
          where status in ('sent', 'overdue')
            and due_date <= (now() + interval '30 days')::date
        ), 0)::bigint as forecast_30d
      from base
    )
  select jsonb_build_object(
    'total',                 (select total_count from agg),
    'totalAmountCents',      (select total_amount from agg),
    'paidCount',             (select paid_count from agg),
    'paidAmountCents',       (select paid_amount from agg),
    'openCount',             (select open_count from agg),
    'openAmountCents',       (select open_amount from agg),
    'overdueCount',          (select overdue_count from agg),
    'overdueAmountCents',    (select overdue_amount from agg),
    'collectedThisMonthCents', (select collected_this_month from agg),
    'forecast30dCents',      (select forecast_30d from agg)
  );
$$;

grant execute on function public.invoice_summary_kpis() to authenticated;
notify pgrst, 'reload schema';
