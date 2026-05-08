# Production runbook

This document covers everything operational that can't be expressed in
code: where the production environment lives, how to monitor it, what to
do when it breaks, and the load-test plan that gates go-live.

It is the source of truth for the spec's §6.2 / §6.3 / §8 non-functional
requirements (GDPR EU hosting, daily backups, 99.5 % uptime, 500
concurrent users, browser matrix). Update this file whenever any of the
underlying setup changes.

---

## 1. Hosting decision

The spec calls for **Hetzner Cloud, Germany**. There are two practical
ways to honour that:

### Option A — Vercel (Frankfurt edge) + Supabase (Frankfurt region)

The codebase is already shaped for this: Next.js 14 App Router, server
actions, Supabase Postgres + Auth + Storage. To deploy:

1. **Create a Supabase project in `eu-central-1` (Frankfurt)**. This is
   *not* the default — when you click "New project", explicitly pick
   the region.
2. Apply migrations: `pnpm supabase:push` (run from a machine with
   `SUPABASE_DB_URL` set to the new project).
3. **Create a Vercel project** linked to this repo. In *Project
   Settings → Functions*, set the region to `fra1` (Frankfurt). All
   server actions and route handlers will run there.
4. Set every env var from `.env.example` in *Project Settings → Environment Variables*.
   Mark the server-only ones (`SUPABASE_SERVICE_ROLE_KEY`, `LEXWARE_API_KEY`,
   `WEB_PUSH_PRIVATE_KEY`, `TWILIO_AUTH_TOKEN`, `CRON_SECRET`,
   `UPSTASH_REDIS_REST_TOKEN`) as **Encrypted**.
5. Add the Vercel domain to **Supabase → Authentication → URL Configuration**
   (Site URL + Redirect URLs). Without this, OAuth + magic links break.
6. Configure Vercel's built-in cron to hit `/api/jobs/missed-checkout`
   every 15 minutes (Bearer token = `CRON_SECRET`).

This option is the path of least resistance and trivially meets §6.2's
"GDPR compliance, EU servers" — both Vercel `fra1` and Supabase
`eu-central-1` keep all data in Frankfurt.

**Strict reading of the spec ("Hetzner")**: Vercel runs on AWS
under the hood. If the client requires *literal* Hetzner hardware, jump
to Option B.

### Option B — Hetzner Cloud, self-hosted

Spin up two CX22 (4 vCPU / 8 GB RAM) Cloud Servers in `nbg1` (Nuremberg)
or `fsn1` (Falkenstein). Front them with a Hetzner Load Balancer. Run:

