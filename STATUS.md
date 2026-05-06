# Requirements Audit — Priya's Cleaning Service

Mapped against the `Requirements_Specification_Priyas_Cleaning_Service` doc
(Version 1.0, March 2026). Status legend:

- ✅ **Shipped** — feature works end-to-end
- ⚠️ **Partial** — some pieces exist, gaps below
- ❌ **Not built** — missing entirely

---

## Big picture

| Phase                   | Status | Notes                                                |
| ----------------------- | ------ | ---------------------------------------------------- |
| Phase 1 — Design        | ✅      | Tokens extracted, design system in Tailwind          |
| Phase 2 — MVP Backend   | ✅      | Schema, API, auth, RBAC, audit log all in place      |
| Phase 3 — WebApp        | ⚠️      | All 18 prototype screens shipped; gaps below         |
| Phase 4 — Mobile App    | ❌      | Not started — would need React Native rebuild        |
| Phase 5 — Go-Live       | ❌      | No production deploy, no load test, no SLA          |

**Headline:** WebApp side is roughly 85% of spec. Mobile App side is 0%.
The big missing functional area is GPS check-in/out (§4.4), which the doc
puts squarely in the Mobile App.

---

## §2 — System Architecture

| Item                       | Status | Notes                                                                                                |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| WebApp (browser, SPA)      | ✅      | Next.js 14 App Router — equivalent to spec's "React.js SPA"                                          |
| Mobile App (iOS + Android) | ❌      | Spec wants React Native; we have responsive web only                                                 |
| Backend & REST API         | ⚠️      | Functionally complete via Server Actions + Supabase. Spec asks Node+Express + `/api/v1/` versioning |
| JWT auth                   | ✅      | Via Supabase Auth                                                                                    |
| RBAC                       | ✅      | `requirePermission()` matrix, RLS at DB level                                                        |
| Async processing           | ⚠️      | Notifications fire synchronously inside actions; no background queue                                 |
| Audit log                  | ✅      | `audit_log` table written from every CRUD action                                                     |
| GDPR / EU storage          | ⚠️      | Possible — Supabase has EU regions, but the project must be created in Frankfurt/Ireland             |

---

## §3 — User Roles

| Role             | Spec name        | Internal name | Status |
| ---------------- | ---------------- | ------------- | ------ |
| Management       | full access      | `admin`       | ✅      |
| Project Manager  | scheduling+more  | `dispatcher`  | ✅      |
| Field Staff      | mobile-only      | `employee`    | ✅      |
| Client (optional)| view-only portal | —             | ❌      |

The spec marks the Client role as optional. We didn't build it.

---

## §4.1 — CRM / Client Management

| Item                                        | Status | Notes                                                                   |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Company / individual + address + legal form | ✅      |                                                                         |
| Contact persons                             | ⚠️      | One `contact_name` per client. Spec implies a 1:n contact table         |
| Contract start, duration, notice periods    | ✅      | `contracts` table                                                       |
| Scope of services                           | ✅      | `service_scopes` table                                                  |
| Properties 1:n                              | ✅      | `client_id` foreign key on properties                                   |
| Internal notes                              | ✅      |                                                                         |
| "New Client" badge for 30 days              | ❌      | No badge in the UI                                                      |
| Auto-notify PMs on new client               | ⚠️      | `notifications` table exists; trigger from `createClientAction` missing |
| Change log                                  | ✅      | `audit_log`                                                             |

---

## §4.2 — Property Management

| Item                                              | Status | Notes                                                          |
| ------------------------------------------------- | ------ | -------------------------------------------------------------- |
| Address                                           | ✅      |                                                                |
| Floor, building section, access code              | ⚠️      | Stuffed into `notes`; no dedicated columns                     |
| Key management                                    | ✅      | `property_keys` table                                          |
| Regular assignment times                          | ✅      | Via shifts                                                     |
| Exception dates (holidays, closures)              | ❌      | No closure calendar                                            |
| Cleaning concept text + PDF upload                | ⚠️      | Text yes (notes); PDF upload not wired                         |
| Photo documentation                               | ✅      | `property-photos` Storage bucket + gallery                     |
| Special notes (allergies, restricted, safety)     | ⚠️      | One free-text `notes` field; spec wants structured categories  |

