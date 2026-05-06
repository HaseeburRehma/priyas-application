# Roadmap — Priya's Cleaning Service Platform

This document maps each section of the **Requirements Specification (March 2026)**
to the delivered state.

> Tech stack note: the spec lists React + Node/Express + PostgreSQL on Hetzner.
> We delivered on **Next.js 14 + Supabase** instead, which satisfies all
> functional requirements with less moving infrastructure (Postgres + Auth +
> Storage + Realtime in one platform). EU/GDPR is preserved by selecting an
> EU region in the Supabase project. Native mobile (React Native) is **out of
> scope** for the WebApp build — the WebApp is fully responsive and runs on
> phones, tablets, and desktops.

---

## Status legend

- ✅ Done
- 🟡 Designed / DB ready, polish pending
- ⬜ Not started

---

## Page-by-page status against the prototype

| #  | Page                              | Status |
| -- | --------------------------------- | ------ |
| 01 | login.html                        | ✅     |
| 02 | dashboard.html                    | ✅     |
| 03 | clients-list.html                 | ✅     |
| 04 | client-detail.html                | ✅     |
| 05 | properties-list.html              | ✅     |
| 06 | property-detail.html              | ✅     |
| 07 | schedule.html (week calendar)     | ✅     |
| 08 | employees-list.html               | ✅     |
| 09 | employee-detail.html              | ✅     |
| 10 | invoices-list.html                | ✅     |
| 11 | invoice-detail.html               | ✅     |
| 12 | client-statement.html             | ✅     |
| 13 | settings.html (6 sections)        | ✅     |
| 14 | reports.html                      | ✅     |
| 15 | customer-type-picker.html         | ✅     |
| 16 | alltagshilfe-report.html          | ✅     |
| 17 | team-chat.html                    | ✅     |
| 18 | notifications.html                | ✅     |

All 18 prototype pages converted, wired to Supabase, RBAC-gated, translated DE/EN/TA.

---

## Phase 0 — Foundation ✅

- ✅ Project scaffold (Next.js 14, TS strict, Tailwind v3 with HTML CSS-variable theme)
- ✅ Supabase clients (browser/server/middleware), session refresh, route gating
- ✅ Database foundation: orgs, profiles, audit log, helper functions, RLS pattern
- ✅ Domain tables: clients, properties, employees, shifts, time entries, invoices,
     statements, settings, notifications, chat (channels/members/messages), reports
- ✅ Storage buckets + policies
- ✅ Login (pixel-faithful)
- ✅ Self-serve register page + OAuth-friendly `handle_new_user()`
- ✅ Forgot password
- ✅ Dashboard shell + KPI page
- ✅ i18n: de + en + ta (Noto Sans Tamil) — §5
- ✅ Responsive nav: mobile drawer + bottom nav + tablet-collapsed sidebar
- ✅ Schema extensions for: contracts, service scopes, property keys, vacation,
     training, damage reports, client signatures, auto property-channel — §4.1, §4.2,
     §4.5, §4.6, §4.8, §4.9, §4.10
- ✅ Lexware + WhatsApp adapter stubs (feature-flagged)

## Phase A — Team chat & real-time messaging — §4.6 ✅

- ✅ Conversation list (channels + DMs) with unread count badges
- ✅ Message thread with text
- ✅ Real-time delivery via Supabase Realtime (postgres_changes subscription)
- ✅ Property-specific channels (auto-created by trigger; auto-membership for org)
- ✅ Read receipts via `chat_members.last_read_at`
- ✅ Mobile-optimised chat UX (full-screen view, list↔thread routing)
- 🟡 Photo/voice attachments (storage buckets + RLS ready; UI button stubbed)
- 🟡 Push notifications (browser API + service worker — next pass)

## Phase B — CRM + properties + scheduling ✅

- ✅ Clients module: list, detail with tabs, customer-type picker, create form for
     all three types, edit, archive (admin-only)
- ✅ Properties module: list, detail with hero stats / areas / scope / team / key
     info, create form, edit, soft-delete
- ✅ Schedule (week calendar): grid, mini-cal sidebar, team + status filters,
     event detail panel, **Plan-shift modal** with property + employee + date/time
     pickers, conflict guard (server-side `shift.create` + overlap check)
