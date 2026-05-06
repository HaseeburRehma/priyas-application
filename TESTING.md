# Testing — Priya's Reinigungsservice

A complete, **free**, local-only manual test plan for verifying every role × every
feature end-to-end. (The earlier Playwright + Stagehand harness has been removed.
This doc now covers the manual matrix only.)

---

## 1. Set up your free test stack

Two paths, both free. Pick one.

### Option A — Supabase Cloud (free tier, recommended)

1. Sign in to <https://supabase.com> and create a new project (Frankfurt or
   Ireland for GDPR alignment). Free tier = 500 MB Postgres + 1 GB Storage +
   50k monthly auth users.
2. From **Project settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (SERVER ONLY) → `SUPABASE_SERVICE_ROLE_KEY`
3. From **Project settings → Database → Connection string**, copy the URI
   (not pooled) → `SUPABASE_DB_URL`.
4. Apply every migration in order, then the seeds:
   ```bash
   for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -f "$f"; done
   psql "$SUPABASE_DB_URL" -f supabase/seed/seed.sql
   psql "$SUPABASE_DB_URL" -f supabase/seed/test_users.sql
   ```

### Option B — fully local Postgres (Supabase CLI)

```bash
supabase start          # boots Postgres, Studio, Storage, Auth in Docker
supabase db reset       # applies every migration + seed.sql
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
  -f supabase/seed/test_users.sql
```

### `.env.local`

Copy `.env.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=de
NEXT_PUBLIC_DEFAULT_ORG_ID=00000000-0000-0000-0000-0000000000aa

# Optional — for Web Push tests:
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
WEB_PUSH_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:test@example.com

# Optional — for Lexware tests:
LEXWARE_BASE_URL=https://api.lexware.io
LEXWARE_API_KEY=
```

To generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

### Boot the app

```bash
npm install
npm run dev
# App at http://localhost:3000
```

---

## 2. Test users

Seeded by `supabase/seed/test_users.sql`. Three pre-confirmed accounts in the
default org:

| Role         | Spec name        | Internal name | Sees in nav                                                         |
| ------------ | ---------------- | ------------- | ------------------------------------------------------------------- |
| Management   | full access      | `admin`       | Everything                                                          |
| Project Mgr  | scheduling+more  | `dispatcher`  | Everything except Settings → write                                  |
| Field Staff  | mobile-only      | `employee`    | Dashboard / Schedule / Vacation / Training / Chat / Notifications   |

The seeded passwords are visible in `supabase/seed/test_users.sql`. In production
you would never run that seed.

---

## 3. Manual test matrix

Walk through every row before each release. Each cell is "expected outcome per role".

### 3.1 Authentication & profile

| Test                                                            | Admin | Dispatcher | Employee |
|-----------------------------------------------------------------|-------|------------|----------|
| Sign in with correct password lands on `/dashboard`             | ✅    | ✅         | ✅       |
| Sign in with wrong password shows error, stays on `/login`      | ✅    | ✅         | ✅       |
| Topbar shows correct full name + role badge                     | Mgmt  | Project    | Field    |
| Sign out from user menu returns to `/login`                     | ✅    | ✅         | ✅       |
| Direct `/dashboard` URL while signed-out → `/login` redirect    | ✅    | ✅         | ✅       |
| Settings → Security → enable 2FA → QR + secret render           | ✅    | ✅         | n/a      |
| Sign out + sign back in with 2FA prompts for code               | ✅    | ✅         | n/a      |

### 3.2 Clients (CRM)

| Test                                                | Admin | Dispatcher | Employee  |
|-----------------------------------------------------|-------|------------|-----------|
| `/clients` lists seeded clients + summary cards     | ✅    | ✅         | redirect  |
| Search / type filters work                          | ✅    | ✅         | –         |
| New-client wizard at `/clients/new` shows 3 options | ✅    | ✅         | redirect  |
| Submit residential creates + redirects to detail    | ✅    | ✅         | –         |
| Alltagshilfe requires insurance fields              | ✅    | ✅         | –         |
| 30-day "New" badge on freshly created client        | ✅    | ✅         | –         |
| Auto-notification fires to dispatchers + admins     | ✅    | ✅         | –         |
| Multi-contact card on detail (add / edit / delete)  | ✅    | ✅         | –         |
| Archive client (admin-only)                         | ✅    | –          | –         |

### 3.3 Tablet onboarding

| Test                                                    | Admin | Dispatcher | Employee |
|---------------------------------------------------------|-------|------------|----------|
| `/onboard` opens 5-step wizard                          | ✅    | ✅         | redirect |
| Each step enforces required fields                      | ✅    | ✅         | –        |
| Signature pad captures SVG path data                    | ✅    | ✅         | –        |
| Submit creates client + property + service_scope + sig  | ✅    | ✅         | –        |
| Success page offers "Onboard another" / "To clients"    | ✅    | ✅         | –        |

### 3.4 Properties

