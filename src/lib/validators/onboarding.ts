import { z } from "zod";
import { createClientSchema } from "./clients";

/**
 * Tablet onboarding wizard payload — wraps the standard client schema with
 * optional address (for property creation) and a required signature.
 *
 * Signature is captured as a raw SVG <path d="..."/> string by the canvas
 * pad on the client. We persist that into client_signatures.signature_svg.
 */
export const onboardClientSchema = z.object({
  client: createClientSchema,
  address: z
    .object({
      address_line1: z.string().max(200),
      address_line2: z.string().max(200).optional().or(z.literal("")),
      postal_code: z.string().max(20),
      city: z.string().max(100),
      country: z.string().max(2).default("DE"),
    })
    .optional(),
  service_preferences: z
    .object({
      frequency: z
        .enum(["weekly", "biweekly", "monthly", "one_off"])
        .default("biweekly"),
      preferred_day: z
        .enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
        .nullable()
        .optional(),
      special_notes: z.string().max(2000).optional().or(z.literal("")),
    })
    .optional(),
  signature: z.object({
    signed_by_name: z.string().min(2).max(200),
    signature_svg: z
      .string()
      .min(20, "Signature missing")
      .max(200_000),
    consent_data_processing: z.literal(true),
  }),
});
export type OnboardClientInput = z.infer<typeof onboardClientSchema>;