---

## §4.3 — Scheduling

| Item                                          | Status | Notes                                                       |
| --------------------------------------------- | ------ | ----------------------------------------------------------- |
| Calendar weekly + monthly                     | ⚠️      | Weekly is solid; monthly view is light                      |
| Drag-and-drop assignment                      | ❌      | Click-to-assign modal works; no DnD                         |
| Conflict warnings (double-book, absence)      | ⚠️      | Validator catches some; no rich UI warning                  |
| Vacation/sick/availability inline             | ⚠️      | Approved vacation isn't visualized on the schedule grid     |
| Export PDF + iCal                             | ❌      | No export                                                   |
| AI scheduling extension (Phase 2 optional)    | ❌      | Explicitly out of scope for now                             |

---

## §4.4 — GPS Check-in / Check-out  ⚠️ **MAJOR GAP**

| Item                                          | Status | Notes                                                       |
| --------------------------------------------- | ------ | ----------------------------------------------------------- |
| GPS-bounded check-in (default 100m)           | ❌      | No GPS UI anywhere                                          |
| Immutable timestamp + coords + user_id        | ❌      | Schema for `time_entries` may exist but isn't wired         |
| Manual corrections w/ reason + audit          | ❌      |                                                             |
| Auto-alert if no check-out 30 min after end   | ❌      | No scheduler / cron                                         |
| Monthly working-time report, exportable       | ❌      | Reports module shows KPIs but not per-employee hours export |

This whole subsystem is unbuilt. It's the biggest functional gap.
Implementing it on the WebApp alone is awkward (people don't want to log
into a browser at the property to clock in) — this is why the spec puts
it on the Mobile App.

---

## §4.5 — Assignment Documentation

| Item                                   | Status | Notes                                                         |
| -------------------------------------- | ------ | ------------------------------------------------------------- |
| Up to 20 photos per assignment         | ✅      | No hard cap, but practical                                    |
| Categories: Normal/Note/Problem/Damage | ✅      | Damage Reports module                                         |
| Damage reports w/ severity 1–5         | ✅      |                                                               |
| Staff completion confirmation          | ❌      | Shifts have no "I'm done" toggle                              |
| Immediately visible to PMs             | ✅      | RLS lets dispatchers + admins read all                        |

---

## §4.6 — Communication

| Item                                  | Status | Notes                                                              |
| ------------------------------------- | ------ | ------------------------------------------------------------------ |
| Team chat group + DM                  | ✅      |                                                                    |
| Property-specific channels            | ✅      | Auto-created via DB trigger when a property is inserted            |
| Text + photo + voice messages         | ✅      | Just shipped — composer has file picker + MediaRecorder            |
| Mobile push notifications             | ⚠️      | Web Push works; no native React Native pushes (no mobile app)      |
| Client Chat (separate area)           | ❌      | Whole Client portal is missing                                     |
| Archived                              | ✅      |                                                                    |

---

## §4.7 — Automated Invoicing (Lexware)

| Item                                       | Status | Notes                                                                 |
| ------------------------------------------ | ------ | --------------------------------------------------------------------- |
| Auto-create invoice from data              | ⚠️      | Manual creation works; "auto from shifts at month-end" not wired      |
| Lexware client master sync                 | ❌      | The button is a stub — `lexwareSyncAction` doesn't call Lexware       |
| PDF generation + archiving                 | ✅      | `pdf-lib` based                                                       |
| Manual review before approval              | ✅      | Draft → sent → paid status flow                                       |
| Status: open / sent / paid / overdue       | ✅      |                                                                       |

