/**
 * My training modules — sequential onboarding videos.
 *
 * Each row: title, mandatory badge, status (not started / in progress /
 * completed), "Watch" (opens the URL in the system browser and marks
 * the module as started), "Mark completed" (writes progress row).
 *
 * The web app enforces a video-sequence gate that locks scheduling
 * until all mandatory modules are done. This screen writes to the same
 * `employee_training_progress` table so both surfaces stay in sync.
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
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "@/lib/auth-context";
import {
  loadMyTraining,
  markModuleCompleted,
  markModuleStarted,
  type TrainingModule,
} from "@/lib/training";
import { Chip, EmptyState } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function TrainingScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const employeeId = profile?.employeeId ?? null;

  const modulesQuery = useQuery({
    queryKey: ["training", employeeId],
    queryFn: () => loadMyTraining(employeeId!),
    enabled: !!employeeId,
    staleTime: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: (moduleId: string) => markModuleStarted(employeeId!, moduleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training"] }),
  });

  const completeMutation = useMutation({
    mutationFn: (moduleId: string) =>
      markModuleCompleted(employeeId!, moduleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training"] }),
  });

  const modules = modulesQuery.data ?? [];
  const mandatoryDone = modules.filter(
    (m) => m.is_mandatory && m.completed_at,
  ).length;
  const mandatoryTotal = modules.filter((m) => m.is_mandatory).length;
  const allMandatoryDone =
    mandatoryTotal > 0 && mandatoryDone === mandatoryTotal;

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
        <Text style={styles.headerTitle}>{t("mobile.training.title")}</Text>
      </View>

      <View style={styles.progressCard}>
        <Text style={styles.progressLabel}>
          {t("mobile.training.progressLabel")}
        </Text>
        <Text style={styles.progressValue}>
          {mandatoryDone} / {mandatoryTotal || "—"}
        </Text>
        <Text style={styles.progressHint}>
          {allMandatoryDone
            ? t("mobile.training.allDoneHint")
            : t("mobile.training.notDoneHint")}
        </Text>
      </View>

      {modulesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : modules.length === 0 ? (
        <EmptyState
          title={t("mobile.training.emptyTitle")}
          subtitle={t("mobile.training.emptyBody")}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing[4], gap: 10 }}>
          {modules.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              onWatch={() => {
                if (m.video_url) {
                  Linking.openURL(m.video_url).catch(() => {});
                  if (!m.started_at) startMutation.mutate(m.id);
                }
              }}
              onComplete={() => completeMutation.mutate(m.id)}
              completing={completeMutation.isPending}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ModuleCard({
  module,
  onWatch,
  onComplete,
  completing,
}: {
  module: TrainingModule;
  onWatch: () => void;
  onComplete: () => void;
  completing: boolean;
}) {
  const done = !!module.completed_at;
  const started = !!module.started_at && !done;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {module.title}
        </Text>
        {module.is_mandatory && (
          <Chip
            label={t("mobile.training.mandatory")}
            tone="error"
          />
        )}
        {done ? (
          <Chip label={t("mobile.training.status.done")} tone="primary" />
        ) : started ? (
          <Chip label={t("mobile.training.status.inProgress")} tone="warning" />
        ) : (
          <Chip label={t("mobile.training.status.notStarted")} tone="neutral" />
        )}
      </View>
      {module.description && (
        <Text style={styles.cardBody}>{module.description}</Text>
      )}
      <View style={styles.cardActions}>
        <Pressable
          onPress={onWatch}
          disabled={!module.video_url}
          style={[
            styles.watchBtn,
            !module.video_url && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.watchBtnText}>
            {module.video_url
              ? t("mobile.training.watchCta")
              : t("mobile.training.noVideoUrl")}
          </Text>
        </Pressable>
        {!done && (
          <Pressable
            onPress={onComplete}
            disabled={completing}
            style={[
              styles.completeBtn,
              completing && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.completeBtnText}>
              {t("mobile.training.markCompletedCta")}
            </Text>
          </Pressable>
        )}
      </View>
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
  progressCard: {
    margin: spacing[4],
    padding: spacing[4],
    borderRadius: 10,
    backgroundColor: colors.secondary[50],
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.secondary[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  progressValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  progressHint: {
    marginTop: 4,
    fontSize: typography.size.sm,
    color: colors.neutral[600],
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.neutral[100],
    gap: 10,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  cardBody: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  watchBtn: {
    flex: 1,
    minWidth: 140,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.secondary[500],
    alignItems: "center",
  },
  watchBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: typography.size.sm,
  },
  completeBtn: {
    flex: 1,
    minWidth: 140,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary[500],
    alignItems: "center",
  },
  completeBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: typography.size.sm,
  },
});
