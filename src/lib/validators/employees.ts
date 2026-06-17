import { z } from "zod";

const isoDate = z
  .string()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
    message: "Ungültiges Datum",
  });

/**
 * The set of `profiles.role` values an admin may assign when inviting
 * or promoting / demoting another user. Matches `public.user_role` in
 * the DB and `Role` in `src/lib/rbac/permissions.ts`.
 */
export const employeeRoleEnum = z.enum(["admin", "dispatcher", "employee"]);
export type EmployeeRole = z.infer<typeof employeeRoleEnum>;

export const salaryTypeSchema = z.enum(["hourly", "monthly"]);
export type SalaryType = z.infer<typeof salaryTypeSchema>;

export const createEmployeeSchema = z
  .object({
    // The legacy `full_name` field is auto-derived from first+last on the
    // server; the operations team fills the two halves separately per
    // the spec.
    full_name: z.string().min(2, "Name ist zu kurz").max(160),
    first_name: z.string().max(100).optional().or(z.literal("")),
    last_name: z.string().max(100).optional().or(z.literal("")),
    email: z
      .string()
      .email("Ungültige E-Mail")
      .max(200)
      .optional()
      .or(z.literal("")),
    // Restrict to digits + standard phone punctuation. Prevents control
    // characters (newlines / tabs) from sneaking into the field.
    phone: z
      .string()
      .max(40)
      .regex(/^[\d\s+\-().]+$/, "Ungültige Telefonnummer")
      .optional()
      .or(z.literal("")),
    // Spec intake additions (May 18):
    address_line1: z.string().max(200).optional().or(z.literal("")),
    address_line2: z.string().max(200).optional().or(z.literal("")),
    postal_code:   z.string().max(20).optional().or(z.literal("")),
    city:          z.string().max(120).optional().or(z.literal("")),
    country:       z.string().max(60).optional().or(z.literal("")),
    date_of_birth: isoDate.optional().or(z.literal("")),
    nationality:   z.string().max(80).optional().or(z.literal("")),
    salary_type:   salaryTypeSchema.default("hourly"),
    monthly_salary_eur: z
      .number({ invalid_type_error: "Monatslohn muss eine Zahl sein" })
      .min(0)
      .max(50000)
      .optional()
      .or(z.literal("")),
    vacation_days_per_year: z
      .number({ invalid_type_error: "Urlaubstage 0–60" })
      .int()
      .min(0)
      .max(60)
      .optional()
      .or(z.literal("")),
    contract_start: isoDate.optional().or(z.literal("")),
    // Legacy: kept for back-compat. `hire_date` and `contract_start`
    // collapse to the same DB column for new flows; existing imports keep
    // populating hire_date.
    hire_date: isoDate.optional().or(z.literal("")),
    weekly_hours: z
      .number({ invalid_type_error: "Wochenstunden müssen eine Zahl sein" })
      .min(0)
      .max(80)
      .default(40),
    hourly_rate_eur: z
      .number({ invalid_type_error: "Stundensatz muss eine Zahl sein" })
      .min(0)
      .max(500)
      .optional()
      .or(z.literal("")),
    status: z.enum(["active", "on_leave", "inactive"]).default("active"),
    /**
     * Which service line this employee is qualified / assigned to work for.
     * Drives the staff filter in the shift planner so only compatible
     * employees appear when scheduling for a Priya or Alltagshilfe property.
     */
    service_type: z.enum(["priya", "alltagshilfe", "both"]).default("both"),
    notes: z.string().max(2000).optional().or(z.literal("")),
    /**
     * Role assigned to the invited user. Used by the `handle_new_user()`
     * trigger when the invitee accepts the magic-link email. Defaults to
     * the lowest-privilege role.
     */
    role: employeeRoleEnum.default("employee"),
  })
  .refine(
    (v) =>
      v.salary_type === "hourly" ||
      (typeof v.monthly_salary_eur === "number" && v.monthly_salary_eur > 0),
    {
      message: "Monatslohn erforderlich, wenn Festgehalt gewählt",
      path: ["monthly_salary_eur"],
    },
  );
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.and(
  z.object({ id: z.string().uuid() }),
);
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/**
 * Schema for promoting / demoting an existing employee. The trigger
 * `trg_prevent_self_role_escalation` (migration 000024) blocks a user
 * from changing their own row's role, so we also defend against that
 * server-side for a friendlier error than the raw 42501.
 */
export const updateEmployeeRoleSchema = z.object({
  employeeId: z.string().uuid(),
  role: employeeRoleEnum,
});
export type UpdateEmployeeRoleInput = z.infer<typeof updateEmployeeRoleSchema>;