| Test                                                        | Admin | Dispatcher | Employee |
|-------------------------------------------------------------|-------|------------|----------|
| `/properties` lists + summary                               | ✅    | ✅         | redirect |
| Detail loads with structured fields (floor / access code)   | ✅    | ✅         | –        |
| Safety blocks render only when populated                    | ✅    | ✅         | –        |
| Photo upload + signed-URL gallery                           | ✅    | ✅         | –        |
| Damage report card (log / resolve / discuss in chat)        | ✅    | ✅         | log only |
| Closures CRUD (date range + reason)                         | ✅    | ✅         | –        |
| Cleaning concept PDF upload + signed-URL link               | ✅    | ✅         | –        |

### 3.5 Schedule

| Test                                                  | Admin | Dispatcher | Employee   |
|-------------------------------------------------------|-------|------------|------------|
| Week calendar renders                                 | ✅    | ✅         | own shifts |
| Closure / vacation overlay strip below day header     | ✅    | ✅         | ✅         |
| Plan-shift modal validates + creates                  | ✅    | ✅         | hidden     |
| Conflict warning on double-book / vacation / closure  | ✅    | ✅         | –          |
| Training-lock blocks unqualified employee assignment  | ✅    | ✅         | –          |
| Drag-and-drop a shift to another day/hour             | ✅    | ✅         | –          |
| iCal feed `/api/schedule/ical?token=…` returns .ics   | ✅    | ✅         | ✅ own     |
| PDF export `/api/schedule/pdf?date=…`                 | ✅    | ✅         | hidden     |

### 3.6 GPS check-in / check-out (§4.4)

| Test                                                       | Admin | Dispatcher | Employee   |
|------------------------------------------------------------|-------|------------|------------|
| CheckInButton on assigned shift                            | ✅    | ✅         | ✅         |
| Browser geolocation prompt fires                           | ✅    | ✅         | ✅         |
| Outside-radius rejection with distance hint                | ✅    | ✅         | ✅         |
| In-range check-in records lat/long/distance                | ✅    | ✅         | ✅         |
| Re-pressing the button moves to "Check out"                | ✅    | ✅         | ✅         |
| "Mark complete" lands the shift in `completed`             | ✅    | ✅         | ✅         |
| Manager manual-correction writes a `manual=true` row       | ✅    | ✅         | hidden     |
| `/api/jobs/missed-checkout` (with CRON_SECRET) emits push  | n/a   | n/a        | n/a (cron) |
| `/api/reports/working-time?month=YYYY-MM` returns CSV      | ✅    | ✅         | hidden     |

### 3.7 Employees

| Test                                  | Admin | Dispatcher | Employee |
|---------------------------------------|-------|------------|----------|
| `/employees` list + roster            | ✅    | ✅         | redirect |
| Detail page                           | ✅    | ✅         | –        |
| Invite modal (admin-only)             | ✅    | –          | –        |
| Edit data                             | ✅    | ✅         | –        |
| Archive (admin-only)                  | ✅    | –          | –        |

### 3.8 Vacation

| Test                                              | Admin | Dispatcher | Employee   |
|---------------------------------------------------|-------|------------|------------|
| `/vacation` list                                  | ✅all | ✅all      | ✅own      |
| New-request submit                                | ✅    | ✅         | ✅         |
| Approve / reject visible                          | ✅    | ✅         | hidden     |
| Suggest-alternative-dates flow                    | ✅    | ✅         | hidden     |
| Employee accept-suggestion flips to approved      | –     | –          | ✅         |
| Approved vacation appears on schedule overlay     | ✅    | ✅         | ✅         |

### 3.9 Training (§4.9)

| Test                                                      | Admin | Dispatcher | Employee  |
|-----------------------------------------------------------|-------|------------|-----------|
| `/training` hub renders                                   | ✅    | ✅         | filtered  |
| New module + edit + delete (managers)                     | ✅    | ✅         | hidden    |
| YouTube/Vimeo URL embeds; .mp4 plays                      | ✅    | ✅         | ✅        |
| Mark started / completed / reset persists                 | –     | –          | ✅        |
| Mandatory tag visible                                     | ✅    | ✅         | ✅        |
| Assign-modal restricts visibility                         | ✅    | ✅         | reflected |
| Shift create/update blocked when mandatory not done       | ✅    | ✅         | n/a       |

### 3.10 Invoices + Lexware (§4.7)

| Test                                                    | Admin | Dispatcher | Employee |
|---------------------------------------------------------|-------|------------|----------|
| `/invoices` lists with status pills                     | ✅    | ✅         | redirect |
| Create / edit / status flow                             | ✅    | ✅         | –        |
| PDF download via `/api/invoices/<id>/pdf`               | ✅    | ✅         | –        |
| Mark sent / paid                                        | ✅    | ✅         | –        |
| Lexware-sync button (admin-only)                        | ✅    | –          | –        |
| With LEXWARE_* env set, sync hits real REST API         | ✅    | –          | –        |
| `lexware_contact_id` persists on subsequent syncs       | ✅    | –          | –        |

