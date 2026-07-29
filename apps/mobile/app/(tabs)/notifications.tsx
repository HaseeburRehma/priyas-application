import { StubScreen } from "@/components/stub";
import { t } from "@/lib/i18n";

export default function NotificationsTab() {
  return (
    <StubScreen
      title={t("notifications.title")}
      subtitle={t("notifications.subtitle")}
      body="The notifications inbox — filter pills, mark-as-read, per-category grouping — lands in the next mobile turn along with push registration."
    />
  );
}
