/**
 * Damage reports — my history + floating "new report" button.
 * Cards follow the notification-card look (Figma 17) with the category
 * colours / severity scale from the report form (Figma 21).
 */

import { useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { parseISO } from "date-fns";
import {
  Badge,
  Button,
  Card,
  CenterSpinner,
  ChipRow,
  EmptyState,
  FilterChip,
  Icon,
  IconChip,
  NavHeader,
  Screen,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadMyDamageReports,
  type DamageCategory,
  type DamageReportRow,
} from "@/lib/damage";
import { colors, radius, shadow, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

type Filter = "all" | "open" | "resolved";

export default function DamageList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading, refetch, isRefetching } = useQuery<DamageReportRow[]>({
    queryKey: ["my-damage", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyDamageReports(profile.employeeId)
        : Promise.resolve([]),
    enabled: !!profile?.employeeId,
  });

  const rows = data ?? [];
  const counts = useMemo(
    () => ({
      all: rows.length,
      open: rows.filter((r) => !r.resolved).length,
      resolved: rows.filter((r) => r.resolved).length,
    }),
    [rows],
  );
  const visible =
    filter === "all"
      ? rows
      : rows.filter((r) => (filter === "resolved" ? r.resolved : !r.resolved));

  const goNew = () => router.push("/damage/new");

  return (
    <Screen
      header={<NavHeader title={t("damage.title")} />}
      refreshing={isRefetching}
      onRefresh={() => refetch()}
      contentStyle={{ paddingBottom: 96 + insets.bottom }}
      footer={
        <View style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 12 }]} pointerEvents="box-none">
          <Button label={t("damage.newReport")} icon="plus" onPress={goNew} style={styles.fabBtn} />
        </View>
      }
    >
      <Txt v="subhead" color={colors.neutral[500]}>
        {t("damage.subtitle")}
      </Txt>

      {rows.length > 0 ? (
        <ChipRow>
          {(["all", "open", "resolved"] as const).map((f) => (
            <FilterChip
              key={f}
              label={t(`damage.filter.${f}`)}
              count={f === "all" ? undefined : counts[f]}
              selected={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ChipRow>
      ) : null}

      {isLoading && <CenterSpinner />}
      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon="camera"
          title={t("damage.emptyTitle")}
          subtitle={t("damage.emptyBody")}
        />
      )}
      {!isLoading && rows.length > 0 && visible.length === 0 && (
        <Txt v="subhead" color={colors.neutral[500]} style={{ textAlign: "center" }}>
          {t("damage.empty")}
        </Txt>
      )}

      {visible.map((r) => (
        <ReportCard key={r.id} row={r} />
      ))}
    </Screen>
  );
}

function ReportCard({ row: r }: { row: DamageReportRow }) {
  const cat = CATEGORY_STYLE[r.category] ?? CATEGORY_STYLE.note;
  const created = parseISO(r.created_at);
  const when = `${created.toLocaleDateString(i18n.locale, {
    day: "numeric",
    month: "short",
  })} · ${created.toLocaleTimeString(i18n.locale, { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Card style={styles.card}>
      <View style={styles.cardRow}>
        <IconChip icon={cat.icon} tone={cat.tone} size={40} iconSize={20} />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Txt v="bodyStrong" numberOfLines={1}>
            {t(`damage.category.${r.category}`)}
            {" · "}
            {r.property_name}
          </Txt>
          <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
            {r.client_name}
          </Txt>
          <Txt v="subhead" color={colors.neutral[700]} numberOfLines={3}>
            {r.description}
          </Txt>

          <View style={styles.badges}>
            <Badge
              label={`${r.severity} · ${t(`damage.severity.${r.severity}`)}`}
              tone={severityTone(r.severity)}
              dot={false}
            />
            {r.resolved ? (
              <Badge label={t("damage.resolvedTag")} tone="success" />
            ) : (
              <Badge label={t("damage.filter.open")} tone="warning" />
            )}
            {r.photo_paths.length > 0 ? (
              <View style={styles.photoCount}>
                <Icon name="camera" size={14} color={colors.neutral[500]} />
                <Txt v="caption" color={colors.neutral[500]}>
                  {t("mobile.ui.damage.photoCount", { n: r.photo_paths.length })}
                </Txt>
              </View>
            ) : null}
          </View>

          {r.photo_paths.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing[2] }}
              style={{ marginTop: 4 }}
            >
              {r.photo_paths.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.photo} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : null}

          <Txt v="caption" color={colors.neutral[400]}>
            {when}
            {r.resolved && r.resolved_at
              ? ` · ${t("damage.resolvedLabel")} ${parseISO(r.resolved_at).toLocaleDateString(
                  i18n.locale,
                  { day: "numeric", month: "short", year: "numeric" },
                )}`
              : ""}
          </Txt>
        </View>
      </View>
    </Card>
  );
}

const CATEGORY_STYLE: Record<DamageCategory, { icon: IconName; tone: Tone }> = {
  normal: { icon: "check", tone: "success" },
  note: { icon: "file-text", tone: "info" },
  problem: { icon: "alert", tone: "warning" },
  damage: { icon: "camera", tone: "error" },
};

function severityTone(level: number): Tone {
  if (level >= 4) return "error";
  if (level === 3) return "warning";
  if (level === 2) return "brand";
  return "success";
}

const styles = StyleSheet.create({
  card: { padding: 14 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },
  photoCount: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 2 },
  photo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
  },
  fab: { position: "absolute", right: spacing[4] },
  fabBtn: { borderRadius: radius.full, ...shadow.md },
});
