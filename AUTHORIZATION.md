# Authorization Matrix

Single source of truth for who can reach what. Two layers enforce this:

1. **`ROUTE_ACCESS`** in `src/lib/rbac/permissions.ts` — drives sidebar
   visibility and a server-side redirect on every restricted page via
   `requireRoute()`.
2. **`MATRIX`** in the same file — drives `requirePermission()` checks
   inside server actions, plus boolean `can()` lookups for conditional UI.

Three roles map to the spec's three personas:

| Spec name        | Internal role  | Notes                                  |
| ---------------- | -------------- | -------------------------------------- |
| Management       | `admin`        | Full access                            |
| Project Manager  | `dispatcher`   | Operations + scheduling                |
| Field Staff      | `employee`     | Mobile-first; self-service only        |

---

## Route allow-list

| Route                  | admin | dispatcher | employee | Notes                                  |
| ---------------------- | :---: | :--------: | :------: | -------------------------------------- |
| `/dashboard`           |   ✅  |     ✅     |    ✅    | Tailored content per role              |
| `/schedule`            |   ✅  |     ✅     |    ✅    | Field staff sees only own shifts       |
| `/vacation`            |   ✅  |     ✅     |    ✅    | Submit own; managers approve           |
| `/training`            |   ✅  |     ✅     |    ✅    | Field staff sees assigned modules      |
| `/chat`                |   ✅  |     ✅     |    ✅    | Plus auto-channel per property         |
| `/notifications`       |   ✅  |     ✅     |    ✅    |                                        |
| `/clients`             |   ✅  |     ✅     |    🚫    |                                        |
| `/clients/new`         |   ✅  |     ✅     |    🚫    |                                        |
| `/clients/:id`         |   ✅  |     ✅     |    🚫    |                                        |
| `/clients/:id/statement`|  ✅  |     ✅     |    🚫    | Backed by `invoice.read`               |
| `/properties`          |   ✅  |     ✅     |    🚫    |                                        |
| `/properties/new`      |   ✅  |     ✅     |    🚫    |                                        |
| `/properties/:id`      |   ✅  |     ✅     |    🚫    |                                        |
| `/properties/:id/edit` |   ✅  |     ✅     |    🚫    |                                        |
| `/employees`           |   ✅  |     ✅     |    🚫    |                                        |
| `/employees/:id`       |   ✅  |     ✅     |    🚫    |                                        |
| `/invoices`            |   ✅  |     ✅     |    🚫    |                                        |
| `/invoices/:id`        |   ✅  |     ✅     |    🚫    |                                        |
| `/reports`             |   ✅  |     ✅     |    🚫    |                                        |
| `/reports/alltagshilfe`|   ✅  |     ✅     |    🚫    |                                        |
| `/settings`            |   ✅  |     ✅     |    🚫    | Read for both; write for admin         |
| `/onboard`             |   ✅  |     ✅     |    🚫    | Tablet kiosk new-client wizard         |
| `/onboard/success`     |   ✅  |     ✅     |    🚫    |                                        |

---

## Action allow-list (used by server actions + `can()` UI checks)

| Action                          | admin | dispatcher | employee |
| ------------------------------- | :---: | :--------: | :------: |
| `client.read`                   |   ✅  |     ✅     |    ✅    |
| `client.create` / `update`      |   ✅  |     ✅     |    🚫    |
| `client.archive` / `delete`     |   ✅  |     🚫     |    🚫    |
| `property.read`                 |   ✅  |     ✅     |    ✅    |
| `property.create` / `update`    |   ✅  |     ✅     |    🚫    |
| `property.delete`               |   ✅  |     🚫     |    🚫    |
| `employee.read`                 |   ✅  |     ✅     |    ✅    |
| `employee.create`               |   ✅  |     🚫     |    🚫    |
| `employee.update`               |   ✅  |     ✅     |    🚫    |
| `employee.archive` / `delete`   |   ✅  |     🚫     |    🚫    |
| `shift.read`                    |   ✅  |     ✅     |    ✅    |
| `shift.create` / `update`       |   ✅  |     ✅     |    🚫    |
| `invoice.read` / `create`       |   ✅  |     ✅     |    🚫    |
| `invoice.update`                |   ✅  |     ✅     |    🚫    |
| `invoice.delete`                |   ✅  |     🚫     |    🚫    |
| `invoice.send` / `mark_paid`    |   ✅  |     ✅     |    🚫    |
| `invoice.lexware_sync`          |   ✅  |     🚫     |    🚫    |
| `report.alltagshilfe.view/export`|  ✅  |     ✅     |    🚫    |
| `settings.read`                 |   ✅  |     ✅     |    🚫    |
| `settings.update`               |   ✅  |     🚫     |    🚫    |
| `vacation.request`              |   ✅  |     ✅     |    ✅    |
| `vacation.approve` / `read_all` |   ✅  |     ✅     |    🚫    |
| `damage.read` / `create`        |   ✅  |     ✅     |    ✅    |
| `damage.resolve`                |   ✅  |     ✅     |    🚫    |
| `training.read` / `complete`    |   ✅  |     ✅     |    ✅    |
| `training.manage`               |   ✅  |     ✅     |    🚫    |

---

## How the layers compose

A field-staff user typing `/clients` directly into the URL bar:

1. The `(dashboard)` layout still renders (everyone signed-in gets there).
2. The Sidebar is fed only the routes their role allows; `Clients` doesn't appear.
3. The `/clients/page.tsx` server component calls `await requireRoute("clients")`.
4. `requireRoute` looks up the user's role, sees `employee` isn't in `ROUTE_ACCESS.clients`, and calls Next's `redirect("/dashboard")`.
5. The user lands on the dashboard. They never see the page contents, never trigger the loader query, never know the page exists in the URL space.

For server actions (the third defence layer):

1. UI checks `can("client.create")` to decide whether to render the button.
2. If the button is rendered (i.e. only managers see it) and clicked, the server action calls `requirePermission("client.create")` first.
3. RLS at the Postgres level is the final word — even if a client somehow forged a request that got past the action, the database would refuse the write because `is_dispatcher_or_admin()` is false for the field-staff session.

---

## Adding a new route

When you add a new page in `app/(dashboard)/`:

1. Pick or define a `RouteKey` in `permissions.ts → ROUTE_ACCESS`.
2. Set the role allow-list on it.
3. Add the matching nav item in `Sidebar.tsx` (and optionally `BottomNav.tsx`) with the same `routeKey`.
4. At the top of the page component, call `await requireRoute("yourKey")`.
5. Add a row to this doc.

That's it — sidebar visibility, deep-link redirect, and audit trail all stay in lockstep.
