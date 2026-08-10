/**
 * Employees list — admin + dispatcher only.
 * Search + service-line filter, drill-down to detail.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import {
  loadMobileEmployees,
  type EmployeeRow,
  type EmployeeStatus,
} from "@/lib/employees";
import { Chip, EmptyState, Input } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

type ServiceFilter = "all" | "priya" | "alltagshilfe";

export default function EmployeesScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [service, setService] = useState<ServiceFilter>("all");

  const query = useQuery({
    queryKey: ["employees", { q: q.trim(), service }],
    queryFn: () => loadMobileEmployees({ q, serviceLine: service }),
    staleTime: 60_000,
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <Header title={t("mobile.employees.title")} onBack={() => router.back()} />
      <View style={styles.searchWrap}>
        <Input
          value={q}
          onChangeText={setQ}
          placeholder={t("mobile.employees.searchPlaceholder")}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      <View style={styles.filterRow}>
        {(["all", "priya", "alltagshilfe"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setService(v)}
            style={[styles.pill, service === v && styles.pillActive]}
          >
            <Text style={[styles.pillText, service === v && styles.pillTextOn]}>
              {t(`mobile.employees.filter.${v}` as never)}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : query.error ? (
        <EmptyState
          title={t("mobile.employees.errorTitle")}
          subtitle={t("mobile.employees.errorBody")}
        />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Row
              row={item}
              onPress={() =>
                router.push({
                  pathname: "/employees/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: spacing[6] }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("mobile.employees.emptyTitle")}
              subtitle={t("mobile.employees.emptyBody")}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function Row({ row, onPress }: { row: EmployeeRow; onPress: () => void }) {
  const initials = computeInitials(row.full_name);
  const statusTone = statusToTone(row.status);
  const isCare = row.service_line === "alltagshilfe";
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.neutral[100] }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.neutral[50] },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: isCare
              ? colors.error[500]
              : colors.primary[500],
          },
        ]}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {row.full_name}
          </Text>
          <Chip
            label={t(`mobile.employees.status.${row.status}` as never)}
            tone={statusTone}
          />
        </View>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[
            row.role ? t(`mobile.employees.role.${row.role}` as never) : null,
            row.employment_type,
            row.email,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Text>
      </View>
    </Pressable>
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

function statusToTone(
  s: EmployeeStatus,
): "primary" | "warning" | "neutral" {
  if (s === "active") return "primary";
  if (s === "on_leave") return "warning";
  return "neutral";
}

function computeInitials(name: string): string {
  const parts = name.split(/\s+/).filter((p) => /^[\p{L}]/u.test(p));
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
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
  searchWrap: { paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  pillActive: {
    backgroundColor: colors.secondary[500],
    borderColor: colors.secondary[500],
  },
  pillText: {
    color: colors.neutral[700],
    fontSize: 12,
    fontWeight: "600",
  },
  pillTextOn: { color: colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.white,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
  rowName: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  rowSub: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontWeight: "800", fontSize: 12 },
  sep: { height: 1, backgroundColor: colors.neutral[100] },
});
