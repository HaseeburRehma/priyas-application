/**
 * Damage reports — my history + big "new report" CTA.
 */

import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { format, parseISO } from "date-fns";
import { Button, Card, CenterSpinner, Chip, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadMyDamageReports,
  type DamageCategory,
  type DamageReportRow,
} from "@/lib/damage";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function DamageList() {
  const router = useRouter();
  const { profile } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery<DamageReportRow[]>({
    queryKey: ["my-damage", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyDamageReports(profile.employeeId)
        : Promise.resolve([]),
    enabled: !!profile?.employeeId,
  });

  const rows = data ?? [];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← {t("schedule.back")}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>{t("damage.title")}</Text>
          <Text style={styles.sub}>{t("damage.subtitle")}</Text>
        </View>

        <Button
          label={t("damage.newReport")}
          onPress={() => router.push("/damage/new")}
        />

        {isLoading && <CenterSpinner />}
        {!isLoading && rows.length === 0 && (
          <EmptyState
            title={t("damage.emptyTitle")}
            subtitle={t("damage.emptyBody")}
          />
        )}

        {rows.map((r) => (
          <Card key={r.id} style={styles.card}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.property}>{r.property_name}</Text>
                <Text style={styles.client}>{r.client_name}</Text>
              </View>
              <Chip
                label={t(`damage.category.${r.category}` as never)}
                tone={categoryTone(r.category)}
              />
            </View>

            <View style={styles.metaRow}>
              <SeverityBar level={r.severity} />
              <Text style={styles.time}>
                {format(parseISO(r.created_at), "d LLL · HH:mm")}
              </Text>
            </View>

            <Text style={styles.description}>{r.description}</Text>

            {r.photo_paths.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoRow}
              >
                {r.photo_paths.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            )}

            {r.resolved && (
              <View style={styles.resolved}>
                <Text style={styles.resolvedText}>
                  ✓ {t("damage.resolvedLabel")}{" "}
                  {r.resolved_at
                    ? format(parseISO(r.resolved_at), "d LLL yyyy")
                    : ""}
                </Text>
              </View>
            )}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function categoryTone(
  c: DamageCategory,
): "primary" | "secondary" | "warning" | "success" | "error" | "neutral" {
  if (c === "damage") return "error";
  if (c === "problem") return "warning";
  if (c === "note") return "secondary";
  return "success";
}

function SeverityBar({ level }: { level: number }) {
  return (
    <View style={styles.sevRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={[
            styles.sevPip,
            {
              backgroundColor:
                n <= level ? severityColor(level) : colors.neutral[200],
            },
          ]}
        />
      ))}
    </View>
  );
}

function severityColor(level: number): string {
  if (level >= 5) return colors.error[500];
  if (level >= 4) return colors.warning[500];
  if (level >= 3) return colors.warning[300];
  return colors.primary[500];
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[3],
  },
  back: { marginBottom: spacing[1] },
  backText: {
    fontSize: typography.size.md,
    color: colors.primary[600],
    fontWeight: "600",
  },
  header: { gap: spacing[1] },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.md,
    color: colors.neutral[500],
  },
  card: { gap: spacing[2] },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
  },
  property: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  client: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing[1],
  },
  sevRow: {
    flexDirection: "row",
    gap: 4,
  },
  sevPip: {
    width: 12,
    height: 6,
    borderRadius: 3,
  },
  time: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    fontFamily: "Menlo",
  },
  description: {
    fontSize: typography.size.md,
    color: colors.neutral[700],
    lineHeight: 20,
    marginTop: spacing[1],
  },
  photoRow: {
    marginTop: spacing[2],
  },
  photo: {
    width: 90,
    height: 90,
    borderRadius: 8,
    marginRight: spacing[2],
    backgroundColor: colors.neutral[100],
  },
  resolved: {
    marginTop: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: 8,
    backgroundColor: colors.success[50],
  },
  resolvedText: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.success[700],
  },
});
