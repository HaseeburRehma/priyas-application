import { z } from "zod";

export const createDamageReportSchema = z.object({
  property_id: z.string().uuid(),
  shift_id: z.string().uuid().nullable().optional(),
  employee_id: z.string().uuid().nullable().optional(),
  severity: z.coerce.number().int().min(1).max(5),
  category: z.enum(["normal", "note", "problem", "damage"]),
  description: z.string().min(3).max(4000),
  photo_paths: z.array(z.string()).default([]),
});
export type CreateDamageReportInput = z.infer<typeof createDamageReportSchema>;

export const resolveDamageReportSchema = z.object({
  id: z.string().uuid(),
  resolved: z.boolean(),
});
export type ResolveDamageReportInput = z.infer<typeof resolveDamageReportSchema>;