Lexware is the largest external integration in the doc. We have all the
hooks; we'd need real Lexware credentials + REST calls to make it work.

---

## §4.8 — Vacation Planning

| Item                                       | Status | Notes                                                       |
| ------------------------------------------ | ------ | ----------------------------------------------------------- |
| Submit via app                             | ✅      | Web only — no mobile app                                    |
| PM approve / reject                        | ✅      |                                                             |
| Suggest alternative dates                  | ❌      | Not modelled                                                |
| Auto-add to schedule                       | ❌      | Schedule view doesn't read from `vacation_requests`         |
| Annual balance overview                    | ✅      | KPI strip                                                   |

---

## §4.9 — Employee Onboarding (Training)

| Item                                       | Status | Notes                                                       |
| ------------------------------------------ | ------ | ----------------------------------------------------------- |
| Video library w/ mandatory modules         | ✅      |                                                             |
| Progress tracking                          | ✅      |                                                             |
| **System lock until mandatory done**       | ❌      | Shift creation doesn't check training_progress              |
| PMs add new videos                         | ✅      |                                                             |
| Per-employee assignments                   | ✅      | Just added                                                  |
| Digital signature on completion            | ❌      | Signature pad exists but not wired to onboarding-complete   |

---

## §4.10 — Client Onboarding (Tablet)

| Item                                       | Status | Notes                                                       |
| ------------------------------------------ | ------ | ----------------------------------------------------------- |
| Tablet-optimized form                      | ✅      | `/onboard` flow                                             |
| Capture client + property + service        | ✅      |                                                             |
| Photo doc on first visit                   | ⚠️      | Not in onboarding wizard; user goes to property after       |
| Digital client signature                   | ✅      | Canvas pad → SVG into `client_signatures`                   |
| Auto property creation + team notification | ⚠️      | Property is created; team notification not fired            |

---

## §5 — i18n

| Item                                       | Status | Notes                                                       |
| ------------------------------------------ | ------ | ----------------------------------------------------------- |
| DE / EN / TA full coverage                 | ✅      | 1131 keys × 3 locales, parity verified                      |
| Per-user language preference               | ✅      | Stored in settings + cookie                                 |
| UTF-8 / Tamil script                       | ✅      | Noto Sans Tamil loaded                                      |
| Date + number format per language          | ⚠️      | Some places hard-code de-DE; could be more thorough         |
| Onboarding videos in all 3 languages       | ❌      | `locale` column on training_modules but no actual content   |

---

## §6 — Technical / Security / Performance

| Item                                       | Status | Notes                                                       |
| ------------------------------------------ | ------ | ----------------------------------------------------------- |
| React.js (we have Next.js)                 | ✅      | Strict superset                                             |
| React Native mobile                        | ❌      |                                                             |
| Node + Express                             | ⚠️      | Equivalent: Next.js Server Actions + Route Handlers         |
| PostgreSQL                                 | ✅      | Supabase Postgres                                           |
| Hetzner DE                                 | ⚠️      | Supabase free tier; choose EU region or migrate to Hetzner  |
| Lexware integration                        | ❌      | Stub only                                                   |
| JWT + OAuth2                               | ✅      | Supabase Auth                                               |
| 2FA for management + PM                    | ✅      | TOTP enrollment + login challenge shipped                   |
| react-i18next equivalent                   | ✅      | next-intl                                                   |
| Swagger / OpenAPI 3.0 docs                 | ❌      | No API spec file generated                                  |
| Rate limiting on every endpoint            | ❌      |                                                             |
| HTTPS / TLS 1.3                            | ✅      | Platform-level                                              |
| GDPR EU servers                            | ⚠️      | Verify Supabase region + Hetzner backup plan                |
| bcrypt passwords                           | ✅      | Supabase                                                    |
| Daily backups, 30-day retention            | ⚠️      | Supabase: free tier = 7 days; need paid plan or self-host   |
| Input validation                           | ✅      | Zod throughout                                              |
| SQL injection protection                   | ✅      | Parameterized via Supabase JS                               |
| FCP < 2s                                   | ❓      | Not measured                                                |
| API < 300ms p95                            | ❓      | Not measured                                                |
| 60fps mobile                               | N/A    | No native mobile                                            |
| 500 concurrent users                       | ❓      | Not load-tested                                             |

