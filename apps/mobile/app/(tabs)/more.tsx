/**
 * "More" tab — hub for surfaces that don't warrant their own bottom
 * tab. Rendered for every signed-in user; each row is gated on the
 * relevant permission so field staff only see Training / Damage /
 * Vacation, and admin sees the full admin roster.
 */

import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Path, Rect, Circle } from "react-native-svg";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

type Item = {
  key: string;
  labelKey: string;
  hintKey: string;
  href: string;
  icon: (color: string) => React.ReactNode;
  visible: boolean;
};

export default function MoreScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const canManage = can(role, "time.read_all");

  const items: Item[] = [
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
      key: "training",
      labelKey: "mobile.more.training",
      hintKey: "mobile.more.trainingHint",
      href: "/training",
      icon: (c) => (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M23 7l-9 6-9-6" />
          <Rect x={5} y={5} width={18} height={14} rx={2} />
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
          <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
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
  ];

  const visible = items.filter((i) => i.visible);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t("mobile.more.title")}</Text>
        <Text style={styles.sub}>{t("mobile.more.subtitle")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing[4], gap: 10 }}>
        {visible.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => router.push(item.href as never)}
            style={({ pressed }) => [
              styles.row,
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={styles.iconBox}>{item.icon(colors.secondary[500])}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t(item.labelKey as never)}</Text>
              <Text style={styles.rowHint}>{t(item.hintKey as never)}</Text>
            </View>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.neutral[400]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 18l6-6-6-6" />
            </Svg>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing[4],
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[100],
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
