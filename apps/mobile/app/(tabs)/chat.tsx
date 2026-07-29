import { StubScreen } from "@/components/stub";
import { t } from "@/lib/i18n";

export default function ChatTab() {
  return (
    <StubScreen
      title={t("chat.title")}
      subtitle={t("chat.subtitle")}
      body="Realtime team chat comes online in the next mobile turn: message threads, typing indicators, inline shift/visit cards, and push-notification wiring."
    />
  );
}
