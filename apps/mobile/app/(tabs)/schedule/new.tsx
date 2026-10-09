/**
 * Plan shift — admin + dispatcher.
 *
 * Mirrors the web Plan-shift dialog: pick property, pick employee (or
 * leave open), set date + start + end, optional notes. The Property
 * picker filters via full-text search; the Employee picker is a scrollable
 * list of active team members. On save, inserts a `scheduled` row into
 * `shifts` (RLS enforces the admin/dispatcher check).
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadEligibleEmployees,
  loadEligibleProperties,
  planShift,
  type EligibleEmployee,
} from "@/lib/schedule";
import {
  Avatar,
  Button,
  Card,
  CenterSpinner,
  Divider,
  FieldLabel,
  IconChip,
  InputField,
  ListRow,
  NavHeader,
  Screen,
  SearchField,
  Txt,
} from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";
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

  const saving = saveMutation.isPending;

  return (
    <Screen header={<NavHeader title={t("mobile.planShift.title")} />} scroll={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Txt v="subhead" color={colors.neutral[500]}>
            {t("mobile.planShift.subtitle")}
          </Txt>

          {/* Property picker */}
          <Field label={t("mobile.planShift.propertySection")} required>
            {selectedProp ? (
              <Chosen
                leading={<IconChip icon="building" tone="info" size={36} iconSize={18} />}
                title={selectedProp.name}
                subtitle={[selectedProp.client_name, selectedProp.city]
                  .filter(Boolean)
                  .join(" · ")}
                onChange={() => setPropId(null)}
              />
            ) : (
              <>
                <SearchField
                  value={propSearch}
                  onChangeText={setPropSearch}
                  placeholder={t("mobile.planShift.propertySearchPlaceholder")}
                  autoCapitalize="none"
                />
                <Card padded={false} style={styles.pickerCard}>
                  {propertiesQuery.isLoading ? (
                    <CenterSpinner />
                  ) : (
                    <ScrollView
                      style={styles.pickerList}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {filteredProps.map((p, i) => (
                        <View key={p.id}>
                          {i > 0 ? <Divider /> : null}
                          <ListRow
                            title={p.name}
                            subtitle={[p.client_name, p.city].filter(Boolean).join(" · ")}
                            chevron={false}
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
                          />
                        </View>
                      ))}
                      {filteredProps.length === 0 && (
                        <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyText}>
                          {t("mobile.planShift.propertyEmpty")}
                        </Txt>
                      )}
                    </ScrollView>
                  )}
                </Card>
              </>
            )}
          </Field>

          {/* Employee picker */}
          <Field label={t("mobile.planShift.employeeSection")}>
            {selectedEmp ? (
              <Chosen
                leading={<Avatar name={selectedEmp.full_name} size={36} />}
                title={selectedEmp.full_name}
                subtitle={serviceLabel(selectedEmp)}
                onChange={() => setEmpId(null)}
              />
            ) : (
              <Card padded={false} style={styles.pickerCard}>
                {employeesQuery.isLoading ? (
                  <CenterSpinner />
                ) : (
                  <ScrollView
                    style={styles.pickerList}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    <ListRow
                      title={t("mobile.planShift.openShift")}
                      leading={<IconChip icon="users" tone="neutral" size={36} iconSize={18} />}
                      chevron={false}
                      onPress={() => setEmpId(null)}
                    />
                    {eligibleEmployees.map((e) => (
                      <View key={e.id}>
                        <Divider />
                        <ListRow
                          title={e.full_name}
                          subtitle={serviceLabel(e)}
                          leading={<Avatar name={e.full_name} size={36} />}
                          chevron={false}
                          onPress={() => setEmpId(e.id)}
                        />
                      </View>
                    ))}
                  </ScrollView>
                )}
              </Card>
            )}
          </Field>

          {/* Time */}
          <InputField
            label={t("mobile.planShift.date")}
            required
            icon="calendar"
            value={dateStr}
            onChangeText={setDateStr}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
          <View style={styles.grid2}>
            <View style={styles.gridCell}>
              <InputField
                label={t("mobile.planShift.start")}
                required
                icon="clock"
                value={startStr}
                onChangeText={setStartStr}
                placeholder="HH:MM"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.gridCell}>
              <InputField
                label={t("mobile.planShift.end")}
                required
                icon="clock"
                value={endStr}
                onChangeText={setEndStr}
                placeholder="HH:MM"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Notes */}
          <InputField
            label={t("mobile.planShift.notesSection")}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("mobile.planShift.notesPlaceholder")}
            multiline
          />
        </ScrollView>

        {/* Sticky footer. The tab bar sits below this screen, so no extra
         *  home-indicator inset (unlike the kit's BottomBar). */}
        <View style={styles.footer}>
          <Button
            label={t("mobile.planShift.saveCta")}
            icon="check"
            onPress={() => saveMutation.mutate()}
            disabled={!canSave || saving}
            loading={saving}
            accessibilityLabel={saving ? t("mobile.planShift.saving") : undefined}
          />
          <Button
            label={t("mobile.planShift.cancel")}
            variant="ghost"
            size="md"
            onPress={() => router.back()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel label={label} required={required} />
      {children}
    </View>
  );
}

/** Selected property / employee, with an inline "Ändern" to re-pick. */
function Chosen({
  leading,
  title,
  subtitle,
  onChange,
}: {
  leading: ReactNode;
  title: string;
  subtitle?: string;
  onChange: () => void;
}) {
  return (
    <Pressable
      onPress={onChange}
      accessibilityRole="button"
      style={({ pressed }) => [styles.chosen, pressed && { opacity: 0.85 }]}
    >
      {leading}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Txt v="bodyStrong" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <Txt v="subheadStrong" color={colors.primary[600]}>
        {t("mobile.planShift.change")}
      </Txt>
    </Pressable>
  );
}

function serviceLabel(e: EligibleEmployee): string {
  return e.service_line === "alltagshilfe"
    ? t("mobile.employees.service.alltagshilfe")
    : e.service_line === "priya"
      ? t("mobile.employees.service.priya")
      : "—";
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
  content: { padding: spacing[4], gap: spacing[5] },
  pickerCard: { overflow: "hidden" },
  pickerList: { maxHeight: 260 },
  emptyText: { padding: spacing[4], textAlign: "center" },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.white,
  },
  grid2: { flexDirection: "row", gap: spacing[3] },
  gridCell: { flex: 1 },
  footer: {
    gap: spacing[1],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
});
