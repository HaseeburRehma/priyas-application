/**
 * Pre-seeded local test accounts (see supabase/seed/test_users.sql).
 *
 * If you change the seed, update these constants — both must agree.
 */
export const USERS = {
  admin: {
    email: "haseebtylo@gmail.com",
    password: "Azsxdcfvgb123@",
    fullName: "Priya Test (Admin)",
    role: "admin" as const,
  },
  dispatcher: {
    email: "urrehmanmuneeb91@gmail.com",
    password: "Azsxdcfvgb12@",
    fullName: "Daniela Disponentin",
    role: "dispatcher" as const,
  },
  employee: {
    email: "jhaseeb718@gmail.com",
    password: "Azsxdcfvgb12@",
    fullName: "Eli Einsatzkraft",
    role: "employee" as const,
  },
} as const;

export type TestRole = keyof typeof USERS;
