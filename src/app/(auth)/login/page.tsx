import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { AuthBrandPanel } from "@/components/layout/AuthBrandPanel";

export const metadata: Metadata = { title: "Anmelden" };

/**
 * 01-login.html — split-screen login.
 * Left: dark gradient brand panel. Right: white form panel.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <AuthBrandPanel />
      <LoginForm />
    </main>
  );
}