---

## §7 — Design

| Item                                       | Status |
| ------------------------------------------ | ------ |
| Brand palette                              | ✅      |
| Light green / navy / white                 | ✅      |
| Inter / Noto Sans Tamil typography         | ✅      |
| WCAG 2.1 AA compliance                     | ⚠️      |
| Touch targets ≥ 44 px                      | ⚠️      |
| Mobile-first responsiveness                | ✅      |
| All WebApp screens enumerated              | ✅      |
| All Mobile App screens                     | ❌      |

---

## §8 — Non-functional

| Item                                       | Status |
| ------------------------------------------ | ------ |
| 99.5% uptime                               | ❌      |
| Scalability test for 500 users             | ❌      |
| GDPR EU data flow                          | ⚠️      |
| Daily backup verification                  | ❌      |
| WCAG 2.1 AA audit                          | ❌      |
| Browser test matrix (Chrome 90+ etc)       | ❌      |
| App-store publication                      | ❌      |
| Offline cache for schedule / check-in      | ❌      |

---

## What to ship next, in order of business value

### Tier 1 — Cannot go live without

1. **Real Supabase production project in EU** (Frankfurt or Ireland) and a
   migration of the dev data. GDPR §6.2.
2. **Daily backups** verified — upgrade Supabase plan or wire `pg_dump`
   on a schedule.
3. **Working-time report per employee** (§4.4 monthly export). Without
   GPS, at least let staff confirm their shifts and let admins export.
4. **Lexware integration** — actually call the Lexware REST API. This is
   the headline value-prop in the doc and right now it's a stub button.
5. **Training "system lock"** — block shift assignment for staff who
   haven't completed mandatory modules.
6. **WCAG 2.1 AA audit** — touch targets, contrast, aria labels. Run
   axe-core in the existing Playwright suite.
7. **Rate limiting** on auth and write endpoints.

### Tier 2 — Strong client expectations from §4 spec

8. **Mobile App (React Native)** for field staff — biggest single gap.
   Spec puts GPS check-in here.
9. **GPS check-in / check-out** with radius enforcement, audit-grade
   timestamps, missed-checkout alerts.
10. **Client Portal** — even read-only, lets clients see assignment
    reports + the client-chat side of §4.6.
11. **"New Client" badge** for 30 days + auto-notify PMs.
12. **Schedule export** (PDF + iCal feed).
13. **Vacation visualized on the schedule** (currently lives in its
    own page only).
14. **Drag-and-drop scheduling**.
15. **OpenAPI / Swagger** docs for the REST surface.

### Tier 3 — Polish

16. Floor / building section / access code as structured fields on
    properties.
17. PDF upload for cleaning concepts.
18. Closure calendar (holidays, planned closures).
19. Suggest-alternative-dates flow on vacation review.
20. Actual training videos in all three languages.
21. Multi-contact-persons per client (1:n contacts table).
22. Lighthouse + load test (k6) before go-live.

---

## Path to "ready for first paying customer"

If the goal is "Priya can run her business on this in 90 days with a
small ops team and a phone in their pocket," do this in order:

1. Tier-1 items 1–7 (the legal / SLA floor).
2. React Native shell (just the field-staff screens — schedule, today,
   GPS check-in, photo upload, vacation, chat).
3. Lexware live.
4. Beta with one Priya office for 4 weeks.
5. Tier-2 polish based on what they actually complain about.
