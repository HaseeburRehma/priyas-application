import { redirect } from "next/navigation";
import { routes } from "@/lib/constants/routes";

/** Root → dashboard (middleware handles unauthenticated redirects). */
export default function RootPage() {
  redirect(routes.dashboard);
}
