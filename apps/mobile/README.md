# Priya's — Mobile (iOS + Android)

Expo SDK 52 client for Priya's Reinigungsservice. Talks to the same
Supabase project as the web app, shares the same Postgres RLS rules,
and re-uses the same i18n keys (files under `src/messages/*.json`
are literal copies of the web app's `messages/`).

## What ships in this release

**Auth & shell**
- Email + password sign-in, TOTP challenge for admin / dispatcher,
  standalone TOTP enrolment gate on first sign-in (mirrors spec §6.2).
- Language picker (DE · EN · TA) with SecureStore-persisted choice.

**Field-staff surfaces**
- **Home (My Profile)** — hours this week / this month, vacation left,
  mandatory training count, next 5 upcoming shifts.
- **Schedule** — my shifts grouped by day; tap into detail.
- **Shift detail** — GPS-verified check-in / check-out / break start /
  break end. State machine matches the web server actions.
- **Chat** — realtime team channels + per-property channels with typing
  indicator (Supabase Realtime + broadcast).
- **Damage reports** — camera-first flow with photo upload to Storage
  and severity / category picker.
- **Notifications** — inbox with unread badge + tap-to-open.
- **Vacation** — request submission + status list.
- **Settings** — My account, security (change password, revoke sessions),
  active devices, language + sign-out.

**Admin surfaces (admin + dispatcher only)**
- **Dashboard tab** — org KPIs, team utilisation, today's staffing.
- **Clients tab** — full roster with search + type filter (all / private /
  company / Alltagshilfe), payer-source chip, drill-down to detail
  (contact, care & insurance for Alltagshilfe, properties list, notes).
- **More tab** — hub for admin-only surfaces:
  - **Employees** — full team roster with service-line filter, status
    chips (Active / On leave / Inactive), drill-down (contact,
    employment, skills, notes).
  - **Properties** — list every workplace with search, drill-down opens
    the address in the native maps app on tap.
  - **Invoices** — status-filtered list (all / draft / sent / paid /
    overdue), read-only detail with line items, Lexware sync timestamp.
  - **Alltagshilfe monthly report** — hours per client × care fund with
    month-picker (previous / next); matches the web /reports view.
  - **Training** — my onboarding videos with inline WebView playback
    for YouTube / Vimeo (auto-detected from the module's video URL),
    full-screen player with "Mark completed" in the footer. Falls back
    to opening the URL in the system browser for anything the classifier
    can't safely embed. Writes to `employee_training_progress` — same
    table the web app reads for the scheduling gate.

**Admin: planning shifts from mobile**
- On the Schedule tab a **Plan shift** button appears for admin +
  dispatcher only. Full dialog: property picker (search across
  name / client / city), employee picker (filtered to care-qualified
  staff when the client is Alltagshilfe, "Open shift" option to
  pre-book), date + start + end + notes. Save → new row on `shifts`
  in `scheduled` state, employee notified via existing push fan-out.

**Infrastructure**
- **Push notifications** — Expo push tokens registered on sign-in and
  written to `user_devices.expo_push_token`; tap opens the deep link
  from `notification.data.url` (`/schedule/<id>`, `/damage/<id>`, …).
- **Offline outbox** — clock-in / clock-out / damage reports queue in
  SecureStore when there's no connection and drain automatically on the
  next app-foreground. Duplicate-key conflicts from double-taps or
  retries are treated as success.

## Prerequisites

- **Node 20 LTS or 22 LTS** — Expo SDK 52 targets these. Node 25 and up
  are unreleased/current and may hit bundler edge cases; if you're on 25
  and see Metro or Reanimated crashes, switch via `nvm install 22 && nvm use 22`.
- **Expo Go** app on your phone (App Store or Play Store) — the fastest
  path to run the app on a real device.
- **Xcode 15+** if you want to run on the iOS simulator.
- **Android Studio** if you want to run on the Android emulator.

## First-time setup

The web app at the repo root uses npm. The mobile app is installed
standalone with npm too — the `pnpm-workspace.yaml` at root is
forward-looking (for when the web app moves to `apps/web/`) and is
inert for npm workflows today.

```bash
cd apps/mobile
npm install

# Copy the env template and fill in the Supabase keys from the web app
# (same project — do not create a new one).
cp .env.example .env
# Edit .env: paste EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
```

The Supabase URL + anon key come from the same project the web app uses.
Anything else (service role key, Lexware secrets, cron secrets) is server
side only and MUST NOT be added here — the mobile app never sees them.

## Run in Expo Go (fastest for dev)

```bash
npm start
```

A QR code prints in the terminal. Open the camera app on your phone,
point at the QR, tap the "Open with Expo Go" banner. The app hot-reloads
on every save.

Sign in with any of the seeded test users:

| Email                    | Role       |
|--------------------------|------------|
| `admin@priyas.test`      | admin      |
| `dispatcher@priyas.test` | dispatcher |
| `employee@priyas.test`   | employee   |

Password (all three): `Priya#2026`

## Run in a native simulator

```bash
npm run ios     # boots the iOS simulator via Xcode
npm run android # boots an emulator via Android Studio
```

## Build for distribution (EAS)

The `eas.json` config is already in place. You need an Expo account and
`eas-cli` installed globally:

```bash
npm i -g eas-cli
eas login
eas build:configure   # writes the projectId back into app.json → extra.eas
```

Then:

```bash
eas build -p ios --profile preview        # internal TestFlight-style build
eas build -p android --profile preview    # APK for internal distribution
eas build --platform all --profile production
```

## Environment variables

Only the two `EXPO_PUBLIC_*` variables are read by the client bundle. If
you rotate Supabase keys, update `.env` and (for EAS builds) mirror them
into the EAS project secrets. Anything sensitive stays server-side.

## Follow-up work (planned)

Ordered by dependency, not by priority:

1. Chat: realtime channels, typing indicator, message bubbles.
2. Notifications: inbox with filter pills + push registration.
3. Settings expansion: My Account form, Security (change password + 2FA
   toggle), Sessions list.
4. Damage reports: camera capture + upload flow.
5. Vacation: request form.
6. Client + property browsing (view-only for employees; edit for
   dispatcher).
7. Admin dashboard tab: org KPIs, team utilization, recent activity.
8. Full invoice module (admin + dispatcher only).

Each turn should add screens + wire actions without touching the
scaffold set up here.

## Sharing code with the web app

Right now the mobile app duplicates `src/messages/*.json` and
`src/lib/rbac.ts` from the web app. When the web app moves to
`apps/web/` (deferred so the current Vercel deploy keeps working), both
apps will consume shared `packages/messages` and `packages/rbac`
workspaces. Until then, the sync command is a copy:

```bash
# From repo root
cp messages/de.json apps/mobile/src/messages/de.json
cp messages/en.json apps/mobile/src/messages/en.json
cp messages/ta.json apps/mobile/src/messages/ta.json
```

If the RBAC matrix in `src/lib/rbac/permissions.ts` changes, mirror it
into `apps/mobile/src/lib/rbac.ts` — the two files must stay strictly
in sync.
