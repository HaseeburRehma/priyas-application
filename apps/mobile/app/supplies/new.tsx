/**
 * Feature-update #18 (mobile write side) · Report cleaning-supply
 * status after a visit.
 *
 * Field staff pick a property, flip a toggle (yes, supplies fine /
 * no, something is missing), add an optional note, and submit. The
 * insert lands in `public.supply_flags` — the PM sees it on the
 * client detail page (`SupplyFlagsCard`) and can resolve missing
 * items with one tap.
 *
 * All writes go through the offline outbox so a submission made at
 * an out-of-signal property still arrives when the phone reconnects.
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CenterSpinner, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { loadPropertiesForPicker } from "@/lib/damage";
import { createSupplyFlag } from "@/lib/supply-flags";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function NewSupplyFlag() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [suppliesOk, setSuppliesOk] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: properties, isLoading: propsLoading } = useQuery({
    queryKey: ["properties-picker"],
    queryFn: loadPropertiesForPicker,
  });

  const selectedProperty = useMemo(
    () => properties?.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  async function onSubmit() {
    if (!profile?.orgId || !profile.employeeId) {
      Alert.alert(t("vacation.notLinkedTitle"), t("vacation.notLinkedBody"));
      return;
    }
    if (!propertyId) {
      Alert.alert(t("supplies.pickPropertyFirst"));
      return;
    }
    if (suppliesOk === null) {
      Alert.alert(t("supplies.pickStatusFirst"));
      return;
    }
    // Missing-supply flags without a note leave the PM guessing what
    // to restock — require at least a short hint.
    if (!suppliesOk && !note.trim()) {
      Alert.alert(t("supplies.noteRequiredForMissing"));
      return;
    }
    setSubmitting(true);
    const r = await createSupplyFlag({
      orgId: profile.orgId,
      employeeId: profile.employeeId,
      propertyId,
      suppliesOk,
      note: note.trim() || null,
    });
    setSubmitting(false);
    if (!r.ok) {
      Alert.alert(t("supplies.submitFailed"), r.error);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["supply-flags"] });
    Alert.alert(t("supplies.thanksTitle"), t("supplies.thanksBody"));
    router.back();
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← {t("schedule.back")}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>{t("supplies.newTitle")}</Text>
            <Text style={styles.sub}>{t("supplies.newSubtitle")}</Text>
          </View>

          <Card style={styles.card}>
            <Text style={styles.label}>{t("supplies.propertyLabel")}</Text>
            {propsLoading && <CenterSpinner />}
            {!propsLoading && (properties ?? []).length === 0 && (
              <Text style={styles.emptyRow}>{t("supplies.noProperties")}</Text>
            )}
            {(properties ?? []).slice(0, 30).map((p) => {
              const active = p.id === propertyId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPropertyId(p.id)}
                  style={[
                    styles.propRow,
                    active && {
                      backgroundColor: colors.primary[50],
                      borderColor: colors.primary[500],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.propName,
                      active && { color: colors.primary[700] },
                    ]}
                  >
                    {p.name}
                  </Text>
                  <Text style={styles.propClient}>{p.client_name}</Text>
                </Pressable>
              );
            })}

            <Text style={[styles.label, { marginTop: spacing[3] }]}>
              {t("supplies.statusLabel")}
            </Text>
            <View style={styles.statusRow}>
              <Pressable
                onPress={() => setSuppliesOk(true)}
                style={[
                  styles.statusBtn,
                  suppliesOk === true && styles.statusOk,
                ]}
              >
                <Text
                  style={[
                    styles.statusBtnLabel,
                    suppliesOk === true && styles.statusBtnLabelActive,
                  ]}
                >
                  ✓ {t("supplies.statusOk")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSuppliesOk(false)}
                style={[
                  styles.statusBtn,
                  suppliesOk === false && styles.statusMissing,
                ]}
              >
                <Text
                  style={[
                    styles.statusBtnLabel,
                    suppliesOk === false && styles.statusBtnLabelActive,
                  ]}
                >
                  ✗ {t("supplies.statusMissing")}
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.label, { marginTop: spacing[3] }]}>
              {suppliesOk === false
                ? t("supplies.noteLabelRequired")
                : t("supplies.noteLabel")}
            </Text>
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={t("supplies.notePlaceholder")}
              multiline
              numberOfLines={4}
              style={styles.textarea}
              textAlignVertical="top"
            />

            <Button
              label={t("supplies.submit")}
              onPress={onSubmit}
              loading={submitting}
              disabled={
                !propertyId ||
                suppliesOk === null ||
                (suppliesOk === false && !note.trim()) ||
                !selectedProperty
              }
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
  label: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[700],
    marginBottom: 6,
  },
  emptyRow: {
    padding: spacing[4],
    textAlign: "center",
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  propRow: {
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginBottom: spacing[2],
  },
  propName: {
    fontSize: typography.size.md,
    fontWeight: "600",
    color: colors.neutral[800],
  },
  propClient: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  statusRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  statusBtn: {
    flex: 1,
    paddingVertical: spacing[3] + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.white,
    alignItems: "center",
  },
  statusOk: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[500],
  },
  statusMissing: {
    backgroundColor: colors.error[500],
    borderColor: colors.error[500],
  },
  statusBtnLabel: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[700],
  },
  statusBtnLabelActive: {
    color: colors.white,
  },
  textarea: {
    minHeight: 90,
    paddingTop: spacing[3],
  },
});
