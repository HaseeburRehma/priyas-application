import { z } from "zod";

export const customerTypeSchema = z.enum([
  "residential",
  "commercial",
  "alltagshilfe",
]);

/** Shared base — used by both Priya's-regular and Alltagshilfe forms. */
const baseClient = {
  display_name: z.string().min(2, "Name ist zu kurz").max(200),
  contact_name: z.string().max(120).optional().or(z.literal("")),
  email: z
    .string()
    .email("Ungültige E-Mail")
    .max(200)
    .optional()
    .or(z.literal("")),
  // Restrict to digits + standard phone punctuation. Prevents control
  // characters (newlines / tabs) from sneaking into the field, which the
  // PDF and CSV exports used to break on.
  phone: z
    .string()
    .max(40)
    .regex(/^[\d\s+\-().]+$/, "Ungültige Telefonnummer")
    .optional()
    .or(z.literal("")),
  tax_id: z.string().max(40).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
};

export const createClientSchema = z.discriminatedUnion("customer_type", [
  // Priya's regular service: residential or commercial
  z.object({
    customer_type: z.literal("residential"),
    ...baseClient,
  }),
  z.object({
    customer_type: z.literal("commercial"),
    ...baseClient,
  }),
  // Alltagshilfe — adds insurance fields and care level (1–5).
  z.object({
    customer_type: z.literal("alltagshilfe"),
    ...baseClient,
    insurance_provider: z.string().min(1, "Pflegekasse erforderlich").max(80),
    insurance_number: z.string().min(1, "Versicherungsnummer erforderlich").max(40),
    care_level: z
      .number({ invalid_type_error: "Pflegegrad 1–5" })
      .int()
      .min(1)
      .max(5),
  }),
]);
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.and(
  z.object({ id: z.string().uuid() }),
);
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
