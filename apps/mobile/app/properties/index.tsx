/**
 * Properties list — admin + dispatcher. Search across name/address/city.
 * Tap a row to see property detail (access notes, weekly frequency).
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
import { loadMobileProperties } from "@/lib/properties";
import { EmptyState, Input } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function PropertiesScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["properties", { q: q.trim() }],
    queryFn: () => loadMobileProperties({ q }),
    staleTime: 60_000,
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBack}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.neutral[700]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 12H5M12 19l-7-7 7-7" />
          </Svg>
        </Pressable>
        <Text style={styles.headerTitle}>{t("mobile.properties.title")}</Text>
      </View>
      <View style={styles.searchWrap}>
        <Input
          value={q}
          onChangeText={setQ}
          placeholder={t("mobile.properties.searchPlaceholder")}
          autoCapitalize="none"
        />
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/properties/[id]",
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.neutral[50] },
              ]}
            >
              <View style={styles.iconBox}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.secondary[500]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M3 21V7l8-4 8 4v14" />
                </Svg>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {[
                    item.address_line1,
                    [item.postal_code, item.city].filter(Boolean).join(" "),
                    item.client_name,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </Text>
              </View>
            </Pressable>
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
              title={t("mobile.properties.emptyTitle")}
              subtitle={t("mobile.properties.emptyBody")}
            />
          }
        />
      )}
    </SafeAreaView>
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
  searchWrap: { paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.white,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondary[50],
  },
  rowName: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  rowSub: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  sep: { height: 1, backgroundColor: colors.neutral[100] },
});
