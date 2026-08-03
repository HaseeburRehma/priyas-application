/**
 * New vacation request form — pick a kind, start + end date, optional
 * reason. Days-count is computed live; server re-computes on insert so
 * a client tampering with `days` doesn't win.
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
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button, Card, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  dayCount,
  submitVacationRequest,
  type LeaveKind,
} from "@/lib/vacation";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

const KINDS: LeaveKind[] = ["vacation", "sick", "unpaid"];

/** Simple ISO-date input — YYYY-MM-DD text field. A native date-picker
 *  would be nicer but requires the community DateTimePicker package;
 *  keeping this dep-free until the next mobile turn. Validated below. */
function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export default function NewVacationRequest() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const today = format(new Date(), "yyyy-MM-dd");
  const [kind, setKind] = useState<LeaveKind>("vacation");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const days = useMemo(
    () =>
      isValidIsoDate(startDate) && isValidIsoDate(endDate)
        ? dayCount(startDate, endDate)
        : 0,
    [startDate, endDate],
  );

  async function onSubmit() {
    if (!profile?.employeeId || !profile.orgId) {
      Alert.alert(t("vacation.notLinkedTitle"), t("vacation.notLinkedBody"));
      return;
    }
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
      Alert.alert(t("vacation.invalidDateTitle"), t("vacation.invalidDateBody"));
      return;
    }
    if (days <= 0) {
      Alert.alert(t("vacation.invalidRangeTitle"), t("vacation.invalidRangeBody"));
      return;
    }

    setPending(true);
    const r = await submitVacationRequest({
      employeeId: profile.employeeId,
      orgId: profile.orgId,
      kind,
      startDate,
      endDate,
      reason: reason.trim() || null,
    });
    setPending(false);

    if (!r.ok) {
      Alert.alert(t("vacation.submitFailed"), r.error);
      return;
    }
    // Invalidate the list query so it refetches with the new row.
    await qc.invalidateQueries({ queryKey: ["my-vacation"] });
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← {t("schedule.back")}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>{t("vacation.newTitle")}</Text>
            <Text style={styles.sub}>{t("vacation.newSubtitle")}</Text>
          </View>

          <Card style={styles.card}>
            {/* Kind — segmented control */}
            <Text style={styles.label}>{t("vacation.kindLabel")}</Text>
            <View style={styles.segment}>
              {KINDS.map((k) => {
                const active = kind === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setKind(k)}
                    style={[
                      styles.segItem,
                      active && styles.segItemActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segLabel,
                        active && styles.segLabelActive,
                      ]}
                    >
                      {t(`vacation.kind.${k}` as never)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Dates — two side-by-side inputs */}
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("vacation.startDate")}</Text>
                <Input
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("vacation.endDate")}</Text>
                <Input
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.dayCount}>
              <Text style={styles.dayCountLabel}>{t("vacation.totalDays")}</Text>
              <Text style={styles.dayCountValue}>
                {days} {days === 1 ? t("vacation.day") : t("vacation.days")}
              </Text>
            </View>

            <Text style={styles.label}>{t("vacation.reasonLabel")}</Text>
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder={t("vacation.reasonPlaceholder")}
              multiline
              numberOfLines={3}
              style={styles.textarea}
              textAlignVertical="top"
            />

            <Button
              label={t("vacation.submit")}
              onPress={onSubmit}
              loading={pending}
              disabled={days <= 0}
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
  back: {
    marginBottom: spacing[1],
  },
  backText: {
    fontSize: typography.size.md,
    color: colors.primary[600],
    fontWeight: "600",
  },
  header: {
    gap: spacing[1],
  },
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
  card: {
    gap: spacing[3],
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[700],
    marginBottom: 6,
  },
  segment: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    overflow: "hidden",
    backgroundColor: colors.white,
  },
  segItem: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: "center",
  },
  segItemActive: {
    backgroundColor: colors.primary[500],
  },
  segLabel: {
    fontSize: typography.size.sm,
    fontWeight: "600",
    color: colors.neutral[700],
  },
  segLabelActive: {
    color: colors.white,
  },
  dateRow: {
    flexDirection: "row",
    gap: spacing[3],
  },
  dayCount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
  },
  dayCountLabel: {
    fontSize: typography.size.sm,
    fontWeight: "600",
    color: colors.primary[700],
  },
  dayCountValue: {
    fontSize: typography.size.lg,
    fontWeight: "800",
    color: colors.primary[700],
    fontFamily: "Menlo",
  },
  textarea: {
    minHeight: 80,
    paddingTop: spacing[3],
  },
});
