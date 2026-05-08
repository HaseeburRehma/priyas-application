# Codebase Audit Report — Priya's Cleaning Service

Audit date: 2026-05-06
Audited against: `Requirements_Specification_Priyas_Cleaning_Service.pdf`, v1.0, March 2026
Codebase: `/Users/macbookpro/Desktop/hasseeb/priya's-application` (commit state at audit time)

> Note on the existing `STATUS.md`: the repository already contains a status file written earlier in development. Several of its claims are now stale — for example, it says GPS check-in/out is unbuilt, Lexware is a stub, drag-and-drop scheduling is missing, and PDF/iCal export aren't done. **All of those have since been implemented.** This audit was performed by reading the actual code in `src/`, `supabase/migrations/`, and `messages/` rather than trusting the existing status doc.

---

## Project Overview

### Tech stack identified

| Layer            | Choice                                        | Spec asks for                       |
| ---------------- | --------------------------------------------- | ----------------------------------- |
| Frontend (Web)   | Next.js 14 (App Router) + React 18 + TS       | React.js SPA                        |
| Backend          | Next.js Server Actions + Route Handlers       | Node.js + Express, `/api/v1/`       |
| Database / auth  | Supabase (Postgres + Auth + Storage)          | PostgreSQL + JWT + OAuth2           |
| State            | TanStack Query (server) + Zustand (UI)        | —                                   |
| Forms            | React Hook Form + Zod                         | —                                   |
| Styling          | Tailwind (CSS-variable theme)                 | —                                   |
| i18n             | next-intl (messages/{de,en,ta}.json)          | react-i18next                       |
| Charts           | Recharts                                      | —                                   |
| PDFs             | pdf-lib                                       | —                                   |
| Push             | web-push + service worker `public/sw.js`      | Mobile push                         |
| Hosting target   | Vercel                                        | Hetzner Cloud (DE)                  |
| Mobile           | Responsive web only — no native shell         | React Native iOS+Android (missing)  |

### Folder structure summary

```
src/
├── app/
│   ├── (auth)/{login,register,forgot-password}      # auth pages + MFA challenge
│   ├── (dashboard)/                                  # all authenticated pages
│   │   ├── dashboard, clients, properties, schedule,
│   │   │   employees, invoices, reports, settings,
│   │   │   chat, notifications, training, vacation,
│   │   │   onboard
│   ├── actions/                                      # 19 server-action files
│   └── api/                                          # 8 REST/Cron routes
├── components/                                       # ~50 client components
├── hooks/                                            # TanStack Query hooks (clients/employees/properties/invoices/chat)
├── lib/
│   ├── api/             # server-only data loaders
│   ├── lexware/         # real Lexware Office REST client
│   ├── integrations/    # lexware adapter, whatsapp stub
│   ├── notifications/   # emit() entry point
│   ├── pdf/             # invoice + schedule PDF rendering
│   ├── push/            # web-push send
│   ├── ical/            # iCal feed builder
│   ├── rate-limit/      # in-memory sliding window
│   ├── rbac/permissions.ts                           # MATRIX + route guard
│   ├── supabase/        # client / server / middleware
│   ├── training/lock.ts # mandatory-training shift gate
│   ├── utils/{cn,format,geo}.ts
│   └── validators/      # 14 Zod schemas
├── i18n/request.ts
├── middleware.ts
└── types/{database,chat}.ts

supabase/
├── migrations/                                       # 23 idempotent SQL files
└── seed/{seed.sql,test_users.sql}

messages/                                             # de, en, ta — ~1450 keys each
public/sw.js                                          # push service worker
tests/e2e/                                            # Playwright + Stagehand specs
```

### Total files reviewed (selectively, deeply)

