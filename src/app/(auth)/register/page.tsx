import type { Metadata } from "next";
import { AuthBrandPanel } from "@/components/layout/AuthBrandPanel";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Konto erstellen" };

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <AuthBrandPanel />
      <RegisterForm />
    </main>
  );
}
