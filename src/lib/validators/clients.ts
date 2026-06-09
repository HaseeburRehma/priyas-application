import { z } from "zod";

export const customerTypeSchema = z.enum([
  "residential",
  "commercial",
  "alltagshilfe",
]);

export const cleaningRhythmSchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "on_demand",
]);
export type CleaningRhythm = z.infer<typeof cleaningRhythmSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum YYYY-MM-DD");
const optionalIsoDate = isoDate.optional().or(z.literal(""));
const optionalText = (max: number) =>
  z.string().max(max).optional().or(z.literal(""));

/**
 * Shared base used by every customer-type variant. Mirrors the German
 * intake list the operations team fills out at onboarding:
 *
 *   Vorname / Name        → first_name / last_name
 *   Adresse               → address_line1 + postal_code + city
 *   E-Mail / Telefon      → email / phone
 *   Sonstiges             → notes
 *
 * `display_name` is still kept (and derived from first + last on the
 * server side via a setter) so legacy queries that select on it stay
 * working without a join.
 */
const baseClient = {
  display_name: z.string().min(2, "Name ist zu kurz").max(200),
  first_name: z.string().min(1, "Vorname erforderlich").max(100),
  last_name: z.string().min(1, "Name erforderlich").max(100),
  contact_name: optionalText(120),
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
  tax_id: optionalText(40),
  // Service address — required for both kinds, since invoices need
  // somewhere to ship and the GPS-check-in radius is anchored to it.
  address_line1: z.string().min(1, "Adresse erforderlich").max(200),
  address_line2: optionalText(200),
  postal_code: z.string().min(3, "PLZ erforderlich").max(20),
  city: z.string().min(1, "Stadt erforderlich").max(120),
  country: optionalText(60),
  notes: optionalText(4000),
};

/** Priya's-regular (residential + commercial) extras from the intake list. */
const priyaExtras = {
  // Optional separate billing address. The form only shows these fields
  // when the user ticks "billing address differs from service address",
  // so empty strings here mean "same as service".
  billing_address_line1: optionalText(200),
  billing_address_line2: optionalText(200),
  billing_postal_code: optionalText(20),
  billing_city: optionalText(120),
  billing_country: optionalText(60),
  cleaning_rhythm: cleaningRhythmSchema,
  estimated_hours_per_visit: z
    .number({ invalid_type_error: "Geschätzte Stunden 0–24" })
    .positive()
    .max(24),
  agreed_hourly_rate_cents: z
    .number({ invalid_type_error: "Stundensatz erforderlich" })
    .int()
    .min(0),
  contract_start: isoDate,
};

/** Alltagshilfe extras — different list per the client's spec. */
const alltagshilfeExtras = {
  date_of_birth: isoDate,
  insurance_provider: z.string().min(1, "Pflegekasse erforderlich").max(80),
  insurance_number: z.string().min(1, "Versicherungsnummer erforderlich").max(40),
  care_level: z
    .number({ invalid_type_error: "Pflegegrad 1–5" })
    .int()
    .min(1)
    .max(5),
  abtretungserklaerung: z.boolean(),
  cleaning_rhythm: cleaningRhythmSchema,
  estimated_hours_per_visit: z
    .number({ invalid_type_error: "Geschätzte Stunden 0–24" })
    .positive()
    .max(24),
  contract_docs_signed: z.boolean(),
};

export const createClientSchema = z.discriminatedUnion("customer_type", [
  // Priya's regular service: residential
  z.object({
    customer_type: z.literal("residential"),
    ...baseClient,
    ...priyaExtras,
  }),
  // Priya's regular service: commercial (companies). Same extras.
  z.object({
    customer_type: z.literal("commercial"),
    ...baseClient,
    ...priyaExtras,
  }),
  // Alltagshilfe — different extras + insurance.
  z.object({
    customer_type: z.literal("alltagshilfe"),
    ...baseClient,
    ...alltagshilfeExtras,
  }),
]);
export type CreateClientInput = z.infer<typeof createClientSchema>;

/**
 * Update schema — only the fields the EditClientForm actually sends.
 * The action never overwrites address, cleaning rhythm, contract dates, etc.,
 * so those fields must not be required here.
 */
const updateBase = {
  id: z.string().uuid(),
  display_name: z.string().min(2, "Name ist zu kurz").max(200),
  contact_name: optionalText(120),
  email: z
    .string()
    .email("Ungültige E-Mail")
    .max(200)
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .max(40)
    .regex(/^[\d\s+\-().]+$/, "Ungültige Telefonnummer")
    .optional()
    .or(z.literal("")),
  tax_id: optionalText(40),
  notes: optionalText(4000),
};

export const updateClientSchema = z.discriminatedUnion("customer_type", [
  z.object({ customer_type: z.literal("residential"), ...updateBase }),
  z.object({ customer_type: z.literal("commercial"), ...updateBase }),
  z.object({
    customer_type: z.literal("alltagshilfe"),
    ...updateBase,
    insurance_provider: z.string().min(1, "Pflegekasse erforderlich").max(80),
    insurance_number: z.string().min(1, "Versicherungsnummer erforderlich").max(40),
    care_level: z
      .number({ invalid_type_error: "Pflegegrad 1–5" })
      .int()
      .min(1)
      .max(5),
  }),
]);
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// Re-export of the unused-for-now optionalIsoDate helper so future fields
// (e.g. a contract_end-style cancellation date) can compose against it.
export { optionalIsoDate };