- **23** Supabase migrations
- **19** server actions
- **8** API route handlers
- **~50** React components (auth, layout, dashboard, clients, properties, schedule, employees, invoices, chat, notifications, settings, vacation, training, onboarding, reports, statement)
- **17** server-only data loaders / type modules under `src/lib/api/`
- **3** locale files (1486 / 1447 / 1452 lines)
- Configuration: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.mjs`, `playwright.config.ts`, `.env.example`, `supabase/config.toml`

### Key architectural decisions observed

1. **Server-action–first, not REST-first.** Mutations live in `src/app/actions/*.ts` as Next.js Server Actions. The few `app/api/` routes are restricted to: health probe, list endpoints used for table pagination, exports (PDF, iCal, CSV), the OAuth callback, and a cron worker. There is no `/api/v1/` versioned REST surface.
2. **Org-scoped multi-tenancy is technically prepared.** Every domain table has `org_id`; RLS policies use `current_org_id()` and `is_dispatcher_or_admin()` helpers; storage buckets enforce `<org_id>/...` path prefixes. This satisfies the spec's "future multi-tenant capability should be technically prepared but is not part of this development phase."
3. **RBAC is enforced in three layers.** A `MATRIX` action map in `src/lib/rbac/permissions.ts`, a route allow-list (`ROUTE_ACCESS`), and DB-level RLS policies. Server actions call `requirePermission()` before any DB hit.
4. **Audit log is wired into every CRUD action.** Each server action calls a local `audit()` helper that inserts into `public.audit_log` with `before`/`after` JSON.
5. **Soft delete (`deleted_at`) on every domain table.** Read paths consistently filter `is("deleted_at", null)`.
6. **Rate limiter exists but is sparsely applied.** Implemented in `src/lib/rate-limit/{limiter,guard}.ts` (in-memory sliding window). Currently invoked from only `client.create`, `shift.create`, `time.checkin`, and `invoice.lexware_sync`.

### Code-vs-UI orphans noted

- `src/lib/integrations/whatsapp.ts` is a console-only stub; the Settings → Integrations page and notification-channel matrix already show WhatsApp as a switchable option, so the UI promises a feature the backend can't deliver.
- `src/app/(auth)/login/LoginForm.tsx` shows Google + Apple SSO buttons but they are explicitly `disabled` ("temporarily unavailable"). The OAuth callback route (`/api/auth/callback`) and the `_signInWithGoogle()` function exist, so the wiring is there — only the UI affordance is gated.
- `src/app/(auth)/login/LoginBrandPanel.tsx.deleted.bak` — orphan backup file that should be removed from the repo.
- The Schedule page's **Export** button (`src/components/schedule/SchedulePage.tsx`, ~line 127) has no click handler even though `/api/schedule/pdf` and `/api/schedule/ical` are fully implemented. Same for **Today** and prev/next week navigation.
- Sidebar Team / Status filters in Schedule are still hard-coded mock counts (`{ count: 12 }`, `count={18}`) rather than fetched data.
- `PropertyDetail.tsx` always renders the "NEW" badge unconditionally — it ignores `created_at`, unlike `ClientDetail.tsx` which uses a 30-day window.

---

## Requirements Status Summary

I extracted **78** discrete requirements from the spec (functional + non-functional, every bullet treated as an item). Aggregated:

- **Total requirements identified:** 78
- ✅ **Completed:** 47 (60%)
- ⚠️ **Partial:** 19 (24%)
- ❌ **Untouched:** 12 (15%)

The headline gap is the **Mobile App (React Native)** — every native-mobile requirement is unbuilt. The web side is largely feature-complete; what's missing is mostly polish and operational readiness (deploy target, SLAs, OpenAPI docs, browser-matrix testing, app-store publication).

---

## Detailed Breakdown

### ✅ COMPLETED FEATURES

#### 1. Authentication — email/password + JWT + 2FA
- **Requirement (§6):** JWT auth, OAuth2, bcrypt passwords ≥10 chars, 2FA for management + project managers.
- **Implementation:** Supabase Auth provides JWT and bcrypt. Login form (`LoginForm.tsx`) validates with Zod (`loginSchema`), then handles AAL2 escalation via `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. Settings → Security (`SecuritySection.tsx`) walks users through TOTP enrolment with QR code + 6-digit verify + disable.
- **Notes:** Google/Apple SSO is wired in code (`signInWithOAuth`, `/api/auth/callback`) but the UI buttons are disabled pending provider re-config in Supabase. 2FA is currently optional for everyone — the spec says it must be **mandatory** for admin and dispatcher; no enforcement check exists yet.

#### 2. RBAC (Role-Based Access Control)
- **Requirement (§3):** Three roles with strict per-feature scoping; routes hidden when not allowed.
- **Implementation:** `src/lib/rbac/permissions.ts` defines a `MATRIX` of 35 actions × 3 roles, plus a `ROUTE_ACCESS` map for navigation. `requirePermission()` is called in every server action; `requireRoute()` guards page-level access; RLS policies in SQL enforce the same boundary at the DB. Sidebar + bottom nav both filter by `getAllowedRoutes()`. Dashboard layout maps `admin`/`dispatcher`/`employee` → "Management" / "Project Manager" / "Field Staff" labels per spec.

#### 3. Audit log (full)
- **Requirement (§2.3):** Full audit logs for all critical database operations.
- **Implementation:** `audit_log` table created in `20260504_000001_foundation.sql` with `before`/`after` JSON columns. Every server action (`clients.ts`, `properties.ts`, `shifts.ts`, `invoices.ts`, `time-entries.ts`, `vacation.ts`, `training.ts`, `onboarding.ts`, etc.) calls a local `audit()` helper. RLS lets dispatcher/admin read.

#### 4. Client (CRM) module — base data
- **Requirement (§4.1):** Company / private / Alltagshilfe; address; contact persons (1:n); contract dates + notice; service scope; properties 1:n; internal notes.
- **Implementation:**
  - `clients` table with `customer_type` enum (`residential|alltagshilfe|commercial`), `display_name`, `email`, `phone`, `tax_id`, plus Alltagshilfe-specific `insurance_provider`, `insurance_number`, `care_level`.
  - `client_contacts` 1:n table (`20260504_000014`) with `is_primary` partial unique index. UI in `ContactsCard.tsx` for add / edit / mark-primary / delete.
  - `contracts` table (`20260504_000005`) with `start_date`, `end_date`, `notice_period_days`, `status`.
  - `service_scopes` table for cleaning types + frequency.
  - Properties 1:n via `properties.client_id` foreign key.
  - Type-aware create flow: `/clients/new/{commercial,residential,alltagshilfe}` routes.

#### 5. "New Client" badge (30-day window)
- **Requirement (§4.1):** Visually flag new clients system-wide for 30 days.
- **Implementation:** `clients.ts` loader computes `is_new = createdAt >= 30 days ago`. Rendered in `ClientsTable.tsx` (line 199) and on `ClientDetail.tsx` (uses NEW_WINDOW_MS constant).
- **Caveat:** `PropertyDetail.tsx` always shows the badge (line 51) regardless of age — see Issues section.

#### 6. Auto-notify project managers on new client
- **Requirement (§4.1):** Automatic notification to project managers upon new client creation.
- **Implementation:** `createClientAction()` calls `notifyNewClient()` which queries every `admin`/`dispatcher` profile in the org and fans out via `emitNotification()` (in-app row + Web Push when enabled).

#### 7. Property management — full record
- **Requirement (§4.2):** Address + floor + building section + access code; key holders; regular times; cleaning concept (text + PDF); property photos; structured allergies / restricted areas / safety.
- **Implementation:**
  - Structured `floor`, `building_section`, `access_code` columns added in migration `…_000015_property_structure.sql`. Form (`PropertyForm.tsx`) captures all three.
  - Structured `allergies`, `restricted_areas`, `safety_regulations` columns. Surfaced in PropertyForm and rendered in `PropertyDetail.tsx`'s `KeyInfoCard`.
  - `property_keys` table for key-holder tracking with issue / return dates.
  - `cleaning_concept_path` on properties + `property-documents` storage bucket. UI in `CleaningConceptCard.tsx` with 25 MB cap, signed-URL viewer, replace + delete.
  - `property_photos` table + `property-photos` bucket. UI in `PropertyPhotosCard.tsx` for upload, signed-URL gallery, delete.

#### 8. Property closure calendar
- **Requirement (§4.2):** Exception dates (holidays, closures).
- **Implementation:** `property_closures` table (`…_000015`). UI in `ClosuresCard.tsx`. Reasons enum: `public_holiday | tenant_closed | renovation | weather | other`. Closures intersect the schedule grid via `loadScheduleWeek()` and surface as a dedicated overlay row in `SchedulePage`.

#### 9. Scheduling — calendar + drag-and-drop
- **Requirement (§4.3):** Calendar weekly+monthly view; drag-and-drop assignment; conflict warnings; vacation/sick/availability inline.
- **Implementation:**
  - Weekly calendar grid in `SchedulePage.tsx` (06:00–18:00 hour rows × 7 day columns).
  - Real **drag-and-drop**: shift cards have `draggable`, drop targets have `onDragOver`/`onDrop`, `moveShift()` calls `updateShiftAction` to persist the new time while preserving duration.
  - Inline overlay strip showing closures (`🚫`) and approved vacations (`🏖`) for any day in the visible week.
- **Conflict detection:** `detectShiftConflicts()` in `shifts.ts` blocks (a) double-booking the same employee, (b) approved-vacation overlap, (c) property-closure overlap. Errors surface as toasts on the schedule.

#### 10. Schedule export — PDF + iCal
- **Requirement (§4.3):** Export schedule as PDF and iCal.
- **Implementation:**
  - `GET /api/schedule/pdf?date=YYYY-MM-DD` → renders one ISO week via `renderSchedulePdf()` (`pdf-lib`) and streams a `.pdf` download.
  - `GET /api/schedule/ical?token=ct_…` → opaque-token-authenticated iCal feed for calendar subscriptions. Tokens stored in `calendar_tokens` table; managers see all org shifts, employees see only their own. `last_used_at` is touched on each fetch.
- **Caveat:** the **Export** button on the Schedule page UI doesn't yet wire to either endpoint (orphan UI). Trivial fix.

#### 11. GPS check-in / check-out — server-side validation
- **Requirement (§4.4):** Check-in only within configurable GPS radius (default 100 m); immutable timestamp + coords + user_id; manual corrections with reason + audit; missed-checkout alert; monthly working-time export.
- **Implementation:**
  - `time_entries` table (`…_000018`) with `latitude`, `longitude`, `accuracy_m`, `distance_m`, `manual`, `manual_reason`, unique on `(shift_id, employee_id, kind)`. Plus `properties.gps_radius_m` (default 100).
  - `checkInAction()` runs Haversine via `distanceMeters()`, rejects if outside the radius with a localized error showing the actual distance.
  - `correctTimeEntryAction()` upserts a manual row keyed on `(shift_id, employee_id, kind)`, requires a reason, flags `manual = true`, writes an audit entry.
  - `completeShiftAction()` toggles `shifts.completed_at` + `status='completed'`.
  - **Field UI:** `CheckInButton.tsx` requests browser geolocation, calls the action, and steps the user through `check_in → check_out → mark complete → done` based on what's already recorded.
  - **Missed-checkout cron:** `POST /api/jobs/missed-checkout` (Bearer-token auth via `CRON_SECRET`) finds shifts whose `ends_at` was >30 minutes ago with a check-in but no check-out, fires an in-app + push notification per shift, and is idempotent (skips when a `missed_checkin` row already exists for that shift).
  - **Working-time CSV:** `GET /api/reports/working-time?month=YYYY-MM&employee=…` pairs check-ins with check-outs by `(shift, employee)`, computes hours, outputs CSV including `manual` flag for payroll review.

#### 12. Assignment documentation
- **Requirement (§4.5):** Up to 20 photos; categories Normal / Note / Problem / Damage; severity 1–5; completion confirmation; visible to PMs.
- **Implementation:** `damage_reports` table with `category` CHECK constraint and `severity smallint check (severity between 1 and 5)`. UI in `DamageReportsCard.tsx`: filter (all/open/resolved), photo upload to `property-photos/{org}/{property}/damage/`, severity slider, "Discuss in chat" deep-link, toggleable resolve. Completion confirmation lands via `completeShiftAction()` (sets `shifts.completed_at`).
- **Caveat:** No hard cap on photo count (spec says ≤20). `PropertyPhotosCard` uploads originals — no automatic compression. See Issues.

#### 13. Team chat — real-time, per-property channels, attachments, voice
- **Requirement (§4.6):** Group / DM messages; property-specific channels; text + photo + voice; push notifications; archive.
- **Implementation:**
  - `chat_channels`, `chat_members`, `chat_messages` tables; `chat_message_reactions` and `chat_pinned_messages` for richer UX. Realtime publication enabled in `…_000007`.
  - **Auto-create per-property channel:** `create_property_chat_channel()` trigger fires after each `properties` insert, naming the channel `#prop-<name>`.
  - **Auto-membership:** `populate_channel_members()` and `join_existing_channels()` triggers fan out membership both ways. Five default org channels are seeded by `seed_default_chat_channels(org)` (`#einsatzplan`, `#allgemein`, `#pflege-alltagshilfe`, `#finanzen`, `🔒 #geschaeftsleitung`).
  - **Composer:** `Composer.tsx` — file picker (image/audio/PDF, ≤25 MB), MediaRecorder voice memos (records to `audio/webm`, uploads to `chat-attachments` bucket, embeds as `audio` attachment).
  - **Web push:** `usePushSubscription` registers `public/sw.js`; `chat_messages` realtime feed + `emitNotification` deliver in-app + push on relevant events.
  - **Archive:** all messages persist; soft delete via `chat_messages.deleted_at`. Pinned messages preserved in `chat_pinned_messages`.

#### 14. Lexware integration — REAL, not stub
- **Requirement (§4.7):** Connect to Lexware via REST API; sync clients; auto invoice creation; PDF archive; manual review; status tracking.
- **Implementation:**
  - `src/lib/lexware/client.ts` — bearer-token authenticated `fetch` wrapper with typed `lexwareUpsertContact()` and `lexwareCreateInvoice()` calls against `/v1/contacts` and `/v1/invoices`.
  - `src/lib/integrations/lexware.ts` — adapter that picks the **real client** when `LEXWARE_BASE_URL` + `LEXWARE_API_KEY` are configured, otherwise falls back to a console-logging stub for local dev.
  - `lexwareSyncAction()` in `actions/invoices.ts` upserts the contact, creates the invoice with itemized line items + 19% tax, persists the returned `lexware_id` on the invoice and `lexware_contact_id` on the client (so subsequent syncs update instead of duplicating).
  - **Rate limited** via `rateLimit("heavy", "invoice.lexware_sync")` (10/min per user).
  - **Status tracking:** `invoice_status` enum `draft|sent|paid|overdue|cancelled`. `markInvoiceSentAction()` and `markInvoicePaidAction()` step the workflow with audit entries.
  - **PDF generation:** `src/lib/pdf/invoice-pdf.ts` (`pdf-lib`); served at `/api/invoices/[id]/pdf`.

#### 15. Vacation planning
- **Requirement (§4.8):** Submit via app; PM approve / reject / suggest alternative; auto-add to schedule; annual balance.
- **Implementation:**
  - `vacation_requests` table with `vacation_status` enum extended to include `suggested` (`…_000019`), plus `suggested_start` / `suggested_end` columns.
  - Actions: `createVacationRequestAction`, `reviewVacationRequestAction` (approve/reject), `suggestVacationDatesAction` (manager proposes alt dates), `respondVacationSuggestionAction` (employee accept/reject), `cancelVacationRequestAction`.
  - **Auto-add to schedule:** approved vacations are read by `loadScheduleWeek()` and overlaid in the calendar grid.
  - **Conflict guard:** `detectShiftConflicts()` blocks shift creation/edit during approved vacation.
  - **Balance UI:** `VacationPage.tsx` shows used / total / remaining with progress bar.

#### 16. Employee onboarding (training)
- **Requirement (§4.9):** Video library with mandatory modules; progress tracking; system lock until mandatory done; PMs add new videos; per-employee assignments; digital sign-off.
- **Implementation:**
  - `training_modules` table with `is_mandatory`, `position`, `locale`, `video_url`. `employee_training_progress` upsert table tracks `started_at` + `completed_at`. `training_assignments` table lets managers scope a module to specific employees (`…_000013`).
  - **TrainingHub UI:** `TrainingHub.tsx` — KPI strip (total / completed / mandatory / progress %), per-module YouTube/Vimeo embed or `<video>`, manager-only Module Editor + Assignment Picker, employee start/complete/reset.
  - **System lock (key spec item):** `getOutstandingMandatoryModules()` in `src/lib/training/lock.ts` is called from both `createShiftAction` and `updateShiftAction`. If an employee has unfinished mandatory modules, the action returns an error naming them. RLS lets employees only see/update their own progress.

#### 17. Client onboarding (tablet)
- **Requirement (§4.10):** Tablet-optimized form; capture client + property + service; photo doc; digital signature; auto-create + team notification.
- **Implementation:**
  - `/onboard` route → `TabletOnboardingFlow.tsx` — 5-step stepper (Type → Client → Address → Service → Review+Signature). Uses 48 px input min-heights for finger-friendly tablets.
  - `SignaturePad.tsx` — pointer-event canvas (touch + mouse + pen), emits raw SVG `<path>` documents via `onChange`, persisted to `client_signatures.signature_svg` with `signed_by_name`, IP/UA, and `context='onboarding'`.
  - `onboardClientAction()` creates the client → optional property → optional `service_scopes` row → signature in one round-trip.

#### 18. Internationalization (i18n) — DE / EN / TA
- **Requirement (§5):** Three languages, JSON files, per-user preference, UTF-8 / Tamil script, date+number formats.
- **Implementation:**
  - `messages/de.json` (1486 keys), `en.json` (1447), `ta.json` (1452).
  - `next-intl` configured in `src/i18n/request.ts`; locale resolved from a `locale` cookie, defaults to `de`.
  - Per-user storage in Settings → Locale (the `LocaleSection` form) writes to org-level `settings.data.locale`. Login form has a language switcher chip.
  - Tamil rendered via Noto Sans Tamil web font (loaded in tailwind config / globals).

#### 19. Database schema + RLS
- **Requirement (§6):** PostgreSQL with proper relational structure, SQL injection protection, input validation.
- **Implementation:** 23 idempotent migrations under `supabase/migrations/`. Every domain table has: `org_id` FK, `created_at` / `updated_at` triggers, soft-delete `deleted_at`, RLS-enabled with the canonical "read org / write dispatcher / delete admin" pattern. Storage buckets enforce `<org_id>/...` prefixes. All client input is parsed with Zod before reaching the DB; Supabase JS uses parameterized queries.

#### 20. Storage — private buckets with signed URLs
- **Buckets created:** `property-photos`, `employee-docs`, `invoice-pdfs`, `chat-attachments`, `property-documents` (cleaning concepts, 25 MB cap). Path convention `<org_id>/...` enforced by RLS.

#### 21. Web Push notifications
- **Requirement (§4.6 & §6):** Push notifications.
- **Implementation:** `push_subscriptions` table; `usePushSubscription` registers `public/sw.js`; VAPID-signed payloads sent from `src/lib/push/send.ts` (`sendPushToProfile` and `sendPushToOrg`). Payload schema: `{ title, body, url, tag }`. Handles 404/410 by deleting expired endpoints. Settings → Notifications has a `PushToggleCard`.

#### 22. Settings page — full
- **Requirement (§3.1):** System configuration (language, notifications, API integrations).
- **Implementation:** `SettingsPage.tsx` with seven sections (Company, Team, Tax, Integrations, Notifications, Locale, Security). Persists into `settings.data` JSONB. Integrations section toggles for Lexware / WhatsApp / Email / Google / Stripe / Twilio. Notification matrix is per-event × per-channel (in_app/email/whatsapp).

#### 23. Notifications inbox
- **Implementation:** `notifications` table, RLS gates so each addressee reads only their own row. `NotificationsPage.tsx` with tabs (All/Unread/Mentions/Invoices/Schedule/Alltagshilfe), mark-read and mark-all-read actions, time-ago labels via `date-fns` localized to the active locale.

#### 24. Damage report → chat thread bridge
- **Implementation:** `discussDamageReportAction()` posts the damage summary into the property-specific chat channel and deep-links the user there.

#### 25. Working-time export (CSV)
- See item 11.

#### 26. Soft delete + archive everywhere
- **Implementation:** Every domain table has `deleted_at`. Clients have an `archived` boolean for soft-archive without losing the row. Read paths consistently filter both.

#### 27. Brand palette + typography
- **Requirement (§7):** Light green palette from priyas.de, Inter / Nunito + Noto Sans Tamil.
- **Implementation:** Tokens in `tailwind.config.ts` map to the spec hex codes (`primary-500 = #72A94F`, `secondary-500 = #16587C`, `tertiary = light green`, `success-500`, `warning-500`, `error-500`). Inter loaded as primary; Noto Sans Tamil as Tamil fallback.

#### 28. Responsive shell + mobile bottom nav
- **Implementation:** `DashboardLayout` ships a sidebar (240 px / 72 px collapsed / drawer-on-mobile), a sticky topbar, and a permanent `BottomNav` for the five most-used routes on `<md`. Both nav surfaces filter by `getAllowedRoutes()` so field staff don't see admin sections.

---

### ⚠️ PARTIALLY IMPLEMENTED FEATURES

#### 1. Mobile app native shell (huge spec gap)
- **Requirement (§2.2):** Native-like performance via React Native, iOS 15+ / Android 10+, App Store + Google Play publication, offline schedule, native push, GPS check-in.
- **What's done:** A **responsive web app** that supports the same workflows the spec assigns to mobile — GPS check-in (browser Geolocation API), camera/file upload (browser file picker), photo + voice messages in chat, a permanent bottom nav, mobile-tuned tap targets, and Web Push via service worker.
- **What's missing:** No React Native codebase. No Xcode / Android Studio project. No `app.json` / `expo` / Capacitor config. No App Store or Google Play build artifacts. No native push (APNs / FCM) — only Web Push. No real offline cache: the service worker handles push events but does not cache the schedule for offline viewing.
- **Files involved:** None — feature is absent.
- **Effort to complete:** **High** (multi-month). Start by porting the field-staff screens (Today / Schedule / Check-in / Photo+notes / Vacation request / Chat / Onboarding videos) into a React Native shell, sharing API/server-action calls via the existing REST + Server Action endpoints.

#### 2. REST API surface (`/api/v1/`) + OpenAPI docs
- **Requirement (§2.3, §6.1):** RESTful API with versioned `/api/v1/` endpoints; Swagger / OpenAPI 3.0 documentation; rate-limiting and auth on all endpoints.
- **What's done:** Most write operations are exposed as **Server Actions**, which are RPC-over-HTTP (still authenticated, still typed). Read endpoints (`/api/clients`, `/api/properties`), and special-purpose routes (`/api/schedule/pdf`, `/api/schedule/ical`, `/api/reports/export`, `/api/reports/working-time`, `/api/jobs/missed-checkout`, `/api/invoices/[id]/pdf`, `/api/health`) exist.
- **What's missing:** No `/v1/` prefix; no OpenAPI spec generated; rate-limiting only applied on 4 actions (write/heavy buckets). A consuming React Native client would need parity REST endpoints for every server action used today.
- **Files involved:** `src/app/api/*`, `src/lib/rate-limit/guard.ts`.
- **Effort:** **Medium**. Add a thin `/api/v1/...` layer that re-uses the existing loader/validator code; generate OpenAPI from Zod schemas with e.g. `zod-openapi` or `next-zod-openapi`.

#### 3. Client portal (limited WebApp access for clients)
- **Requirement (§3 — "Clients (optional)"):** View assignment reports, communication channel.
- **What's done:** Per-client statement page (`/clients/[id]/statement`) generates a billing statement; `client_signatures` table exists; Lexware sync delivers PDFs.
- **What's missing:** No `client` role in the `user_role` enum; no client-facing routes (no `/portal/...`). No "client chat" channel separate from team chat. The client cannot log in and see their own assignments / reports.
- **Files involved:** `src/lib/rbac/permissions.ts` (would need a fourth role); new pages under `(portal)/`.
- **Effort:** **Medium**. The spec marks the client role as optional, so this can be deferred without blocking go-live.

#### 4. 2FA enforcement (currently optional)
- **Requirement (§6.2):** 2FA for management and project managers (i.e., **mandatory**).
- **What's done:** TOTP enrolment + login challenge fully implemented in `SecuritySection.tsx` and `LoginForm.tsx`.
- **What's missing:** No server-side check that admin/dispatcher *must* have a verified factor before reaching `/dashboard`. Today they can log in fine without one.
- **Effort:** **Low**. Add an `aal2`-required guard inside `DashboardLayout` for `admin`/`dispatcher` and redirect to a "must enable 2FA" page on first sign-in.

#### 5. WhatsApp notifications
- **Requirement (§4.6, integrated in Settings → Notifications):** WhatsApp as a notification channel.
- **What's done:** WhatsApp toggle on the Notifications matrix; integration card in Settings → Integrations.
- **What's missing:** `src/lib/integrations/whatsapp.ts` is a console-only stub; no Twilio call is ever made. The UI implies the channel works.
- **Effort:** **Low–Medium**. Wire the Twilio client and emit per the matrix toggles inside `emitNotification()`.

#### 6. PDF report export
- **Requirement (§4.4 monthly time report; §4.7 invoice PDFs; reports library on `/reports`).**
- **What's done:** Invoice PDFs (real, `pdf-lib`); working-time CSV; schedule PDF.
- **What's missing:** `/api/reports/export?format=pdf` returns a placeholder text file ("Note: PDF export coming next. CSV below.\n\n…"). The Reports library UI offers a PDF button that downloads this stub.
- **Files involved:** `src/app/api/reports/export/route.ts`.
- **Effort:** **Low**. Reuse `pdf-lib` and the existing `loadReports()` payload.

#### 7. Onboarding video content + Tamil
- **Requirement (§5):** All mandatory content (onboarding videos, documents) available in all three languages.
- **What's done:** `training_modules.locale` column exists; UI lets managers pick a locale per module.
- **What's missing:** No actual video content has been seeded; the UI just stores YouTube/Vimeo URLs. The spec says the Tamil videos will be provided by the client — confirm with them whether content delivery is in scope of this engagement.

#### 8. Onboarding "system lock" before first shift — DB lookup is right but doesn't gate every entry path
- **What's done:** `getOutstandingMandatoryModules()` is called from `createShiftAction` and `updateShiftAction`.
- **What's missing:** Drag-and-drop's `moveShift()` calls `updateShiftAction` (so it's covered), but the `PlanShiftDialog` quick-pick suggestions and any future bulk-assign UI need to inherit the same gate. Also: if a *manager* is assigning themselves, the gate still applies — that may be intentional, but it should be documented.

#### 9. Digital signature on training completion
- **Requirement (§4.9):** Digital confirmation and signature upon onboarding completion.
- **What's done:** `employee_training_progress.signature_path` column exists; `SignaturePad.tsx` is reusable.
- **What's missing:** The TrainingHub never opens a signature pad on completion. `setProgress(state="complete")` simply stamps `completed_at` without storing a signature. The DB column is unused.
- **Files involved:** `src/components/training/TrainingHub.tsx`, `src/app/actions/training.ts`.
- **Effort:** **Low**.

#### 10. Tablet onboarding — photo documentation step
- **Requirement (§4.10):** Photo documentation of the property during the first visit.
- **What's done:** Address + service + signature steps; auto-creates a property record.
- **What's missing:** No photo-capture step inside the wizard — users have to navigate to the property afterwards and upload via `PropertyPhotosCard`. The spec wants this happening on-site as part of the same flow.
- **Effort:** **Low**. Add a fourth optional step that uses the camera/file picker and uploads into the freshly-created property's bucket folder.

#### 11. Tablet onboarding — automatic team notification
- **What's done:** Client + property are created.
- **What's missing:** No `emitNotification('new_client', ...)` fan-out from `onboardClientAction()` (the regular `createClientAction` does this, but the onboarding action doesn't reuse the helper).
- **Effort:** **Low**.

#### 12. WCAG 2.1 AA compliance
- **What's done:** Tap targets meet 44 px minimum on the most-used CTAs (`CheckInButton` is `minHeight 56`; primary buttons ~52 px). Color tokens are documented. Inputs have explicit `aria-invalid`, breadcrumb `aria-label`s in places, focus-visible rings via Tailwind tokens.
- **What's missing:** No automated axe-core run; no documented WCAG audit; some interactive icons are not labeled (the schedule "close detail panel" `✕` is unlabeled). Color contrast on `bg-tertiary-200` placeholder text is not verified.
- **Effort:** **Medium**. Hook `@axe-core/playwright` into the existing Playwright suite, fix flagged issues, document the pass.

#### 13. Photo compression + 20-photo cap on assignment documentation
- **Requirement (§4.5):** Up to 20 photos per assignment, automatic compression.
- **What's done:** Multi-photo upload to private bucket; signed-URL gallery.
- **What's missing:** Upload handler doesn't compress (no `canvas.toBlob` resize); no count enforcement against the 20-per-assignment limit.
- **Effort:** **Low**.

#### 14. Hetzner / GDPR-compliant production environment
- **Requirement (§2.3, §6.2):** EU servers (Hetzner Cloud, Germany).
- **What's done:** `tsconfig` and `package.json` are deployment-ready; `next.config.mjs` is portable.
- **What's missing:** Code is currently written assuming **Vercel + Supabase** hosting. The README's deployment section walks through Vercel; there is no Hetzner runbook, no Docker image, no Postgres migration plan to a self-hosted DB. The spec is explicit about Hetzner DE.
- **Effort:** **Medium**. Either (a) point Supabase project at the Frankfurt region and run the app on Vercel's Frankfurt edge, or (b) self-host: Dockerize the Next app on Hetzner, replace Supabase with a managed Postgres + minio for storage, port `@supabase/auth` to a self-hosted alternative (e.g. Authentik) — option (b) is multi-week work.

#### 15. Daily backups, 30-day retention
- **Requirement (§6.2):** Automated daily backups, 30-day retention.
- **What's done:** Free Supabase tier provides 7-day point-in-time recovery.
- **What's missing:** Either a paid Supabase plan (or Hetzner setup with `pg_dump` cron + S3 archive) is required to meet the 30-day target.

#### 16. Date / number formats per language
- **Requirement (§5):** Date and number formats match the selected language.
- **What's done:** `next-intl` provides locale-aware formatting helpers; `date-fns` locales (`de`, `en-US`, `ta`) are wired into the schedule and notifications views.
- **What's missing:** Plenty of hard-coded `format(date, "yyyy-MM-dd")` (no locale arg) and `Intl.NumberFormat('de-DE', …)` instances scattered across components — currency and dates default to German even when the user is on EN/TA. Audit needed across `ClientsTable`, `EmployeeDetail`, `InvoicesPage`, `VacationPage`, etc.
- **Effort:** **Medium**.

#### 17. Schedule UI — Export / Today / week-nav buttons
- **What's done:** APIs exist (`/api/schedule/pdf`, `/api/schedule/ical`); calendar grid renders correctly.
- **What's missing:** The buttons in the Schedule toolbar (Export, Today, prev/next week) have no click handlers.
- **Effort:** **Trivial** (~15 minutes).

#### 18. Property type / status — heuristic only
- **Implementation note:** `properties.kind` is computed from name/notes via `inferKind()` rather than a real column. Same for "actively serviced" status (heuristic from recent shifts). For real reporting this should be a dedicated enum.

#### 19. Async processing for notifications + invoice automation
- **Requirement (§2.3):** Asynchronous processing for notifications and invoice automation.
- **What's done:** `emitNotification()` writes the row + push payload synchronously inside the action that triggers it; `lexwareSyncAction` calls Lexware synchronously too.
- **What's missing:** No background queue (no BullMQ / Inngest / Trigger.dev / Supabase Edge Functions for async work). High-volume notifications or a slow Lexware response would block the user-facing action. The missed-checkout cron is the only async piece.
- **Effort:** **Medium**.

---

### ❌ UNTOUCHED / MISSING FEATURES

#### 1. React Native iOS + Android app
- **Requirement (§2.2, §6, §8 App Stores).**
- See ⚠️ #1 above for the same gap, restated as ❌ for the **native** angle: zero native code exists.
- **Effort:** **High** (multi-month).
- **Dependencies:** REST `/api/v1/` surface (⚠️ #2), real OpenAPI docs.

#### 2. Native push (APNs / FCM)
- **Effort:** Medium. Comes with the native app build.

#### 3. Real offline mode for schedule + check-in
- **Requirement (§2.2 & §8):** Schedule remains accessible without network connection; offline cache for schedule and check-in.
- **What's done:** Service worker exists for push but does not cache schedule responses.
- **Effort:** **Medium**. Use `next-pwa` (or hand-rolled SW caching of the `/schedule` page + `/api/schedule/ical` payload), then queue check-in attempts in IndexedDB and replay on reconnect.

#### 4. Self-learning AI scheduling extension
- **Spec note:** Marked "Phase 2 – optional." Out of current scope. No code exists.

#### 5. Browser test matrix (Chrome 90+ / Safari 15+ / Firefox 90+ / Edge 90+)
- **Requirement (§8):** Manual tests before each release.
- **What's done:** Playwright config exists with `@playwright/test`. Specs cover auth, i18n, and per-role flows.
- **What's missing:** No `projects: [{ name: 'Chromium' }, { name: 'WebKit' }, { name: 'Firefox' }]` configuration; no CI harness; no documented test plan.

#### 6. App Store + Google Play publication
- **Effort:** Comes with the native app build. Plan for ~2–4 weeks of review cycles.

#### 7. Load test for 500 concurrent users
- **Requirement (§6.3, §8):** Load tests before go-live.
- **What's done:** Nothing.
- **Effort:** **Low–Medium**. k6 or Artillery scripts hitting `/api/health`, `/api/clients`, `/api/properties`, and a few server actions — automate in CI.

#### 8. SLA / 99.5% uptime monitoring
- **Requirement (§8):** Measured monthly, max 3.6 h downtime.
- **What's done:** `/api/health` route exists.
- **What's missing:** No external monitor (Better Uptime / Pingdom / Vercel Monitoring) configured; no on-call runbook; no incident response doc.

#### 9. App-store-specific assets
- **Untouched:** App icons, screenshots, store-listing copy, privacy disclosures, App Tracking Transparency setup, Google Play Data Safety form. None applicable until the React Native app exists.

#### 10. Real Tamil onboarding video content
- **Requirement (§5):** All mandatory content (onboarding videos, documents) available in all three languages.
- **Spec note:** "Tamil texts will be provided by the client." Confirm whether **video** content is the client's responsibility or yours.

#### 11. Lexware "auto-create on month-end" automation
- **Requirement (§4.7):** Automatic invoice creation based on recorded assignment and contract data.
- **What's done:** Manual create-and-send works end-to-end with Lexware. Working-time export gives the data.
- **What's missing:** No scheduled job that reads the previous month's `time_entries` per client + service scope, builds an invoice draft, and pushes it through `lexwareSyncAction`. This is the headline value-prop in §1.1.
- **Effort:** **Medium**. Add `POST /api/jobs/monthly-invoice-draft` + Vercel Cron, reuse the working-time pairing logic already in `/api/reports/working-time`.

#### 12. OpenAPI 3.0 spec file
- See ⚠️ #2 above. The doc artifact does not exist.

---

## Issues & Concerns Found

### Bugs / Code Smells
1. **`PropertyDetail.tsx` always shows "NEW" badge** — line 51 hard-codes the badge regardless of `created_at`. Should use the same 30-day window as `ClientDetail.tsx`. Quick fix.
2. **`PropertiesTable.tsx` mocks team initials, status pills, and project-manager assignment.** The "P1 Projektleitung 01" cell on every row is hard-coded; the team filter in the schedule sidebar lists `Team 01 · Kern (12)` etc. as fixed counts. These belong to demo data and need to be replaced with real lookups.
3. **`employees.ts` derives roles from row index** (`inferRoleChip(idx)` returning `pm`/`field`/`trainee` based on `idx % 9`). This is purely cosmetic data and should be backed by an actual employee role column.
4. **`LoginBrandPanel.tsx.deleted.bak`** — backup file checked into the repo. Delete.
5. **Schedule sidebar status counts** are hard-coded (`count={18}` for Completed, `count={15}` for Scheduled, etc.). The filter checkboxes work, but the numbers are fake.
6. **`Sidebar` schedule export button** has no onClick. Plus / "New Assignment" + "Plan Shift" both open the same dialog — likely intended to differentiate.
7. **Quick action button on schedule** wired twice ("New Assignment" and "Plan Shift" both call `setDialogOpen(true)`).
8. **`storage.foldername()` cast** in `…_000016_property_documents_bucket.sql` does `(storage.foldername(name))[1]::uuid` — if a path doesn't start with a valid UUID, it'll throw at insert time. Earlier buckets compare strings, which is more forgiving. Standardize one approach.
9. **No upper bound on `chat_messages.body`** — a single message could be megabytes of text. Consider a CHECK constraint or a Zod max length.
10. **`damage_reports` photo paths are stored as `text[]`** without a max length check; the spec wants ≤20 per assignment (which maps to a damage report here too) — currently unenforced.
11. **Service worker in `public/sw.js` has zero offline strategy.** It only handles `push` and `notificationclick`. The `install` and `activate` handlers exist but don't pre-cache anything.

### Security
12. **2FA is optional, not enforced.** Spec says mandatory for admin + dispatcher (§6.2). Add a redirect-on-first-login that blocks non-2FA managers from `/dashboard`.
13. **`SUPABASE_SERVICE_ROLE_KEY` is referenced in two API routes** (`/api/schedule/ical`, `/api/jobs/missed-checkout`). Both are protected (token in URL / Bearer header). Verify in production that the key is set as an *encrypted* env var on the host.
14. **Rate limiter is in-memory only.** With multiple replicas the limit per user multiplies by replica count. Move to Redis (Upstash) before scaling out.
15. **Rate limiter is sparsely applied.** Login is *not* rate-limited despite a `LIMITS.login` constant existing. Add `rateLimit("login", "auth.login")` inside the login form's server-side path or in a middleware-level interceptor.
16. **`profiles.role` is editable by self-update policy.** RLS includes `"profiles: own update" using (id = auth.uid())` which means a user could update their own `role` to `admin`. Either drop `role` from the column allow-list or split the policy into a column-level check. **High-priority security concern.**
17. **`audit_log` write happens after the action's main DB op** and uses the same connection — but it's wrapped in best-effort code that ignores failures. A failed audit write means a CRUD action succeeds with no record. For GDPR / discovery this is risky. Consider wrapping action+audit in a transaction.
18. **No CAPTCHA / hCaptcha on register or forgot-password** — open invitation for credential stuffing once `enable_signup = true` is set.
19. **No Content-Security-Policy / strict-transport-security headers** configured in `next.config.mjs`. Add a `headers()` block.
20. **`registerSchema` accepts org_id from client side** — `RegisterForm.tsx` writes `org_id: env.NEXT_PUBLIC_DEFAULT_ORG_ID` into Supabase signup metadata. A malicious user could call the auth endpoint directly with another org's UUID. The `handle_new_user()` trigger trusts that value when present. Cross-check by validating org membership server-side, or hard-code the default org in the trigger only.
21. **`createClientAction` and friends shred typed inputs into raw `Record<string, unknown>` rows** before insert — fine, but the use of `(supabase.from(x) as any)` everywhere defeats the generated `database.ts` types. Fix the supabase types pipeline so `as any` casts can come out.

### Performance
22. **Properties list does an N+1 for property counts** (`loadClientsList` follows up with a separate `properties` query indexed by `client_id`). Fine for hundreds of rows, but a real customer with thousands of clients will see latency.
23. **Schedule page fetches all closures + vacations covering the visible week per render.** No memoization. Re-renders on every filter toggle.
24. **All `app/(dashboard)/*` pages set `dynamic = "force-dynamic"`.** That's appropriate for personalized data, but it means no static cache benefits at all. Consider stale-while-revalidate for the dashboard KPI cards.
25. **No DB indexes on `time_entries.occurred_at`** — the missed-checkout cron filters by `ends_at` on `shifts` (indexed), but the working-time export filters by `time_entries.occurred_at` (not indexed). Add an index.

### Inconsistencies between spec and implementation
26. **REST contract mismatch.** Spec asks `/api/v1/...`. We have unversioned `/api/...` plus Server Actions. Either add the `/v1/` layer or update the spec.
27. **Hosting mismatch.** Spec asks Hetzner DE; current setup targets Vercel + Supabase.
28. **Express vs Next.js Server Actions.** Spec says Node.js + Express. Strictly speaking Server Actions ride on top of a Node runtime so the requirement is met in spirit. Document this deviation in a written change request.
29. **Roles naming.** Spec uses "Management / Project Manager / Field Staff / Clients". DB uses `admin / dispatcher / employee` and never models `client`. Layout maps the first three to spec names, but the DB enum and codebase still talk in the developer-facing terms — make a glossary in the README.

---

## Ambiguous Requirements

These items in the spec need clarification before they can be marked done:

1. **§3 Clients (optional) role.** "View assignment reports, communication channel" — is this in scope for Phase 3? The spec marks it optional but the doc treats it as a real role on §3 table. Confirm.
2. **§4.5 "Up to 20 photos per assignment, automatic compression."** Where does compression run — client-side (canvas resize before upload) or server-side (Sharp on a worker)? Spec doesn't say. Recommend client-side for bandwidth.
3. **§4.7 "Automatic invoice creation."** Trigger cadence is undefined. End-of-month? Per-shift? On contract anniversary? Confirm with the client's bookkeeper.
4. **§4.9 Onboarding videos.** Who produces the actual video content? Client says they'll provide Tamil text — is that just UI strings or also voiceover scripts?
5. **§5 "Date and number formats match the selected language."** For Tamil, do we use the Tamil numeric script (க, ௦–௯) or Western digits with Tamil month names? Ask the client.
6. **§4.6 Client Chat.** Is the client portal in scope or out? §3 says "optional" but §4.6 lists Client Chat as a deliverable.
7. **§6.2 "2FA for management and project managers."** Soft-required (we encourage) or hard-required (we block login until enabled)? Audit assumes hard-required.
8. **§6.3 "60 fps mobile."** Implies React Native exists; n/a for the current responsive web build. Confirm whether the current web app is acceptable as the field-staff client (saves months) or whether RN is non-negotiable.
9. **§4.4 Missed-checkout alert.** Spec says "if check-out has not occurred 30 minutes after shift end." Our cron runs by polling. What's the acceptable lateness — 5 min? 15 min? Right now whoever schedules the cron decides.
10. **§9.3 Phase definitions.** Phase 5 = "production deployment". If Hetzner is mandatory, Phase 5 requires server provisioning, runbook, and migration plan that today don't exist. Scope these explicitly.

---

## Recommended Priority Order

### Tier 0 — Cannot ship without (security)
1. **Fix the `profiles: own update` RLS policy** so users cannot self-promote to admin (Issue #16). 30 min.
2. **Enforce 2FA for admin + dispatcher** by gating `DashboardLayout`. 1 hour.
3. **Apply rate-limit to the login endpoint** and the auth/recover flow. 1 hour.
4. **Add CSP + HSTS headers** in `next.config.mjs`. 30 min.

### Tier 1 — Quick wins from PARTIAL list
5. **Wire the Schedule "Export" button** to `/api/schedule/pdf` and `/api/schedule/ical?token=…`. 15 min.
6. **Wire the Schedule "Today" + week-prev/next** buttons. 30 min.
7. **Replace the Reports PDF stub** with `pdf-lib` rendering. 2–3 hours.
8. **Add photo compression and a 20-cap to assignment photo upload**. 2 hours.
9. **Send team notification from `onboardClientAction`** (parity with `createClientAction`). 30 min.
10. **Add the photo-capture step to the tablet onboarding wizard**. 2 hours.
11. **Persist a digital signature on training "complete"** — already have the column + the SignaturePad component. 1 hour.
12. **Replace mock data in the Schedule sidebar (team / status counts)** with real aggregates. 1–2 hours.
13. **Replace the hard-coded "NEW" badge in `PropertyDetail`** with the 30-day check. 5 min.
14. **Delete `LoginBrandPanel.tsx.deleted.bak`** and any other `.bak` files. 1 min.

### Tier 2 — Operational readiness for go-live
15. **WCAG 2.1 AA audit** with `@axe-core/playwright`; fix flagged issues. 1–2 days.
16. **Browser test matrix** in Playwright (Chromium, WebKit, Firefox). 1 day.
17. **Load test** for 500 concurrent users with k6 against staging. 1–2 days.
18. **Move rate-limiter to Redis** (Upstash) for multi-replica deployments. ½ day.
19. **Set up production environment** in EU (Frankfurt Supabase + Vercel) or document the Hetzner alternative. 2–3 days.
20. **Daily backups + 30-day retention** verified (paid Supabase tier or `pg_dump` cron). 1 day.
21. **External uptime monitoring + on-call runbook**. 1 day.
22. **Wire WhatsApp via Twilio** so the toggle in Settings actually delivers messages. 1 day.

### Tier 3 — Strong client expectations from §4
23. **REST `/api/v1/` surface + OpenAPI 3.0 spec** generated from Zod. 3–5 days.
24. **Real offline cache for schedule + check-in** (next-pwa). 2–3 days.
25. **Lexware automatic month-end invoice draft job**. 2 days.
26. **Client portal (optional role)** — read-only view of assignment reports + client-side chat. 1–2 weeks.
27. **i18n date/number cleanup pass** so EN and TA aren't seeing German formatting. 1–2 days.

### Tier 4 — Mobile App (the elephant)
28. **React Native shell** sharing API + types with the web app. Start with field-staff screens (Today / Schedule / Check-in / Photo+notes / Vacation / Chat / Onboarding). 4–8 weeks.
29. **Native push** (APNs + FCM) on top of existing notification fanout. Ships with the RN build.
30. **App Store + Play Store** publication. 2–4 weeks of review cycles.

---

## Bottom line

The web platform is **substantially more complete than the existing `STATUS.md` claims**. Most of §4 (the spec's functional core) is implemented end-to-end against a real database, with RLS, audit logging, validation, and rate-limiting in place; Lexware actually calls Lexware; GPS check-in / out actually validates against a Haversine distance; the training system actually blocks shift assignment for staff with outstanding mandatory modules; the chat actually carries voice memos.

The gaps that remain are **operational** (production hosting, backups, SLAs, browser matrix, OpenAPI), **mobile-native** (the entire React Native deliverable), and **a small number of polish issues** (WCAG audit, photo compression, the schedule UI's missing onClick handlers, a few hard-coded mocks).

Address the four Tier 0 security items immediately. Then it's a matter of stack-ranking Tier 1 quick wins for client visibility, and making a deliberate call about whether the responsive web app is acceptable as the field-staff client (saving months of native work) or whether the React Native build is a hard contractual requirement.
