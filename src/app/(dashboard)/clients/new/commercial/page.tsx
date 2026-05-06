import { redirect } from "next/navigation";
import { CreateClientForm } from "@/components/clients/CreateClientForm";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

export default async function Page() {
  try {
    await requirePermission("client.create");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.clients);
    throw err;
  }
  return <CreateClientForm type="commercial" />;
}