- ✅ Employees module: list with summary KPIs, filters, table with hours bars and
     vacation balance, detail page with hero / tabs / upcoming shifts / time entries /
     vacation card / profile, **Invite modal**, edit, archive

## Phase C — Field-staff workflow

- ✅ Schedule grid + plan-shift modal (above)
- ✅ Time entries listing on employee detail
- 🟡 GPS check-in / check-out (DB columns + storage buckets ready; UI is mobile-only)
- 🟡 Vacation requests (DB table + RLS ready; UI form pending)
- 🟡 Property photo upload (Supabase Storage `property-photos` bucket ready)
- 🟡 Damage reports (DB ready; UI pending)

## Phase D — Onboarding training — §4.9

- 🟡 Tables `training_modules` + `employee_training_progress` ready
- ⬜ Module list + video player UI
- ⬜ Progress tracking + system lock for new hires

## Phase E — Client onboarding — §4.10

- 🟡 `client_signatures` table ready
- ✅ Customer-type picker (15) ✓
- 🟡 Tablet on-site intake form + signature pad — pending

## Phase F — Invoicing, integrations, reports ✅

- ✅ Invoice list + detail with line items, status pills, mark-sent / mark-paid /
     Lexware-sync actions (gated by `invoice.send`, `invoice.mark_paid`,
     `invoice.lexware_sync`)
- ✅ Lexware adapter stub — wires to real API once env vars provided
- ✅ Client statement (12) — tabs, running balance, aging buckets, property breakdown
- 🟡 PDF invoice generation (export endpoint returns CSV stub today; PDF via
     `react-pdf` next pass)
- ✅ Reports page (14) — KPI cards with mini-charts, revenue trend, hours donut,
     report library with CSV export endpoint
- ✅ Alltagshilfe monthly report (16) — banner, month picker, KPIs, per-client +
     per-employee breakdown table, send-to-management button

## Phase G — Notifications, settings, system ✅

- ✅ Notifications page (18): tabs (Alle / Ungelesen / Erwähnungen / Rechnungen /
     Einsatzplan / Alltagshilfe with counts), urgent/unread variants, mark-as-read
     and mark-all-read actions
- ✅ Settings page (13): 6 sections (Firmenprofil / Team & Rollen / Steuer /
     Integrationen / Benachrichtigungen / Lokalisierung). Persists to `settings.data`
     JSONB column via single `updateSettingsAction`. Admin-only edits.
- ✅ Audit log table + helper writes from every CRUD action

## Phase H — Hardening & ops

- 🟡 2FA for admin / project manager — Supabase Auth supports TOTP; UI hookup pending
- 🟡 Rate limiting on auth endpoints (Vercel KV / @upstash/ratelimit) pending
- ⬜ Lighthouse 90+ pass on desktop and mobile
- ⬜ Daily Supabase backup verification automation
- ⬜ E2E tests with Playwright
- ⬜ Deploy to Vercel + custom domain

## Phase I — Optional / Phase 2

- ⬜ AI scheduling suggestions
- ⬜ Client-facing portal
- ⬜ React Native mobile client (shares this Supabase backend)

---

## Role mapping (spec → DB enum)

| Requirements doc | DB enum (`user_role`) | Notes                            |
| ---------------- | --------------------- | -------------------------------- |
| Management       | `admin`               | full access                      |
| Project Manager  | `dispatcher`          | scheduling + properties + CRM    |
| Field Staff      | `employee`            | mobile-friendly fieldwork access |
| Client           | _planned: `client`_   | added in Phase E                 |

UI labels translate the enum into the spec's role names per locale.

---

## i18n status

**860+ keys × 3 locales** (DE / EN / TA), parity verified programmatically in
every commit. Tamil renders via Noto Sans Tamil (loaded via `next/font/google`).

## RBAC inventory

26 permission action strings defined in `src/lib/rbac/permissions.ts`:

```
client.{read,create,update,archive,delete}
property.{read,create,update,delete}
employee.{read,create,update,archive,delete}
shift.{read,create,update}
invoice.{read,create,update,delete,send,mark_paid,lexware_sync}
report.alltagshilfe.{view,export}
settings.{read,update}
```

Every server action calls `requirePermission(...)` before the DB write. RLS policies
duplicate the same checks at the database level (defence in depth).

---

Last updated: 2026-05-04. Owner: design@tylotech.de.
