/**
 * Pre-seeded local test accounts (see supabase/seed/test_users.sql).
 *
 * Credentials are read from env vars so they are never committed to git.
 * Add the following to your .env.local (or CI secrets):
 *
 *   E2E_ADMIN_EMAIL=...
 *   E2E_ADMIN_PASSWORD=...
 *   E2E_DISPATCHER_EMAIL=...
 *   E2E_DISPATCHER_PASSWORD=...
 *   E2E_EMPLOYEE_EMAIL=...
 *   E2E_EMPLOYEE_PASSWORD=...
 */
export const USERS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "",
    password: process.env.E2E_ADMIN_PASSWORD ?? "",
    fullName: "Priya Test (Admin)",
    role: "admin" as const,
  },
  dispatcher: {
    email: process.env.E2E_DISPATCHER_EMAIL ?? "",
    password: process.env.E2E_DISPATCHER_PASSWORD ?? "",
    fullName: "Daniela Disponentin",
    role: "dispatcher" as const,
  },
  employee: {
    email: process.env.E2E_EMPLOYEE_EMAIL ?? "",
    password: process.env.E2E_EMPLOYEE_PASSWORD ?? "",
    fullName: "Eli Einsatzkraft",
    role: "employee" as const,
  },
} as const;

export type TestRole = keyof typeof USERS;
