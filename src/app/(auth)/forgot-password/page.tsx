"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validators/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/constants/env";
import { routes } from "@/lib/constants/routes";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: ForgotPasswordInput) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}${routes.resetPassword}`,
    });
    if (error) {
      toast.error("Couldn't send the reset link. Try again.");
      return;
    }
    setSent(true);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-tertiary-200 px-6">
      <div className="card w-full max-w-md p-8">
        <h1 className="mb-2 text-[22px] font-bold text-neutral-900">
          Passwort zurücksetzen
        </h1>
        <p className="mb-6 text-[13px] text-neutral-500">
          Wir senden dir einen Link zum Zurücksetzen deines Passworts.
        </p>

        {sent ? (
          <p className="rounded-md bg-success-50 px-4 py-3 text-[13px] text-success-700">
            Wenn ein Konto mit dieser E-Mail existiert, wurde ein Link gesendet.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
            <input
              type="email"
              autoComplete="email"
              placeholder="name@beispiel.de"
              className="input"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-[12px] text-error-700">{errors.email.message}</p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn--primary"
              style={{ minHeight: 48 }}
            >
              Link senden
            </button>
          </form>
        )}

        <Link
          href={routes.login}
          className="mt-6 block text-center text-[13px] text-primary-600 hover:underline"
        >
          ← Zurück zur Anmeldung
        </Link>
      </div>
    </main>
  );
}
