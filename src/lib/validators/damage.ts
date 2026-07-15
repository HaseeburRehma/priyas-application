import { z } from "zod";

export const createDamageReportSchema = z.object({
  property_id: z.string().uuid(),
  shift_id: z.string().uuid().nullable().optional(),
  employee_id: z.string().uuid().nullable().optional(),
  severity: z.coerce.number().int().min(1).max(5),
  category: z.enum(["normal", "note", "problem", "damage"]),
  description: z.string().min(3).max(4000),
  // Client-side cap already exists (src/lib/utils/image.ts's
  // enforcePhotoCap()) but a direct action/API call could bypass it —
  // this closes that gap server-side. Doesn't retroactively touch
  // existing rows (photo_paths is a plain text[], no CHECK constraint),
  // only blocks new over-cap writes.
  photo_paths: z.array(z.string()).max(20, "Maximal 20 Fotos pro Meldung.").default([]),
});
export type CreateDamageReportInput = z.infer<typeof createDamageReportSchema>;

export const resolveDamageReportSchema = z.object({
  id: z.string().uuid(),
  resolved: z.boolean(),
});
export type ResolveDamageReportInput = z.infer<typeof resolveDamageReportSchema>;