- **App tier**: `docker compose` with the Next.js app, behind Caddy
  (auto-TLS via Let's Encrypt). Two replicas for HA.
- **Database**: Hetzner-managed Postgres is in beta; for go-live,
  either use Supabase (option A) or self-host Postgres 15 on a third
  CX22 with `pg_basebackup` replication to a fourth box for failover.
- **Storage**: Hetzner Object Storage (S3-compatible) for media. Mirror
  the Supabase Storage bucket conventions.
- **Auth**: Supabase Auth doesn't run easily outside Supabase. The
  pragmatic choice is to keep Supabase for auth+db (Frankfurt region)
  and move only the Next.js compute layer to Hetzner. That gives you
  "Hetzner DE" for the user-facing surface while keeping the auth
  stack we built against.

**Recommendation**: ship Option A first. Move to Option B if the
client raises a hard procurement objection.

---

## 2. Daily backups (spec §6.2)

`scripts/backup-db.sh` + `.github/workflows/db-backup.yml` runs `pg_dump`
nightly, encrypts with `gpg --symmetric` (AES-256), and pushes to
S3-compatible storage with 30-day retention.

**Setup**:

1. Create an S3 bucket (Hetzner Storage Box, AWS S3 `eu-central-1`,
   Backblaze B2 EU, or Cloudflare R2). Pick one in the EU.
2. Generate a passphrase: `openssl rand -base64 48`. Store **outside**
   the bucket (a password manager, not the same cloud).
3. Add these GitHub secrets to the repo:
   - `DATABASE_URL` — Supabase **direct** connection (port 5432, not
     pgbouncer 6543; pg_dump needs replication features that pooled
     connections don't expose).
   - `BACKUP_PASSPHRASE`
   - `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX` (e.g. `prod/`)
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
   - `AWS_ENDPOINT_URL` (only for non-AWS providers)
   - `SLACK_BACKUP_WEBHOOK` (optional, alerts on failure)
4. Manually trigger the workflow once: *Actions → DB backup → Run workflow*.
   Verify the encrypted blob lands in the bucket.

**Restore drill (do this on staging every quarter)**:

```bash
aws s3 cp s3://$BUCKET/backup-YYYYMMDD….dump.gpg ./b.dump.gpg
gpg --decrypt --batch --passphrase "$BACKUP_PASSPHRASE" b.dump.gpg > b.dump
pg_restore --clean --if-exists --no-owner --dbname "$STAGING_URL" b.dump
```

The drill should complete in under 30 minutes for the current data
volume; record the actual time after each test in `docs/RESTORE_LOG.md`.

---

## 3. Uptime monitoring + on-call

**Spec target**: 99.5 % uptime, ≤3.6 h downtime/month.

### 3.1 External monitoring

Pick one and configure:

- **Better Uptime** (recommended) — free tier supports 10 monitors,
  on-call schedules, status pages.
- Vercel built-in monitoring + alerts.
- **Healthchecks.io** — free, works for both heartbeat checks (cron
  jobs ping it) and HTTP checks.

Required monitors:

| Monitor                                      | Frequency | Threshold      |
| -------------------------------------------- | --------- | -------------- |
| `GET /api/health` returns 200 + `{ ok: true }` | 1 min     | 2 consecutive failures → page on-call |
| `GET /login` returns 200 + contains "Anmelden" | 5 min   | 3 consecutive failures |
| `POST /api/jobs/missed-checkout` cron heartbeat | 30 min  | >2× expected interval |
| Supabase auth: try sign-in with a synthetic `monitor@…` user | 15 min | 1 failure |

### 3.2 Alert routing

PagerDuty/Opsgenie/Better Uptime → on-call rotation.

**Severity tiers**:

- **P0 (5 min response)**: site fully down, login broken, payments
  blocked.
- **P1 (30 min)**: degraded performance, single subsystem (chat,
  notifications, Lexware sync) down.
- **P2 (next business day)**: one user impacted, CSS bug, etc.

### 3.3 On-call playbooks

Index of runbooks (write each as a small markdown file under
`docs/runbooks/` as scenarios come up):

- **Site fully down** — check Vercel status, Supabase status, recent
  deploys; rollback via `vercel rollback` if a deploy correlates.
- **Login fails** — check Supabase Auth status, then RLS for
  `profiles.own update` (migration 000024); test 2FA enrolment
  against a synthetic user.
- **GPS check-in rejects everything** — verify `properties.latitude/
  longitude` are populated; the radius default is 100 m (override via
  `properties.gps_radius_m`).
- **Lexware sync errors** — check `LEXWARE_API_KEY` validity, then
  Lexware status page; use `/invoices/[id]` "Re-sync" once cleared.
- **Chat realtime silent** — Supabase realtime publication includes
  `chat_messages` (migration 000007); confirm with `select * from
  pg_publication_tables where pubname = 'supabase_realtime'`.

---

## 4. Browser test matrix (spec §8)

The Playwright config now ships three browser projects:

```bash
npm run test:e2e            # Chromium only, fast loop
npm run test:e2e:matrix     # Chromium + Firefox + WebKit (~3× slower)
npm run test:a11y           # axe-core baseline (Chromium)
```

**CI policy**:

- Every PR runs `test:e2e` (Chromium) — fast feedback.
- Nightly run: `test:e2e:matrix` + `test:a11y`. Failures page the
  on-call.
- Before each release tag: full matrix run, manual approval.

The matrix covers the spec's stated minimum: Chrome 90+, Safari 15+,
Firefox 90+. Edge uses the Chromium engine, so `chromium` covers Edge
too unless you want to run with `--browser=msedge` for completeness.

---

## 5. Load test (spec §6.3 — 500 concurrent users)

`k6` is the recommended tool. Add `tests/load/k6-baseline.js` with a
ramp profile:

```js
import http from "k6/http";
import { check, sleep } from "k6";
export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 250 },
    { duration: "5m", target: 500 },
    { duration: "3m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"], // spec §6.3
    http_req_failed: ["rate<0.01"],
  },
};
export default function () {
  const r = http.get(`${__ENV.BASE_URL}/api/health`);
  check(r, { "200 OK": (res) => res.status === 200 });
  sleep(1);
}
```

Run against staging with:

```bash
BASE_URL=https://staging.priyas.app k6 run tests/load/k6-baseline.js
```

**Pass criteria**:

- p95 < 300 ms on `/api/health`, `/api/clients`, `/api/properties`
  (spec §6.3).
- < 1 % error rate.
- Database CPU stays under 80 %.

If thresholds fail: scale Vercel functions, upgrade Supabase tier, or
move to Option B (Hetzner self-host).

---

## 6. Security headers + GDPR posture

| Item                              | Status                              |
| --------------------------------- | ----------------------------------- |
| CSP (Content-Security-Policy)     | Set in `next.config.mjs`            |
| HSTS                              | Production-only, 2-year, preload    |
| X-Frame-Options + frame-ancestors | DENY                                |
| Referrer-Policy                   | strict-origin-when-cross-origin     |
| Permissions-Policy                | camera=(), microphone=(self), geolocation=(self) |
| TLS 1.3                           | Vercel / Hetzner LB enforced        |
| Rate limiting                     | Upstash Redis (multi-replica)       |
| 2FA for managers                  | Hard-blocked at `/setup-2fa`        |
| RLS                               | Every domain table; column-level guard on `profiles.role` |
| Daily backups                     | GitHub Actions, 30-day retention    |
| Audit log                         | Every CRUD; `audit_log` table       |

GDPR data-subject rights workflows (export, deletion) are not yet
automated — for v1 they're handled manually by an admin querying the
DB. Data Processing Agreement template lives at
`docs/legal/dpa-template.md` (TODO).

---

## 7. Pre-go-live checklist

Print this and tick off:

- [ ] Production Supabase project in `eu-central-1` created.
- [ ] All 25 migrations applied (`pnpm supabase:push`).
- [ ] First admin user created in production; 2FA enrolled.
- [ ] All env vars set in Vercel/Hetzner (compare with `.env.example`).
- [ ] Daily backup workflow has run successfully ≥ 1 time.
- [ ] Restore drill completed against a staging DB.
- [ ] `npm run test:e2e:matrix` passes against staging.
- [ ] `npm run test:a11y` passes (zero serious/critical violations).
- [ ] k6 baseline load test passes p95 < 300 ms.
- [ ] Better Uptime monitors active for `/api/health`, `/login`,
      missed-checkout cron heartbeat.
- [ ] Lexware credentials configured (or stub explicitly accepted).
- [ ] Twilio WhatsApp sandbox replaced with approved sender (or
      WhatsApp explicitly disabled in Settings).
- [ ] Web Push VAPID keys generated + set; service worker reachable
      at `/sw.js` over HTTPS.
- [ ] DNS, custom domain, SSL certificate.
- [ ] Backup passphrase + service-role key archived in the password
      manager — and tested by a different team member.
- [ ] On-call rotation set up; runbook reviewed by the team.
