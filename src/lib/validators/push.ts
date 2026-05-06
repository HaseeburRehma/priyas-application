import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  user_agent: z.string().max(500).optional().or(z.literal("")),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
