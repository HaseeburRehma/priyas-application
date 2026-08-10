/**
 * Invoice detail — read-only. Header + line items + Lexware sync
 * timestamp so admin can see where a bill is stuck without opening
 * the web app.
 */

import {
  ActivityIndicator,
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
import { loadMobileInvoiceDetail } from "@/lib/invoices";
import { EmptyState } from "@/components/ui";
import { formatEUR, StatusChip } from "./index";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["invoiceDetail", id],
    queryFn: () => loadMobileInvoiceDetail(id!),
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
          title={t("mobile.invoices.notFoundTitle")}
          subtitle={t("mobile.invoices.notFoundBody")}
        />
      </Wrap>
    );
  }
  return (
    <Wrap onBack={() => router.back()} title={d.invoice_number ?? "—"}>
      <ScrollView contentContainerStyle={{ padding: spacing[4], gap: 12 }}>
        <View style={styles.headBlock}>
          <Text style={styles.client}>{d.client_name}</Text>
          <Text style={styles.total}>{formatEUR(d.total_cents)}</Text>
          <View style={{ marginTop: 6 }}>
            <StatusChip status={d.status} />
          </View>
        </View>

        <Card title={t("mobile.invoices.detail.metaSection")}>
          <Row label={t("mobile.invoices.detail.issueDate")} value={d.issue_date ?? "—"} />
          <Row label={t("mobile.invoices.detail.dueDate")} value={d.due_date ?? "—"} />
          <Row
            label={t("mobile.invoices.detail.period")}
            value={
              d.period_start && d.period_end
                ? `${d.period_start} → ${d.period_end}`
                : "—"
            }
          />
          <Row
            label={t("mobile.invoices.detail.paidAt")}
            value={d.paid_at ?? "—"}
          />
          <Row
            label={t("mobile.invoices.detail.lexwareSynced")}
            value={d.lexware_synced_at ?? t("mobile.invoices.detail.notSynced")}
          />
        </Card>

        <Card
          title={t("mobile.invoices.detail.itemsSection", {
            n: d.items.length,
          })}
        >
          {d.items.length === 0 ? (
            <Text style={styles.emptyItems}>
              {t("mobile.invoices.detail.itemsEmpty")}
            </Text>
          ) : (
            d.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.quantity} × {formatEUR(item.unit_price_cents)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>
                  {formatEUR(item.total_cents)}
                </Text>
              </View>
            ))
          )}
        </Card>
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
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowInCard}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
  headBlock: {
    backgroundColor: colors.white,
    padding: spacing[4],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  client: {
    fontSize: typography.size.lg,
    fontWeight: "800",
    color: colors.neutral[800],
  },
  total: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.neutral[100],
    gap: 8,
  },
  cardTitle: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.secondary[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowInCard: {
    paddingVertical: 4,
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
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral[100],
  },
  itemDesc: { fontSize: typography.size.md, color: colors.neutral[800] },
  itemMeta: { marginTop: 2, fontSize: 11, color: colors.neutral[500] },
  itemTotal: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  emptyItems: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
});
