/**
 * Client detail screen — read-only view of one customer.
 *
 * Shows master data (name, address, insurance for Alltagshilfe) and
 * the property list so admin/dispatcher can look up an address in the
 * field without opening the web app. Editing lives on the web wizard.
 */

import { useCallback } from "react";
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
import { loadMobileClientDetail, type ClientPayerType } from "@/lib/clients";
import { Chip, EmptyState } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const detailQuery = useQuery({
    queryKey: ["clientDetail", id],
    queryFn: () => loadMobileClientDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const call = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
  }, []);
  const email = useCallback((addr: string) => {
    Linking.openURL(`mailto:${addr}`);
  }, []);

  if (detailQuery.isLoading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
        edges={["top"]}
      >
        <Header onBack={() => router.back()} title="—" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  const d = detailQuery.data;
  if (!d) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
        edges={["top"]}
      >
        <Header onBack={() => router.back()} title="—" />
        <EmptyState
          title={t("mobile.clients.notFoundTitle")}
          subtitle={t("mobile.clients.notFoundBody")}
        />
      </SafeAreaView>
    );
  }

  const isAlltags = d.customer_type === "alltagshilfe";
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <Header onBack={() => router.back()} title={d.display_name} />
      <ScrollView contentContainerStyle={{ padding: spacing[4], gap: spacing[3] }}>
        {/* Chips row */}
        <View style={styles.chipsRow}>
          <Chip
            label={
              isAlltags
                ? t("mobile.clients.tagAlltagshilfe")
                : t("mobile.clients.tagPriya")
            }
            tone={isAlltags ? "error" : "primary"}
          />
          <PayerBadge payer={d.payer_type} />
        </View>

        {/* Contact card */}
        <SectionCard title={t("mobile.clients.detail.contactSection")}>
          <Row
            label={t("mobile.clients.detail.address")}
            value={
              [
                d.address_line1,
                [d.postal_code, d.city].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          <Row
            label={t("mobile.clients.detail.email")}
            value={d.email ?? "—"}
            onPress={d.email ? () => email(d.email!) : undefined}
          />
          <Row
            label={t("mobile.clients.detail.phone")}
            value={d.phone ?? "—"}
            onPress={d.phone ? () => call(d.phone!) : undefined}
          />
        </SectionCard>

        {isAlltags && (
          <SectionCard title={t("mobile.clients.detail.careSection")}>
            <Row
              label={t("mobile.clients.detail.insuranceProvider")}
              value={d.insurance_provider ?? "—"}
            />
            <Row
              label={t("mobile.clients.detail.insuranceNumber")}
              value={d.insurance_number ?? "—"}
            />
            <Row
              label={t("mobile.clients.detail.careLevel")}
              value={d.care_level != null ? String(d.care_level) : "—"}
            />
          </SectionCard>
        )}

        {/* Properties card */}
        <SectionCard
          title={t("mobile.clients.detail.propertiesSection", {
            n: d.properties.length,
          })}
        >
          {d.properties.length === 0 ? (
            <Text style={styles.rowValue}>
              {t("mobile.clients.detail.propertiesEmpty")}
            </Text>
          ) : (
            d.properties.map((p) => (
              <View key={p.id} style={styles.propRow}>
                <Text style={styles.propName}>{p.name}</Text>
                {p.city && (
                  <Text style={styles.propCity}>{p.city}</Text>
                )}
              </View>
            ))
          )}
        </SectionCard>

        {d.notes && (
          <SectionCard title={t("mobile.clients.detail.notesSection")}>
            <Text style={styles.rowValue}>{d.notes}</Text>
          </SectionCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.headerBack}>
        <Svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.neutral[700]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M19 12H5M12 19l-7-7 7-7" />
        </Svg>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function SectionCard({
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
      style={styles.row}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          isLink && { color: colors.secondary[500], fontWeight: "600" },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </Pressable>
  );
}

function PayerBadge({ payer }: { payer: ClientPayerType | null }) {
  if (!payer) return null;
  const map: Record<
    ClientPayerType,
    { tone: "primary" | "secondary" | "warning" | "neutral"; key: string }
  > = {
    care_fund: { tone: "primary", key: "mobile.clients.payer.care_fund" },
    insurance: { tone: "secondary", key: "mobile.clients.payer.insurance" },
    private_pay: { tone: "warning", key: "mobile.clients.payer.private_pay" },
    commercial: { tone: "neutral", key: "mobile.clients.payer.commercial" },
  };
  const cfg = map[payer];
  return <Chip label={t(cfg.key as never)} tone={cfg.tone} />;
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
  chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
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
  row: {
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
  rowValue: {
    marginTop: 2,
    fontSize: typography.size.md,
    color: colors.neutral[800],
  },
  propRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral[100],
  },
  propName: {
    fontSize: typography.size.md,
    fontWeight: "600",
    color: colors.neutral[800],
  },
  propCity: {
    marginTop: 1,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
