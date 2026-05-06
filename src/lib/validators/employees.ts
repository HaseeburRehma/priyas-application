import { z } from "zod";

const isoDate = z
  .string()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
    message: "Ungültiges Datum",
  });

export const createEmployeeSchema = z.object({
  full_name: z.string().min(2, "Name ist zu kurz").max(160),
  email: z
    .string()
    .email("Ungültige E-Mail")
    .max(200)
    .optional()
    .or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
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
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.and(
  z.object({ id: z.string().uuid() }),
);
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
