/**
 * Property detail — read-only view of one workplace.
 * Address, weekly frequency, access notes (key holder, alarm code).
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
import { loadMobilePropertyDetail } from "@/lib/properties";
import { EmptyState } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["propertyDetail", id],
    queryFn: () => loadMobilePropertyDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const d = query.data;
  if (query.isLoading) {
    return (
      <Wrap onBack={() => router.back()} title="—">
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      </Wrap>
    );
  }
  if (!d) {
    return (
      <Wrap onBack={() => router.back()} title="—">
        <EmptyState
          title={t("mobile.properties.notFoundTitle")}
          subtitle={t("mobile.properties.notFoundBody")}
        />
      </Wrap>
    );
  }
  const fullAddress = [
    d.address_line1,
    [d.postal_code, d.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Wrap onBack={() => router.back()} title={d.name}>
      <ScrollView contentContainerStyle={{ padding: spacing[4], gap: 12 }}>
        <Card title={t("mobile.properties.detail.locationSection")}>
          <Pressable
            onPress={() => {
              if (!fullAddress) return;
              // Universal geo: link — iOS opens Maps, Android opens the
              // default maps app. Falling back to Google Maps web on
              // platforms without a geo: handler.
              Linking.openURL(
                `geo:0,0?q=${encodeURIComponent(fullAddress)}`,
              ).catch(() =>
                Linking.openURL(
                  `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`,
                ),
              );
            }}
          >
            <Text style={styles.rowLabel}>
              {t("mobile.properties.detail.address")}
            </Text>
            <Text
              style={[
                styles.rowValue,
                fullAddress && {
                  color: colors.secondary[500],
                  fontWeight: "600",
                },
              ]}
            >
              {fullAddress || "—"}
            </Text>
          </Pressable>
          <Divider />
          <Text style={styles.rowLabel}>
            {t("mobile.properties.detail.client")}
          </Text>
          <Text style={styles.rowValue}>{d.client_name}</Text>
          <Divider />
          <Text style={styles.rowLabel}>
            {t("mobile.properties.detail.kind")}
          </Text>
          <Text style={styles.rowValue}>{d.kind ?? "—"}</Text>
          <Divider />
          <Text style={styles.rowLabel}>
            {t("mobile.properties.detail.weeklyFrequency")}
          </Text>
          <Text style={styles.rowValue}>
            {d.weekly_frequency != null
              ? t("mobile.properties.detail.freqEveryWeeks", {
                  n:
                    d.weekly_frequency > 0
                      ? Math.round(1 / d.weekly_frequency)
                      : 0,
                })
              : "—"}
          </Text>
        </Card>

        {(d.key_holder || d.alarm_notes) && (
          <Card title={t("mobile.properties.detail.accessSection")}>
            <Text style={styles.rowLabel}>
              {t("mobile.properties.detail.keyHolder")}
            </Text>
            <Text style={styles.rowValue}>{d.key_holder ?? "—"}</Text>
            <Divider />
            <Text style={styles.rowLabel}>
              {t("mobile.properties.detail.alarmNotes")}
            </Text>
            <Text style={styles.rowValue}>{d.alarm_notes ?? "—"}</Text>
          </Card>
        )}

        {d.notes && (
          <Card title={t("mobile.properties.detail.notesSection")}>
            <Text style={styles.rowValue}>{d.notes}</Text>
          </Card>
        )}
      </ScrollView>
    </Wrap>
  );
}

function Wrap({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
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
      {children}
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={{ gap: 4 }}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
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
    gap: 4,
  },
  cardTitle: {
    marginBottom: 6,
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.secondary[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rowValue: {
    marginTop: 2,
    fontSize: typography.size.md,
    color: colors.neutral[800],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.neutral[100],
    marginVertical: 4,
  },
});