### 3.11 Reports

| Test                                                | Admin | Dispatcher | Employee |
|-----------------------------------------------------|-------|------------|----------|
| `/reports` KPIs + charts                            | ✅    | ✅         | redirect |
| `/reports/alltagshilfe` monthly report              | ✅    | ✅         | –        |
| Working-time CSV export per employee per month      | ✅    | ✅         | –        |

### 3.12 Settings

| Test                                          | Admin | Dispatcher | Employee |
|-----------------------------------------------|-------|------------|----------|
| `/settings` visible                           | ✅    | ✅         | redirect |
| Company / Tax / Locale save                   | ✅    | view-only  | –        |
| Notifications matrix toggles persist          | ✅    | view-only  | –        |
| Push toggle: enable → "Active" badge          | ✅    | ✅         | –        |
| 2FA section visible                           | ✅    | ✅         | –        |

### 3.13 Chat

| Test                                                       | Admin | Dispatcher | Employee |
|------------------------------------------------------------|-------|------------|----------|
| Default channels seeded (#einsatzplan, #allgemein, …)      | ✅    | ✅         | ✅       |
| Three-section sidebar (Kanäle / DMs / Gruppen) with counts | ✅    | ✅         | ✅       |
| Filter input narrows visible rows                          | ✅    | ✅         | ✅       |
| Lock icon on private channel                               | ✅    | ✅         | hidden   |
| Send a text message — appears live                         | ✅    | ✅         | ✅       |
| Realtime: new message in another tab appears               | ✅    | ✅         | ✅       |
| Attach an image / PDF / record voice                       | ✅    | ✅         | ✅       |
| React with emoji; counts update                            | ✅    | ✅         | ✅       |
| Damage report → "💬 Discuss" posts to property channel     | ✅    | ✅         | ✅       |
| Online-presence dot on DM rows when other tab opens        | ✅    | ✅         | ✅       |

### 3.14 Notifications + Push

| Test                                              | Admin | Dispatcher | Employee |
|---------------------------------------------------|-------|------------|----------|
| `/notifications` lists rows                       | ✅    | ✅         | ✅       |
| "Mark read" / "Mark all read" updates badge       | ✅    | ✅         | ✅       |
| With VAPID configured, push fires desktop alert   | ✅    | ✅         | ✅       |
| Click on push notification opens deep-link URL    | ✅    | ✅         | ✅       |

### 3.15 i18n & responsive

| Test                                              | DE | EN | TA |
|---------------------------------------------------|----|----|----|
| Switch language from topbar                       | ✅ | ✅ | ✅ |
| All visible strings translate                     | ✅ | ✅ | ✅ |
| Tamil renders with Noto Sans Tamil                | –  | –  | ✅ |
| Mobile <768 px: drawer + bottom nav               | ✅ | ✅ | ✅ |
| Tablet 768–1023 px: collapsed sidebar             | ✅ | ✅ | ✅ |
| Desktop ≥1024 px: full sidebar + topbar           | ✅ | ✅ | ✅ |

---

## 4. RBAC sanity (smoke check)

For each role, attempt the following — server actions should reject with the
`PermissionError` message; deep-linked URLs should redirect to `/dashboard`.

| Action                          | admin | dispatcher | employee |
|---------------------------------|-------|------------|----------|
| `client.create` / `update`      | allow | allow      | deny     |
| `client.archive` / `delete`     | allow | deny       | deny     |
| `property.create` / `update`    | allow | allow      | deny     |
| `shift.create` / `update`       | allow | allow      | deny     |
| `invoice.create` / `update`     | allow | allow      | deny     |
| `invoice.delete`                | allow | deny       | deny     |
| `invoice.lexware_sync`          | allow | deny       | deny     |
| `vacation.approve`              | allow | allow      | deny     |
| `damage.create`                 | allow | allow      | allow    |
| `damage.resolve`                | allow | allow      | deny     |
| `training.manage`               | allow | allow      | deny     |
| `time.checkin`                  | allow | allow      | allow    |
| `time.correct`                  | allow | allow      | deny     |
| `settings.update`               | allow | deny       | deny     |
| `employee.create` / `archive`   | admin | deny       | deny     |

The full route-allow-list lives in `AUTHORIZATION.md`.

---

## 5. Cleanup between runs

Truncate everything but the org + settings + test users:

```sql
truncate
  public.notifications, public.audit_log,
  public.chat_messages, public.chat_members, public.chat_channels,
  public.invoice_items, public.invoices,
  public.shifts, public.time_entries,
  public.properties, public.property_closures,
  public.contracts, public.service_scopes, public.property_keys,
  public.vacation_requests,
  public.training_modules, public.employee_training_progress,
  public.training_assignments,
  public.damage_reports, public.client_signatures,
  public.push_subscriptions, public.calendar_tokens,
  public.client_contacts
restart identity cascade;
```

Then re-apply `supabase/seed/seed.sql` to refresh demo data.
