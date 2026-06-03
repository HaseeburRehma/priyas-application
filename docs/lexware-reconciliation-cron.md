# Lexware reconciliation crons — scheduling

Two new cron endpoints landed alongside the reconciliation feature:

| Route | Purpose | Recommended cadence |
|---|---|---|
| `POST /api/jobs/lexware-retry` | Re-attempt failed Lexware pushes | Daily, 03:15 UTC |
| `POST /api/jobs/lexware-payments-sync` | Mirror paid vouchers back into our DB | Daily, 03:30 UTC |

Both authenticate via `Authorization: Bearer ${CRON_SECRET}`.

## Why they're not in `vercel.json`

Vercel **Hobby** plans cap at **2 cron jobs total** and **daily-only schedules**. We already use both slots for `lexware-monthly` (monthly auto-invoice generation) and `missed-checkout` (end-of-day digest). Adding the two reconciliation jobs would put the project over quota and break deploys.

Two ways to run them:

### Option A — Upgrade to Vercel Pro (40 crons, full granularity)

Add to `vercel.json`:

```json
{ "path": "/api/jobs/lexware-retry",         "schedule": "15 3 * * *" },
{ "path": "/api/jobs/lexware-payments-sync", "schedule": "30 3 * * *" }
```

### Option B — Schedule via GitHub Actions (free, recommended on Hobby)

Drop the file below at `.github/workflows/lexware-reconcile.yml`:

```yaml
name: lexware-reconcile
on:
  schedule:
    - cron: "15 3 * * *"   # retry sweep
    - cron: "30 3 * * *"   # payments sync
jobs:
  retry:
    if: github.event.schedule == '15 3 * * *'
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "${{ secrets.APP_BASE_URL }}/api/jobs/lexware-retry" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
  payments:
    if: github.event.schedule == '30 3 * * *'
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "${{ secrets.APP_BASE_URL }}/api/jobs/lexware-payments-sync" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Required GitHub repo secrets:

- `APP_BASE_URL` — e.g. `https://priyas-application.vercel.app`
- `CRON_SECRET` — same value as the Vercel env var

Either path produces identical behaviour. Pro gives you in-Vercel observability; GitHub Actions stays free.

## What each cron does

### `/api/jobs/lexware-retry`

Finds invoices where:

- `export_target = 'lexware'`
- `lexware_id IS NULL` (push never succeeded)
- `status` in (`sent`, `overdue`, `paid`)
- `lexware_last_attempt_at` either `NULL` or older than 30 min (cooldown)

Calls `LexwareExporter.push()` again. On success stamps `lexware_id` + flips `lexware_sync_status` to `synced`. On failure, increments `lexware_attempts` + stores the error in `lexware_last_error`.

Soft cap: 100 invoices per run, ordered by oldest attempt first. Real-world steady-state should clear in 1–2 runs.

### `/api/jobs/lexware-payments-sync`

For every org:

1. Read `settings.data.lexware.lastPaymentSyncAt` (cursor). First run defaults to 30 days ago.
2. Call `GET /v1/voucherlist?voucherType=invoice&voucherStatus=paid&paidDateFrom=<cursor>`.
3. For each paid voucher, find the matching invoice by `lexware_id`. Insert an `invoice_payments` row with `lexware_voucher_id` as the dedup key. Recompute `paid_amount_cents` + flip status to `paid` when fully covered.
4. Advance the cursor only on a clean run (no errors).

Idempotency: the partial unique index `uniq_inv_pay_lexware_voucher` blocks duplicate rows regardless of how many times the cron runs against the same window.

## Manual trigger (any user with `invoice.lexware_sync`)

Both flows are also reachable as server actions from the invoice detail page:

- "Retry Lexware sync" → calls `retrySyncInvoiceAction(id)` which wraps `retryLexwarePushForInvoice` for that single invoice.
- "Pull payments from Lexware" → calls `pullPaymentsAction()` which wraps `pullLexwarePaymentsForOrg(orgId)`.

Useful when an accountant wants to confirm a payment posted before the nightly cron runs.
