import { z } from "zod";

const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Ungültiges Datum",
});

export const createShiftSchema = z
  .object({
    property_id: z.string().uuid("Objekt erforderlich"),
    employee_id: z.string().uuid("Mitarbeiter erforderlich").nullable().optional(),
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    notes: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: "Ende muss nach dem Start liegen.",
    path: ["ends_at"],
  });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = createShiftSchema.and(
  z.object({ id: z.string().uuid() }),
);
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
