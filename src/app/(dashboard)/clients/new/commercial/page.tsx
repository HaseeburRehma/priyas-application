import { redirect } from "next/navigation";
import { CreateClientForm } from "@/components/clients/CreateClientForm";
import { can } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

export default async function Page() {
  if (!(await can("client.create"))) redirect(routes.clients);
  return <CreateClientForm type="commercial" />;
}
