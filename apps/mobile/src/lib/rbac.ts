/**
 * Client-side RBAC mirror of `src/lib/rbac/permissions.ts` in the web
 * app. Used to hide/show navigation entries and buttons — the actual
 * enforcement lives in Postgres RLS + server actions, exactly as on
 * the web. This is a UX hint, not a security boundary.
 *
 * Keep the matrix in strict sync with the web version. When the web
 * matrix changes, this file must change too.
 */

export type Role = "admin" | "dispatcher" | "employee";

export type Action =
  | "client.read"
  | "client.create"
  | "client.update"
  | "client.archive"
  | "client.delete"
  | "property.read"
  | "property.create"
  | "property.update"
  | "property.delete"
  | "employee.read"
  | "employee.create"
  | "employee.update"
  | "employee.archive"
  | "employee.delete"
  | "shift.read"
  | "shift.create"
  | "shift.update"
  | "invoice.read"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "invoice.send"
  | "invoice.mark_paid"
  | "invoice.lexware_sync"
  | "report.alltagshilfe.view"
  | "report.alltagshilfe.export"
  | "settings.read"
  | "settings.update"
  | "vacation.request"
  | "vacation.approve"
  | "vacation.read_all"
  | "damage.read"
  | "damage.create"
  | "damage.resolve"
  | "training.read"
  | "training.manage"
  | "training.complete"
  | "time.checkin"
  | "time.read_all"
  | "time.correct";

const MATRIX: Record<Action, Role[]> = {
  "client.read": ["admin", "dispatcher", "employee"],
  "client.create": ["admin", "dispatcher"],
  "client.update": ["admin", "dispatcher"],
  "client.archive": ["admin"],
  "client.delete": ["admin"],

  "property.read": ["admin", "dispatcher", "employee"],
  "property.create": ["admin", "dispatcher"],
  "property.update": ["admin", "dispatcher"],
  "property.delete": ["admin"],

  "employee.read": ["admin", "dispatcher", "employee"],
  "employee.create": ["admin"],
  "employee.update": ["admin", "dispatcher"],
  "employee.archive": ["admin"],
  "employee.delete": ["admin"],

  "shift.read": ["admin", "dispatcher", "employee"],
  "shift.create": ["admin", "dispatcher"],
  "shift.update": ["admin", "dispatcher"],

  "invoice.read": ["admin", "dispatcher"],
  "invoice.create": ["admin", "dispatcher"],
  "invoice.update": ["admin", "dispatcher"],
  "invoice.delete": ["admin"],
  "invoice.send": ["admin", "dispatcher"],
  "invoice.mark_paid": ["admin", "dispatcher"],
  "invoice.lexware_sync": ["admin"],

  "report.alltagshilfe.view": ["admin", "dispatcher"],
  "report.alltagshilfe.export": ["admin", "dispatcher"],

  "settings.read": ["admin", "dispatcher"],
  "settings.update": ["admin"],

  "vacation.request": ["admin", "dispatcher", "employee"],
  "vacation.approve": ["admin", "dispatcher"],
  "vacation.read_all": ["admin", "dispatcher"],

  "damage.read": ["admin", "dispatcher", "employee"],
  "damage.create": ["admin", "dispatcher", "employee"],
  "damage.resolve": ["admin", "dispatcher"],

  "training.read": ["admin", "dispatcher", "employee"],
  "training.manage": ["admin", "dispatcher"],
  "training.complete": ["admin", "dispatcher", "employee"],

  "time.checkin": ["admin", "dispatcher", "employee"],
  "time.read_all": ["admin", "dispatcher"],
  "time.correct": ["admin", "dispatcher"],
};

/** Return true if a caller with `role` may perform `action`. */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return MATRIX[action].includes(role);
}
