import { z } from "zod";

export const upsertClientContactSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid(),
  full_name: z.string().min(2).max(200),
  role: z.string().max(80).optional().or(z.literal("")),
  email: z
    .string()
    .email()
    .max(200)
    .optional()
    .or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  is_primary: z.boolean().default(false),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type UpsertClientContactInput = z.infer<typeof upsertClientContactSchema>;
