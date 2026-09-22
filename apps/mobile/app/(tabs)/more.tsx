/**
 * "More" tab — acts as the app's sidebar / secondary navigation.
 *
 * The bottom tab bar only carries four primary destinations
 * (Home · Schedule · Chat · More); everything else lives here in
 * grouped sections so each row has a comfortable tap target and
 * users scan by category rather than a flat wall of icons.
 *
 * Sections:
 *   - Workspace    → Clients · Team dashboard · Employees · Properties
 *   - Reports & Billing → Invoices · Alltagshilfe monthly report
 *   - Field Work   → Training · Damage reports · Vacation
 *   - You          → Alerts · Settings · Sign out
 *
 * Each row is gated by role permissions — Field Staff see only
 * Field Work + You; Admin/Dispatch see everything. Empty sections
 * are hidden entirely so the layout never shows a lonely header.
 */

import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Path, Rect, Circle } from "react-native-svg";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

type IconColor = string;
type Item = {
  key: string;
  labelKey: string;
  hintKey: string;
  href?: string;
  icon: (color: IconColor) => React.ReactNode;
  visible: boolean;
  onPress?: () => void;
  danger?: boolean;
};
type Section = { titleKey: string; items: Item[] };

export default function MoreScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? null;
  const canManage = can(role, "time.read_all");
  const canReadClients = can(role, "client.read") && role !== "employee";

  const iconStroke = colors.secondary[500];
  const dangerStroke = colors.error?.[500] ?? "#DC2626";

  const sections: Section[] = [
    {
      titleKey: "mobile.more.sectionWorkspace",
      items: [
        {
          key: "clients",
          labelKey: "mobile.more.clients",
          hintKey: "mobile.more.clientsHint",
          href: "/clients",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <Circle cx={9} cy={7} r={4} />
              <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </Svg>
          ),
          visible: canReadClients,
        },
        {
          key: "dashboard",
          labelKey: "mobile.more.dashboard",
          hintKey: "mobile.more.dashboardHint",
          href: "/dashboard",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Rect x={3} y={3} width={7} height={9} rx={1} />
              <Rect x={14} y={3} width={7} height={5} rx={1} />
              <Rect x={14} y={12} width={7} height={9} rx={1} />
              <Rect x={3} y={16} width={7} height={5} rx={1} />
            </Svg>
          ),
          visible: canManage,
        },
        {
          key: "employees",
          labelKey: "mobile.more.employees",
          hintKey: "mobile.more.employeesHint",
          href: "/employees",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <Circle cx={9} cy={7} r={4} />
            </Svg>
          ),
          visible: canManage,
        },
        {
          key: "properties",
          labelKey: "mobile.more.properties",
          hintKey: "mobile.more.propertiesHint",
          href: "/properties",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 21V7l8-4 8 4v14M9 21V12h6v9" />
            </Svg>
          ),
          visible: canManage,
        },
      ],
    },
    {
      titleKey: "mobile.more.sectionReports",
      items: [
        {
          key: "invoices",
          labelKey: "mobile.more.invoices",
          hintKey: "mobile.more.invoicesHint",
          href: "/invoices",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <Path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" />
            </Svg>
          ),
          visible: canManage,
        },
        {
          key: "reports",
          labelKey: "mobile.more.reports",
          hintKey: "mobile.more.reportsHint",
          href: "/reports/alltagshilfe",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 20V10M12 20V4M6 20v-6" />
            </Svg>
          ),
          visible: canManage,
        },
        {
          key: "workReport",
          labelKey: "mobile.more.workReport",
          hintKey: "mobile.more.workReportHint",
          href: "/reports/work-report",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <Path d="M14 2v6h6M9 15l2 2 4-4" />
            </Svg>
          ),
          visible: true,
        },
      ],
    },
    {
      titleKey: "mobile.more.sectionField",
      items: [
        {
          key: "training",
          labelKey: "mobile.more.training",
          hintKey: "mobile.more.trainingHint",
          href: "/training",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 4h16v14H4z M2 20h20 M12 4v14" />
            </Svg>
          ),
          visible: true,
        },
        {
          key: "damage",
          labelKey: "mobile.more.damage",
          hintKey: "mobile.more.damageHint",
          href: "/damage",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <Path d="M12 9v4M12 17h.01" />
            </Svg>
          ),
          visible: true,
        },
        {
          key: "supplies",
          labelKey: "mobile.more.supplies",
          hintKey: "mobile.more.suppliesHint",
          href: "/supplies/new",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 3h6l-1 5h4l-4 6 1 7-9-6 1-7L2 8h4z" />
            </Svg>
          ),
          visible: true,
        },
        {
          key: "vacation",
          labelKey: "mobile.more.vacation",
          hintKey: "mobile.more.vacationHint",
          href: "/vacation",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M2 22c1.25-1.25 2.5-2 4-2s2.75.75 4 2 2.5 2 4 2 2.75-.75 4-2 2.5-2 4-2" />
              <Path d="M4 12h6l3 6 3-6h4M9 4l6-2" />
            </Svg>
          ),
          visible: true,
        },
      ],
    },
    {
      titleKey: "mobile.more.sectionAccount",
      items: [
        {
          key: "notifications",
          labelKey: "mobile.more.notifications",
          hintKey: "mobile.more.notificationsHint",
          href: "/notifications",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
            </Svg>
          ),
          visible: true,
        },
        {
          key: "settings",
          labelKey: "mobile.more.settings",
          hintKey: "mobile.more.settingsHint",
          href: "/settings",
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={12} cy={12} r={3} />
              <Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9 1.65 1.65 0 004.27 7.18l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </Svg>
          ),
          visible: true,
        },
        {
          key: "signOut",
          labelKey: "mobile.more.signOut",
          hintKey: "mobile.more.signOutHint",
          onPress: () =>
            Alert.alert(
              t("mobile.more.signOut"),
              t("mobile.more.signOutHint"),
              [
                { text: t("common.cancel") ?? "Cancel", style: "cancel" },
                {
                  text: t("mobile.more.signOut"),
                  style: "destructive",
                  onPress: () => signOut(),
                },
              ],
            ),
          icon: (c) => (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </Svg>
          ),
          visible: true,
          danger: true,
        },
      ],
    },
  ];

  const activeSections = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.visible) }))
    .filter((s) => s.items.length > 0);

  const handleRow = (item: Item) => {
    if (item.onPress) return item.onPress();
    if (item.href) router.push(item.href as never);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t("mobile.more.title")}</Text>
        <Text style={styles.sub}>{t("mobile.more.subtitle")}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {activeSections.map((section) => (
          <View key={section.titleKey} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
            <View style={styles.card}>
              {section.items.map((item, idx) => {
                const isLast = idx === section.items.length - 1;
                const stroke = item.danger ? dangerStroke : iconStroke;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => handleRow(item)}
                    android_ripple={{ color: colors.neutral[100] }}
                    style={({ pressed }) => [
                      styles.row,
                      !isLast && styles.rowDivider,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconBox,
                        item.danger && { backgroundColor: "#FEECEC" },
                      ]}
                    >
                      {item.icon(stroke)}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.rowLabel,
                          item.danger && { color: dangerStroke },
                        ]}
                      >
                        {t(item.labelKey)}
                      </Text>
                      <Text style={styles.rowHint}>{t(item.hintKey)}</Text>
                    </View>
                    {!item.danger && (
                      <Svg
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={colors.neutral[400]}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <Path d="M9 18l6-6-6-6" />
                      </Svg>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <View style={{ height: spacing[6] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  scroll: {
    padding: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[5],
  },
  section: {
    gap: spacing[2],
  },
  sectionTitle: {
    fontSize: typography.size.xs,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginLeft: spacing[2],
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3] + 2,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondary[50],
  },
  rowLabel: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  rowHint: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
});
