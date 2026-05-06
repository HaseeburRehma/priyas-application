import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: "auth.validation.emailRequired" })
    .email({ message: "auth.validation.emailInvalid" }),
  password: z
    .string()
    .min(8, { message: "auth.validation.passwordMin" })
    .max(72, { message: "auth.validation.passwordMax" }),
  rememberMe: z.boolean().default(true),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "auth.validation.emailInvalid" }),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Self-serve signup. Password rules match Supabase's built-in defaults. */
export const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, { message: "Bitte gib deinen vollständigen Namen ein." })
    .max(120),
  email: z
    .string()
    .min(1, { message: "auth.validation.emailRequired" })
    .email({ message: "auth.validation.emailInvalid" }),
  password: z
    .string()
    .min(8, { message: "Passwort muss mindestens 8 Zeichen haben." })
    .max(72, { message: "Passwort ist zu lang." })
    // Cheap entropy heuristic: at least one letter and one digit/symbol.
    .refine((v) => /[A-Za-z]/.test(v) && /[^A-Za-z]/.test(v), {
      message: "Passwort muss Buchstaben und Zahlen/Sonderzeichen enthalten.",
    }),
  acceptTerms: z.literal<boolean>(true, {
    errorMap: () => ({
      message: "Bitte akzeptiere die Nutzungsbedingungen.",
    }),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;
