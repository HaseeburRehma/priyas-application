import { z } from "zod";

export const upsertTrainingModuleSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().or(z.literal("")),
  video_url: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),
  is_mandatory: z.boolean().default(false),
  position: z.coerce.number().int().min(0).max(999).default(0),
  locale: z.enum(["de", "en", "ta"]).default("de"),
});
export type UpsertTrainingModuleInput = z.infer<
  typeof upsertTrainingModuleSchema
>;

export const trainingProgressSchema = z.object({
  module_id: z.string().uuid(),
  state: z.enum(["start", "complete", "reset"]),
  // Optional: when state === "complete" on a mandatory module, the
  // SignaturePad's SVG payload (raw <svg>...</svg> markup). The action
  // uploads it to the employee-docs bucket and stores the path on
  // employee_training_progress.signature_path. Capped at 64 KB which is
  // ~10x the size of a typical pen-stroke SVG.
  signature_svg: z.string().min(50).max(64_000).optional(),
});
export type TrainingProgressInput = z.infer<typeof trainingProgressSchema>;
