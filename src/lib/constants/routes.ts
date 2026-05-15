import type { Route } from "next";

/**
 * Centralised route table. Use these constants instead of hard-coded strings.
 *
 * All dynamic-route helpers cast their return value to `Route` so that they
 * are accepted directly as `<Link href={...}>` and `router.push/replace`
 * arguments under Next.js's `experimental.typedRoutes`.
 */
export const routes = {
  login: "/login" as Route,
  register: "/register" as Route,
  registerCheckEmail: "/register/check-email" as Route,
  forgotPassword: "/forgot-password" as Route,
  resetPassword: "/reset-password" as Route,
  dashboard: "/dashboard" as Route,
  clients: "/clients" as Route,
  clientNew: "/clients/new" as Route,
  clientNewType: (type: string) => `/clients/new/${type}` as Route,
  client: (id: string) => `/clients/${id}` as Route,
  clientEdit: (id: string) => `/clients/${id}/edit` as Route,
  properties: "/properties" as Route,
  propertyNew: "/properties/new" as Route,
  property: (id: string) => `/properties/${id}` as Route,
  propertyEdit: (id: string) => `/properties/${id}/edit` as Route,
  schedule: "/schedule" as Route,
  vacation: "/vacation" as Route,
  training: "/training" as Route,
  employees: "/employees" as Route,
  employee: (id: string) => `/employees/${id}` as Route,
  invoices: "/invoices" as Route,
  invoiceNew: "/invoices/new" as Route,
  invoice: (id: string) => `/invoices/${id}` as Route,
  invoiceEdit: (id: string) => `/invoices/${id}/edit` as Route,
  assignments: "/assignments" as Route,
  assignment: (id: string) => `/assignments/${id}` as Route,
  assignmentNew: "/assignments/new" as Route,
  reports: "/reports" as Route,
  alltagshilfeReport: "/reports/alltagshilfe" as Route,
  settings: "/settings" as Route,
  chat: "/chat" as Route,
  notifications: "/notifications" as Route,
  onboard: "/onboard" as Route,
  onboardSuccess: "/onboard/success" as Route,
  setup2fa: "/setup-2fa" as Route,
  offline: "/offline" as Route,
} as const;

/** Public routes (no auth required). */
export const publicRoutes: ReadonlyArray<string> = [
  routes.login,
  routes.register,
  routes.registerCheckEmail,
  routes.forgotPassword,
  routes.resetPassword,
  routes.offline,
];
