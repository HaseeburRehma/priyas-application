import { z } from "zod";

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Ungültiges Datum" });

export const upsertPropertyClosureSchema = z
  .object({
    id: z.string().uuid().optional(),
    property_id: z.string().uuid(),
    start_date: isoDate,
    end_date: isoDate,
    reason: z.enum([
      "public_holiday",
      "tenant_closed",
      "renovation",
      "weather",
      "other",
    ]),
    notes: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => new Date(v.end_date) >= new Date(v.start_date), {
    message: "Ende muss am oder nach dem Start liegen.",
    path: ["end_date"],
  });
export type UpsertPropertyClosureInput = z.infer<
  typeof upsertPropertyClosureSchema
>;
