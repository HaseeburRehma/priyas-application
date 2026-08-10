import { Stack } from "expo-router";
import { colors } from "@/lib/theme";

/**
 * Stack for the Clients drill-down. Sits outside the tabs so pushing
 * a detail replaces the bottom-tab bar with a real header — the same
 * pattern used by chat/[channelId] and damage/new.
 */
export default function ClientsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.tertiary[200] },
      }}
    />
  );
}
