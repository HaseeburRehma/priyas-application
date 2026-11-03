import { z } from "zod";

export const checkInSchema = z.object({
  shift_id: z.string().uuid(),
  kind: z.enum(["check_in", "check_out"]),
  // GPS is evidence, not a gate: no fix indoors / permission denied still
  // records the event, just without coordinates (same rule as mobile).
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracy_m: z.number().nonnegative().max(5000).nullable().optional(),
  /** Staff confirmed "yes, I'm here" after the out-of-radius warning. */
  confirm_far: z.boolean().optional(),
}).refine((v) => (v.latitude == null) === (v.longitude == null), {
  message: "latitude and longitude go together",
  path: ["latitude"],
});
export type CheckInInput = z.infer<typeof checkInSchema>;

/**
 * Break events don't carry GPS — staff can step off-site for a
 * coffee or sit down inside the building, and the break timer
 * shouldn't fight with the geofence. We just record the moment.
 */
export const breakSchema = z.object({
  shift_id: z.string().uuid(),
  kind: z.enum(["break_start", "break_end"]),
});
export type BreakInput = z.infer<typeof breakSchema>;

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
