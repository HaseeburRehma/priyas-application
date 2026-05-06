import { z } from "zod";

export const checkInSchema = z.object({
  shift_id: z.string().uuid(),
  kind: z.enum(["check_in", "check_out"]),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy_m: z.coerce.number().nonnegative().max(5000).optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const correctTimeEntrySchema = z.object({
  shift_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  kind: z.enum(["check_in", "check_out"]),
  occurred_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Ungültiges Datum",
  }),
  reason: z.string().min(3).max(2000),
});
export type CorrectTimeEntryInput = z.infer<typeof correctTimeEntrySchema>;
