/**
 * Employee detail — read-only.
 * Contact info, role, service line, skills, weekly-hours target.
 */

import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import { loadMobileEmployeeDetail } from "@/lib/employees";
import { Chip, EmptyState } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function EmployeeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["employeeDetail", id],
    queryFn: () => loadMobileEmployeeDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
        edges={["top"]}
      >
        <Header title="—" onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }
  const d = query.data;
  if (!d) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
        edges={["top"]}
      >
        <Header title="—" onBack={() => router.back()} />
        <EmptyState
          title={t("mobile.employees.notFoundTitle")}
          subtitle={t("mobile.employees.notFoundBody")}
        />
      </SafeAreaView>
    );
  }
  const isCare = d.service_line === "alltagshilfe";
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <Header title={d.full_name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing[4], gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Chip
            label={t(`mobile.employees.status.${d.status}` as never)}
            tone={
              d.status === "active"
                ? "primary"
                : d.status === "on_leave"
                  ? "warning"
                  : "neutral"
            }
          />
          {d.service_line && (
            <Chip
              label={
                isCare
                  ? t("mobile.employees.service.alltagshilfe")
                  : t("mobile.employees.service.priya")
              }
              tone={isCare ? "error" : "primary"}
            />
          )}
          {d.role && (
            <Chip
              label={t(`mobile.employees.role.${d.role}` as never)}
              tone="secondary"
            />
          )}
        </View>

        <Card title={t("mobile.employees.detail.contactSection")}>
          <Row
            label={t("mobile.employees.detail.email")}
            value={d.email ?? "—"}
            onPress={
              d.email ? () => Linking.openURL(`mailto:${d.email}`) : undefined
            }
          />
          <Row
            label={t("mobile.employees.detail.phone")}
            value={d.phone ?? "—"}
            onPress={
              d.phone
                ? () =>
                    Linking.openURL(
                      `tel:${(d.phone ?? "").replace(/[^\d+]/g, "")}`,
                    )
                : undefined
            }
          />
        </Card>

        <Card title={t("mobile.employees.detail.employmentSection")}>
          <Row
            label={t("mobile.employees.detail.employmentType")}
            value={d.employment_type ?? "—"}
          />
          <Row
            label={t("mobile.employees.detail.weeklyHoursTarget")}
            value={
              d.weekly_hours_target != null
                ? `${d.weekly_hours_target} h`
                : "—"
            }
          />
          <Row
            label={t("mobile.employees.detail.contractStart")}
            value={d.contract_start ?? "—"}
          />
        </Card>

        {d.skills.length > 0 && (
          <Card title={t("mobile.employees.detail.skillsSection")}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {d.skills.map((s) => (
                <Chip key={s} label={s} tone="neutral" />
              ))}
            </View>
          </Card>
        )}

        {d.notes && (
          <Card title={t("mobile.employees.detail.notesSection")}>
            <Text style={styles.value}>{d.notes}</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.headerBack}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.neutral[700]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M19 12H5M12 19l-7-7 7-7" />
        </Svg>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const isLink = !!onPress && value !== "—";
  return (
    <Pressable
      onPress={isLink ? onPress : undefined}
      disabled={!isLink}
      style={styles.rowInCard}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.value,
          isLink && { color: colors.secondary[500], fontWeight: "600" },
        ]}
      >
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  headerBack: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.size.lg,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.neutral[100],
    gap: 10,
  },
  cardTitle: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.secondary[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowInCard: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral[100],
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    marginTop: 2,
    fontSize: typography.size.md,
    color: colors.neutral[800],
  },
});
