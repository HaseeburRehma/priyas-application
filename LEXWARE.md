# Lexware Office — Monthly Auto-Billing

This document covers the **monthly auto-invoice cron** that aggregates completed
shifts per client, drafts invoices in our database, and pushes them to Lexware
Office. The manual sync (per-invoice "Sync Lexware" button on the invoice
detail page) is unchanged and continues to work.

## Components

| Layer                | Path                                                         |
| -------------------- | ------------------------------------------------------------ |
| HTTP client          | `src/lib/lexware/client.ts`                                  |
| Adapter / facade     | `src/lib/integrations/lexware.ts`                            |
| Generation action    | `src/app/actions/lexware-monthly-invoices.ts`                |
| Cron route           | `src/app/api/jobs/lexware-monthly/route.ts`                  |
| Admin UI panel       | `src/components/reports/LexwareMonthlyPanel.tsx`             |
| DB migration         | `supabase/migrations/20260513_000030_invoice_period.sql`     |

## Environment variables

| Variable              | Where               | Notes                                        |
| --------------------- | ------------------- | -------------------------------------------- |
| `LEXWARE_BASE_URL`    | Server-only         | e.g. `https://api.lexware.io`. Trailing slash is stripped. |
| `LEXWARE_API_KEY`     | Server-only         | Bearer token issued by Lexware Office.       |
| `CRON_SECRET`         | Server-only         | Bearer token used to authorise cron POSTs. Generate with `openssl rand -hex 32`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only   | Required so the cron can bypass RLS.         |

Without `LEXWARE_*` set, the adapter falls back to the existing stub client —
useful for staging the cron without actually creating invoices in Lexware.

## Cron schedule

The cron route is registered in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/jobs/lexware-monthly", "schedule": "0 3 1 * *" }
  ]
}
```

`0 3 1 * *` = 03:00 UTC on the 1st of every month. The handler computes the
**previous calendar month** automatically, so this is the only schedule that
needs maintaining.

If you run on a different platform (Hetzner, GitHub Actions, external Cloud
Scheduler), POST to `/api/jobs/lexware-monthly` with
`Authorization: Bearer ${CRON_SECRET}` on the same cadence.

## Idempotency

The migration adds:

* `invoices.period_year`, `invoices.period_month` (0-indexed),
* `invoices.source` (`manual` | `auto_monthly` | `import`),
* A partial unique index on `(client_id, period_year, period_month)` where
  `source = 'auto_monthly' AND deleted_at IS NULL`.

Reruns for the same month are safe — already-billed clients are skipped at the
application layer, and the unique index is a hard backstop against races.

## Admin UI

`/reports` shows a "Monthly Lexware billing" panel for admins only. The
"Preview month" button runs the action with `dryRun: true`; the
"Generate now" button surfaces the same preview in a confirmation modal
before committing the run. The panel also shows the timestamp + summary of
the most recent run (read from `audit_log`).

## Manual trigger via curl

```sh
curl -X POST https://your-domain/api/jobs/lexware-monthly \
  -H "Authorization: Bearer $CRON_SECRET"
```

Response:

```json
{
  "year": 2026,
  "month": 4,
  "ok": true,
  "generated": 12,
  "skipped": 0,
  "errors": [],
  "totalEur": 4823.40
}
```
