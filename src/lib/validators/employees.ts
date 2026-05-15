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

export const createEmployeeSchema = z.object({
  full_name: z.string().min(2, "Name ist zu kurz").max(160),
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
  notes: z.string().max(2000).optional().or(z.literal("")),
  /**
   * Role assigned to the invited user. Used by the `handle_new_user()`
   * trigger when the invitee accepts the magic-link email. Defaults to
   * the lowest-privilege role.
   */
  role: employeeRoleEnum.default("employee"),
});
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
