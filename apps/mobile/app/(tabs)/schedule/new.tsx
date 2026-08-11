/**
 * Plan shift — admin + dispatcher.
 *
 * Mirrors the web Plan-shift dialog: pick property, pick employee (or
 * leave open), set date + start + end, optional notes. The Property
 * picker filters via full-text search; the Employee picker is a scrollable
 * list of active team members. On save, inserts a `scheduled` row into
 * `shifts` (RLS enforces the admin/dispatcher check).
 */

import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import {
  loadEligibleEmployees,
  loadEligibleProperties,
  planShift,
  type EligibleEmployee,
  type EligibleProperty,
} from "@/lib/schedule";
import { Input } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function PlanShiftScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const employeesQuery = useQuery({
    queryKey: ["eligibleEmployees"],
    queryFn: loadEligibleEmployees,
    staleTime: 60_000,
  });
  const propertiesQuery = useQuery({
    queryKey: ["eligibleProperties"],
    queryFn: loadEligibleProperties,
    staleTime: 60_000,
  });

  const [propId, setPropId] = useState<string | null>(null);
  const [empId, setEmpId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [startStr, setStartStr] = useState<string>("09:00");
  const [endStr, setEndStr] = useState<string>("11:00");
  const [notes, setNotes] = useState<string>("");
  const [propSearch, setPropSearch] = useState("");

  const selectedProp = useMemo(
    () => propertiesQuery.data?.find((p) => p.id === propId) ?? null,
    [propertiesQuery.data, propId],
  );
  const selectedEmp = useMemo(
    () => employeesQuery.data?.find((e) => e.id === empId) ?? null,
    [employeesQuery.data, empId],
  );

  // If the selected client is Alltagshilfe, only surface care-qualified
  // staff in the employee picker — mirrors the web guard.
  const eligibleEmployees = useMemo(() => {
    const all = employeesQuery.data ?? [];
    if (!selectedProp) return all;
    if (selectedProp.client_customer_type !== "alltagshilfe") return all;
    return all.filter(
      (e) => e.service_line === "alltagshilfe" || e.service_line == null,
    );
  }, [employeesQuery.data, selectedProp]);

  const filteredProps = useMemo(() => {
    const all = propertiesQuery.data ?? [];
    if (!propSearch.trim()) return all.slice(0, 60);
    const q = propSearch.trim().toLowerCase();
    return all
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.client_name.toLowerCase().includes(q) ||
          (p.city ?? "").toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [propertiesQuery.data, propSearch]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!propId) throw new Error("no_property");
      const scheduled_start = combine(dateStr, startStr);
      const scheduled_end = combine(dateStr, endStr);
      const r = await planShift({
        property_id: propId,
        employee_id: empId,
        scheduled_start,
        scheduled_end,
        notes: notes.trim() || null,
      });
      if (!r.ok) throw new Error(r.error);
      return r.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-shifts"] });
      Alert.alert(
        t("mobile.planShift.savedTitle"),
        t("mobile.planShift.savedBody"),
      );
      router.back();
    },
    onError: (err: Error) => {
      Alert.alert(
        t("mobile.planShift.saveFailedTitle"),
        translateError(err.message),
      );
    },
  });

  const canSave = !!propId && !!dateStr && !!startStr && !!endStr;

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
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("mobile.planShift.title")}</Text>
          <Text style={styles.sub}>{t("mobile.planShift.subtitle")}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing[4], gap: 12 }}>
          {/* Property picker */}
          <Card title={t("mobile.planShift.propertySection")}>
            {selectedProp ? (
              <Pressable
                onPress={() => setPropId(null)}
                style={styles.chosenRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.chosenName}>{selectedProp.name}</Text>
                  <Text style={styles.chosenSub}>
                    {[selectedProp.client_name, selectedProp.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Text style={styles.linkText}>
                  {t("mobile.planShift.change")}
                </Text>
              </Pressable>
            ) : (
              <>
                <Input
                  value={propSearch}
                  onChangeText={setPropSearch}
                  placeholder={t("mobile.planShift.propertySearchPlaceholder")}
                  autoCapitalize="none"
                />
                <View style={styles.pickerList}>
                  {filteredProps.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setPropId(p.id);
                        // Clear the employee choice if it's no longer
                        // eligible for the newly-picked property.
                        if (empId) {
                          const stillOk = (
                            employeesQuery.data ?? []
                          ).some(
                            (e) =>
                              e.id === empId &&
                              (p.client_customer_type !== "alltagshilfe" ||
                                e.service_line === "alltagshilfe" ||
                                e.service_line == null),
                          );
                          if (!stillOk) setEmpId(null);
                        }
                      }}
                      style={styles.pickRow}
                    >
                      <Text style={styles.pickName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.pickSub} numberOfLines={1}>
                        {[p.client_name, p.city].filter(Boolean).join(" · ")}
                      </Text>
                    </Pressable>
                  ))}
                  {filteredProps.length === 0 && (
                    <Text style={styles.emptyText}>
                      {t("mobile.planShift.propertyEmpty")}
                    </Text>
                  )}
                </View>
              </>
            )}
          </Card>

          {/* Employee picker */}
          <Card title={t("mobile.planShift.employeeSection")}>
            {selectedEmp ? (
              <Pressable
                onPress={() => setEmpId(null)}
                style={styles.chosenRow}
              >
                <Text style={styles.chosenName}>{selectedEmp.full_name}</Text>
                <Text style={styles.linkText}>
                  {t("mobile.planShift.change")}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.pickerList}>
                <Pressable
                  onPress={() => setEmpId(null)}
                  style={[styles.pickRow, styles.openShiftRow]}
                >
                  <Text style={styles.pickName}>
                    {t("mobile.planShift.openShift")}
                  </Text>
                </Pressable>
                {eligibleEmployees.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => setEmpId(e.id)}
                    style={styles.pickRow}
                  >
                    <Text style={styles.pickName}>{e.full_name}</Text>
                    <Text style={styles.pickSub}>
                      {e.service_line === "alltagshilfe"
                        ? t("mobile.employees.service.alltagshilfe")
                        : e.service_line === "priya"
                          ? t("mobile.employees.service.priya")
                          : "—"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          {/* Time */}
          <Card title={t("mobile.planShift.timeSection")}>
            <View style={styles.grid3}>
              <View style={styles.gridCell}>
                <Text style={styles.label}>{t("mobile.planShift.date")}</Text>
                <Input
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.label}>{t("mobile.planShift.start")}</Text>
                <Input
                  value={startStr}
                  onChangeText={setStartStr}
                  placeholder="HH:MM"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.gridCell}>
                <Text style={styles.label}>{t("mobile.planShift.end")}</Text>
                <Input
                  value={endStr}
                  onChangeText={setEndStr}
                  placeholder="HH:MM"
                  autoCapitalize="none"
                />
              </View>
            </View>
          </Card>

          {/* Notes */}
          <Card title={t("mobile.planShift.notesSection")}>
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder={t("mobile.planShift.notesPlaceholder")}
              multiline
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
          </Card>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => router.back()}
            style={styles.cancelBtn}
          >
            <Text style={styles.cancelBtnText}>
              {t("mobile.planShift.cancel")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            style={[
              styles.saveBtn,
              (!canSave || saveMutation.isPending) && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.saveBtnText}>
              {saveMutation.isPending
                ? t("mobile.planShift.saving")
                : t("mobile.planShift.saveCta")}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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

function combine(dateStr: string, timeStr: string): string {
  // Build "YYYY-MM-DDTHH:MM:00" and let the platform interpret it in the
  // device's local timezone (Supabase timestamptz stores it as UTC).
  const iso = `${dateStr}T${timeStr}:00`;
  const d = new Date(iso);
  return d.toISOString();
}

function translateError(code: string): string {
  const map: Record<string, string> = {
    end_must_be_after_start: t(
      "mobile.planShift.errorEndAfterStart",
    ),
    not_signed_in: t("mobile.planShift.errorNotSignedIn"),
    no_org: t("mobile.planShift.errorNoOrg"),
    no_property: t("mobile.planShift.errorNoProperty"),
  };
  return map[code] ?? code;
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
  title: {
    fontSize: typography.size.lg,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  sub: { fontSize: typography.size.sm, color: colors.neutral[500] },
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
  pickerList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.neutral[100],
    maxHeight: 260,
  },
  pickRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral[100],
  },
  openShiftRow: { backgroundColor: colors.neutral[50] },
  pickName: {
    fontSize: typography.size.md,
    fontWeight: "600",
    color: colors.neutral[800],
  },
  pickSub: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  chosenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chosenName: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  chosenSub: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  linkText: {
    color: colors.secondary[500],
    fontWeight: "700",
    fontSize: typography.size.sm,
  },
  emptyText: {
    padding: 12,
    color: colors.neutral[500],
    fontSize: typography.size.sm,
  },
  grid3: { flexDirection: "row", gap: 8 },
  gridCell: { flex: 1 },
  label: {
    marginBottom: 4,
    fontSize: 11,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  footer: {
    flexDirection: "row",
    gap: 8,
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    backgroundColor: colors.white,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    alignItems: "center",
  },
  cancelBtnText: {
    color: colors.neutral[700],
    fontWeight: "700",
    fontSize: typography.size.md,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary[500],
    alignItems: "center",
  },
  saveBtnText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: typography.size.md,
  },
});
