import { z } from "zod";

/**
 * Feature-update #17 — quick / one-time cleaning jobs that don't need
 * a full customer record. Backed by public.one_off_jobs (migration
 * 20260921_000062). Every field is deliberately minimal — the PDF
 * spec is exactly "staff member + date + short description + hours =
 * done".
 */
export const createOneOffJobSchema = z.object({
  employee_id: z.string().uuid("Mitarbeiter erforderlich"),
  performed_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
  description: z
    .string()
    .min(1, "Beschreibung erforderlich")
    .max(500, "Max. 500 Zeichen"),
  hours: z
    .number({ invalid_type_error: "Stunden als Zahl angeben" })
    .positive("Stunden > 0")
    .max(24, "Max. 24 Stunden pro Job"),
  invoice_note: z
    .string()
    .max(500, "Max. 500 Zeichen")
    .optional()
    .or(z.literal("")),
});
export type CreateOneOffJobInput = z.infer<typeof createOneOffJobSchema>;
