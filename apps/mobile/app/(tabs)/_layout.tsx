/**
 * Bottom-tab shell for signed-in users.
 *
 * Field staff sees: Home (MySelf) · Schedule · Chat · Notifications
 * Admin / dispatcher also gets: Clients, Reports (added dynamically).
 *
 * Icons are inline SVGs so we don't need an icon-font asset — keeps
 * the bundle small and avoids splash-blocking font loads.
 */

import { Tabs } from "expo-router";
import { View } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { colors, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

type IconProps = { color: string; size: number };

const Icons = {
  home: ({ color, size }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
    </Svg>
  ),
  schedule: ({ color, size }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={4} width={18} height={18} rx={2} />
      <Path d="M16 2v4M8 2v4M3 10h18" />
    </Svg>
  ),
  chat: ({ color, size }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </Svg>
  ),
  bell: ({ color, size }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
    </Svg>
  ),
  clients: ({ color, size }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <Circle cx={9} cy={7} r={4} />
      <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </Svg>
  ),
  settings: ({ color, size }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9 1.65 1.65 0 004.27 7.18l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </Svg>
  ),
};

export default function TabsLayout() {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const showClients = can(role, "client.read") && role !== "employee";
  // Same permission the web app uses to gate the org-scope dashboard —
  // Field Staff never see it. Admin + dispatcher do.
  const showDashboard = can(role, "time.read_all");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.neutral[500],
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.neutral[100],
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: typography.size.xs,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("bottomNav.dashboard"),
          tabBarIcon: ({ color, size }) => <Icons.home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="schedule/index"
        options={{
          title: t("bottomNav.schedule"),
          tabBarIcon: ({ color, size }) => <Icons.schedule color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="schedule/[id]"
        options={{
          href: null, // hide from tab bar; reached via <Link>
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t("bottomNav.chat"),
          tabBarIcon: ({ color, size }) => <Icons.chat color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("nav.clients"),
          tabBarIcon: ({ color, size }) => <Icons.clients color={color} size={size} />,
          href: showClients ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t("dashboardTab.tabLabel"),
          tabBarIcon: ({ color, size }) => <Icons.home color={color} size={size} />,
          href: showDashboard ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t("bottomNav.notifications"),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Icons.bell color={color} size={size} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("bottomNav.settings"),
          tabBarIcon: ({ color, size }) => <Icons.settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
