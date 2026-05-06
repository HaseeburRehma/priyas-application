import { z } from "zod";

export const createPropertySchema = z.object({
  client_id: z.string().uuid("Kunde erforderlich"),
  name: z.string().min(2, "Name ist zu kurz").max(200),
  address_line1: z.string().min(2, "Adresse erforderlich").max(200),
  address_line2: z.string().max(200).optional().or(z.literal("")),
  postal_code: z.string().min(3).max(20),
  city: z.string().min(2).max(100),
  country: z.string().min(2).max(2).default("DE"),
  size_sqm: z
    .number()
    .nonnegative()
    .max(1_000_000)
    .optional()
    .or(z.literal("")),
  // Structured location detail
  floor: z.string().max(60).optional().or(z.literal("")),
  building_section: z.string().max(120).optional().or(z.literal("")),
  access_code: z.string().max(60).optional().or(z.literal("")),
  // Structured safety + access notes
  allergies: z.string().max(2000).optional().or(z.literal("")),
  restricted_areas: z.string().max(2000).optional().or(z.literal("")),
  safety_regulations: z.string().max(2000).optional().or(z.literal("")),
  // Free-text catch-all
  notes: z.string().max(4000).optional().or(z.literal("")),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.and(
  z.object({ id: z.string().uuid() }),
);
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
