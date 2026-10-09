/**
 * Bottom-tab shell for signed-in users — Figma "Tab Bar" component:
 * Start · Plan · Chat · Mehr, active tab in a green pill, unread chat
 * count as a red badge. Everything else (clients, dashboard, settings,
 * admin surfaces) lives behind "Mehr"; those routes stay registered
 * with `href: null` so <Link>/router.push still reach them.
 */

import { Tabs } from "expo-router";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Icon, type IconName } from "@/components/icon";
import { Txt } from "@/components/ui";
import { loadMyChannels } from "@/lib/chat";
import { useAuth } from "@/lib/auth-context";
import { colors, shadow } from "@/lib/theme";
import { t } from "@/lib/i18n";

const TABS: { name: string; icon: IconName; label: () => string }[] = [
  { name: "index", icon: "home", label: () => t("bottomNav.home") },
  { name: "schedule/index", icon: "calendar", label: () => t("bottomNav.schedule") },
  { name: "chat", icon: "chat", label: () => t("bottomNav.chat") },
  { name: "more", icon: "more", label: () => t("mobile.more.tabLabel") },
];

// expo-router vendors react-navigation, so derive the props from <Tabs>.
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // Shares the cache with the Chat tab, so opening Chat is instant.
  const { data: channels } = useQuery({
    queryKey: ["chat-channels"],
    queryFn: loadMyChannels,
    enabled: !!session,
    refetchInterval: 60_000,
  });
  const unread = (channels ?? []).reduce((n, c) => n + (c.unread_count ?? 0), 0);
  const activeName = state.routes[state.index]?.name ?? "index";
  // Detail routes highlight their parent tab.
  const activeTab = activeName.startsWith("schedule")
    ? "schedule/index"
    : TABS.some((x) => x.name === activeName)
      ? activeName
      : "more";

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const on = tab.name === activeTab;
        const fg = on ? colors.primary[700] : colors.neutral[500];
        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label()}
            onPress={() => {
              const route = state.routes.find((r) => r.name === tab.name);
              const event = navigation.emit({ type: "tabPress", target: route?.key ?? tab.name, canPreventDefault: true });
              // Navigate whenever we're not already on the tab's own root —
              // e.g. tapping "Mehr" from Alarme (a hidden child) returns to Mehr.
              if (activeName !== tab.name && !event.defaultPrevented) {
                navigation.navigate(tab.name as never);
              }
            }}
            style={styles.item}
          >
            <View style={[styles.pill, on && { backgroundColor: colors.primary[50] }]}>
              <Icon name={tab.icon} size={22} color={fg} />
              {tab.name === "chat" && unread > 0 ? (
                <View style={styles.badge}>
                  <Txt v="tabLabel" color={colors.white}>
                    {unread > 99 ? "99+" : String(unread)}
                  </Txt>
                </View>
              ) : null}
            </View>
            <Txt v="tabLabel" color={fg}>
              {tab.label()}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="schedule/index" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="more" />

      {/* ---------- Reachable routes, hidden from the tab bar ---------- */}
      {/* Schedule detail / create sub-routes */}
      <Tabs.Screen name="schedule/[id]" options={{ href: null }} />
      <Tabs.Screen name="schedule/new" options={{ href: null }} />
      {/* Surfaces linked from the More screen */}
      <Tabs.Screen name="clients" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    ...shadow.sm,
  },
  item: { flex: 1, alignItems: "center", gap: 4 },
  pill: { width: 60, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -3,
    left: 34,
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: "center",
    backgroundColor: colors.error[500],
    borderWidth: 2,
    borderColor: colors.white,
  },
});
