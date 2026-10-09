/**
 * "More" tab — Figma "10 · Mehr". Acts as the app's sidebar /
 * secondary navigation.
 *
 * The bottom tab bar only carries four primary destinations
 * (Home · Schedule · Chat · More); everything else lives here in
 * grouped cards so each row has a comfortable tap target and users
 * scan by category rather than a flat wall of icons.
 *
 * Sections:
 *   - Workspace         → Clients · Properties · Employees · Team dashboard · Alerts
 *   - Field Work        → Vacation · Damage reports · Supplies · Training
 *   - Reports & Billing → Invoices · Alltagshilfe monthly report · Weekly report
 *   - Account           → Settings · Sign out
 *
 * Each row is gated by role permissions — Field Staff see only the
 * rows they may open; Admin/Dispatch see everything. Empty sections
 * are hidden entirely so the layout never shows a lonely header.
 * Counters (unread alerts, overdue invoices, open mandatory training)
 * come from the same queries the target screens use.
 */

import { type ReactNode } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useIsFocused, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import {
  Avatar,
  Badge,
  Card,
  CountPill,
  Divider,
  GroupLabel,
  Icon,
  IconChip,
  LargeHeader,
  ListRow,
  Screen,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { loadMyOrganizationName } from "@/lib/account";
import { loadOrgKpis } from "@/lib/dashboard";
import { loadMyNotifications } from "@/lib/notifications";
import { loadMyTraining } from "@/lib/training";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

type Item = {
  key: string;
  labelKey: string;
  hintKey: string;
  href?: string;
  icon: IconName;
  tone: Tone;
  visible: boolean;
  onPress?: () => void;
  danger?: boolean;
  trailing?: ReactNode;
};
type Section = { titleKey: string; items: Item[] };

function roleLabelKey(role?: string | null): string | null {
  return role === "admin" || role === "dispatcher" || role === "employee"
    ? `mobile.ui.more.role.${role}`
    : null;
}

export default function MoreScreen() {
  const router = useRouter();
  // Re-render when the tab regains focus so a language switched in
  // Settings is reflected here immediately.
  useIsFocused();
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? null;
  const canManage = can(role, "time.read_all");
  const canReadClients = can(role, "client.read") && role !== "employee";
  const employeeId = profile?.employeeId ?? null;

  // Counters — same query keys as the destination screens, so the
  // caches are shared and opening those screens is instant.
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: loadMyNotifications,
    enabled: !!profile,
  });
  const unreadAlerts = (notifications ?? []).filter((n) => !n.read_at).length;

  const { data: kpis } = useQuery({
    queryKey: ["org-kpis"],
    queryFn: loadOrgKpis,
    enabled: canManage,
  });
  const overdueInvoices = kpis?.overdueCount ?? 0;

  const { data: training } = useQuery({
    queryKey: ["training", employeeId],
    queryFn: () => loadMyTraining(employeeId!),
    enabled: !!employeeId,
    staleTime: 30_000,
  });
  const openTraining = (training ?? []).filter((m) => m.is_mandatory && !m.completed_at).length;

  const { data: orgName } = useQuery({
    queryKey: ["my-org-name", profile?.orgId],
    queryFn: () => loadMyOrganizationName(profile!.orgId!),
    enabled: !!profile?.orgId,
    staleTime: 60 * 60 * 1000,
  });

  const sections: Section[] = [
    {
      titleKey: "mobile.more.sectionWorkspace",
      items: [
        {
          key: "clients",
          labelKey: "mobile.more.clients",
          hintKey: "mobile.more.clientsHint",
          href: "/clients",
          icon: "users",
          tone: "brand",
          visible: canReadClients,
        },
        {
          key: "properties",
          labelKey: "mobile.more.properties",
          hintKey: "mobile.more.propertiesHint",
          href: "/properties",
          icon: "building",
          tone: "info",
          visible: canManage,
        },
        {
          key: "employees",
          labelKey: "mobile.more.employees",
          hintKey: "mobile.more.employeesHint",
          href: "/employees",
          icon: "user",
          tone: "sage",
          visible: canManage,
        },
        {
          key: "dashboard",
          labelKey: "mobile.more.dashboard",
          hintKey: "mobile.more.dashboardHint",
          href: "/dashboard",
          icon: "chart",
          tone: "brand",
          visible: canManage,
        },
        {
          key: "notifications",
          labelKey: "mobile.more.notifications",
          hintKey: "mobile.more.notificationsHint",
          href: "/notifications",
          icon: "bell",
          tone: "error",
          visible: true,
          trailing: unreadAlerts > 0 ? <CountPill count={unreadAlerts > 99 ? "99+" : unreadAlerts} /> : null,
        },
      ],
    },
    {
      titleKey: "mobile.more.sectionField",
      items: [
        {
          key: "vacation",
          labelKey: "mobile.more.vacation",
          hintKey: "mobile.more.vacationHint",
          href: "/vacation",
          icon: "sun",
          tone: "warning",
          visible: true,
        },
        {
          key: "damage",
          labelKey: "mobile.more.damage",
          hintKey: "mobile.more.damageHint",
          href: "/damage",
          icon: "camera",
          tone: "error",
          visible: true,
        },
        {
          key: "supplies",
          labelKey: "mobile.more.supplies",
          hintKey: "mobile.more.suppliesHint",
          href: "/supplies/new",
          icon: "droplet",
          tone: "info",
          visible: true,
        },
        {
          key: "training",
          labelKey: "mobile.more.training",
          hintKey: "mobile.more.trainingHint",
          href: "/training",
          icon: "graduation",
          tone: "warning",
          visible: true,
          trailing:
            openTraining > 0 ? (
              <Badge label={t("mobile.ui.more.trainingOpen", { n: openTraining })} tone="warning" dot={false} />
            ) : null,
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
          icon: "receipt",
          tone: "info",
          visible: canManage,
          trailing: overdueInvoices > 0 ? <CountPill count={overdueInvoices} /> : null,
        },
        {
          key: "reports",
          labelKey: "mobile.more.reports",
          hintKey: "mobile.more.reportsHint",
          href: "/reports/alltagshilfe",
          icon: "file-text",
          tone: "error",
          visible: canManage,
        },
        {
          key: "workReport",
          labelKey: "mobile.more.workReport",
          hintKey: "mobile.more.workReportHint",
          href: "/reports/work-report",
          icon: "file-text",
          tone: "brand",
          visible: true,
        },
      ],
    },
    {
      titleKey: "mobile.more.sectionAccount",
      items: [
        {
          key: "settings",
          labelKey: "mobile.more.settings",
          hintKey: "mobile.more.settingsHint",
          href: "/settings",
          icon: "settings",
          tone: "neutral",
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
          icon: "logout",
          tone: "error",
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

  const roleKey = roleLabelKey(role);
  const profileSub = [roleKey ? t(roleKey) : null, orgName].filter(Boolean).join(" · ");
  const version = Constants.expoConfig?.version;

  return (
    <Screen header={<LargeHeader title={t("mobile.more.title")} subtitle={t("mobile.more.subtitle")} />}>
      {/* Profile card → Settings */}
      <Card onPress={() => router.push("/settings" as never)} style={styles.profile}>
        <Avatar name={profile?.fullName} size={44} />
        <View style={styles.profileText}>
          <Txt v="headline" numberOfLines={1}>
            {profile?.fullName ?? "—"}
          </Txt>
          {profileSub ? (
            <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
              {profileSub}
            </Txt>
          ) : null}
        </View>
        <View style={styles.langChip} accessibilityLabel={t("settings.account.language")}>
          <Icon name="globe" size={14} color={colors.neutral[600]} />
          <Txt v="caption" color={colors.neutral[700]}>
            {i18n.locale.toUpperCase()}
          </Txt>
        </View>
      </Card>

      {activeSections.map((section) => (
        <View key={section.titleKey} style={styles.section}>
          <GroupLabel>{t(section.titleKey)}</GroupLabel>
          <Card padded={false} style={styles.card}>
            {section.items.map((item, idx) => (
              <View key={item.key}>
                {idx > 0 ? <Divider /> : null}
                <ListRow
                  title={t(item.labelKey)}
                  subtitle={t(item.hintKey)}
                  leading={<IconChip icon={item.icon} tone={item.tone} size={36} iconSize={18} />}
                  trailing={item.trailing}
                  titleColor={item.danger ? colors.error[700] : undefined}
                  chevron={!item.danger}
                  onPress={() => handleRow(item)}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}

      {version ? (
        <Txt v="caption" color={colors.neutral[400]} style={styles.version}>
          {t("mobile.ui.more.version", { version })}
        </Txt>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingVertical: 14 },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  section: { gap: spacing[2] },
  card: { overflow: "hidden" },
  version: { textAlign: "center", marginTop: spacing[1] },
});
