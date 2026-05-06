import { z } from "zod";

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Ungültiges Datum",
});

export const createVacationSchema = z
  .object({
    employee_id: z.string().uuid(),
    start_date: isoDate,
    end_date: isoDate,
    reason: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => new Date(v.end_date) >= new Date(v.start_date), {
    message: "Ende muss am oder nach dem Start liegen.",
    path: ["end_date"],
  });

export type CreateVacationInput = z.infer<typeof createVacationSchema>;

export const reviewVacationSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  reviewer_note: z.string().max(2000).optional().or(z.literal("")),
});
export type ReviewVacationInput = z.infer<typeof reviewVacationSchema>;

/**
 * Manager response to a pending request: instead of approve/reject, propose
 * alternative dates. Status flips to "suggested"; the employee can accept
 * (which approves), counter-suggest, or withdraw.
 */
export const suggestVacationSchema = z
  .object({
    id: z.string().uuid(),
    suggested_start: isoDate,
    suggested_end: isoDate,
    reviewer_note: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine(
    (v) => new Date(v.suggested_end) >= new Date(v.suggested_start),
    {
      message: "Ende muss am oder nach dem Start liegen.",
      path: ["suggested_end"],
    },
  );
export type SuggestVacationInput = z.infer<typeof suggestVacationSchema>;

export const respondVacationSuggestionSchema = z.object({
  id: z.string().uuid(),
  /** Accept = approve with the suggested dates as the canonical ones. */
  accept: z.boolean(),
});
export type RespondVacationSuggestionInput = z.infer<
  typeof respondVacationSuggestionSchema
>;
