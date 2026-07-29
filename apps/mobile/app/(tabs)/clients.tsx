import { StubScreen } from "@/components/stub";
import { t } from "@/lib/i18n";

export default function ClientsTab() {
  // Admin + dispatcher only — the tab is hidden for employees at the
  // navigation layer (see (tabs)/_layout.tsx), but any direct-URL
  // navigation would still land here so the RLS layer stays the source
  // of truth.
  return (
    <StubScreen
      title={t("nav.clients")}
      subtitle={t("clients.subtitle")}
      body="Client list + intake wizard land in the next mobile turn. Web feature parity is the target: search, status dropdown, buildings preview, statement download."
    />
  );
}
