/**
 * My training modules — sequential onboarding videos (Figma 23-training).
 *
 * Each card: gradient thumbnail, title, mandatory badge, status (not
 * started / in progress / completed), "Watch" / "Continue" (opens the
 * URL in the system browser and marks the module as started) and
 * "Mark completed" (writes progress row).
 *
 * The web app enforces a video-sequence gate that locks scheduling
 * until all mandatory modules are done. This screen writes to the same
 * `employee_training_progress` table so both surfaces stay in sync.
 */

import React from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useAuth } from "@/lib/auth-context";
import {
  loadMyTraining,
  markModuleCompleted,
  markModuleStarted,
  type TrainingModule,
} from "@/lib/training";
import {
  Badge,
  Button,
  Card,
  CenterSpinner,
  EmptyState,
  Icon,
  IconChip,
  NavHeader,
  Notice,
  ProgressBar,
  Screen,
  Txt,
} from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function TrainingScreen() {
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
  // The next module in sequence gets the highlighted border.
  const nextId = modules.find((m) => !m.completed_at)?.id ?? null;

  return (
    <Screen
      header={<NavHeader title={t("mobile.training.title")} />}
      refreshing={modulesQuery.isRefetching}
      onRefresh={() => modulesQuery.refetch()}
      gap={12}
    >
      {/* Mandatory progress */}
      <Card style={styles.progressCard}>
        <View style={styles.progressTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="callout" color={colors.neutral[700]}>
              {t("mobile.training.progressLabel")}
            </Txt>
            <Txt v="display" color={colors.secondary[500]}>
              {mandatoryDone} / {mandatoryTotal || "—"}
            </Txt>
          </View>
          <IconChip icon="graduation" tone="brand" size={48} iconSize={24} />
        </View>
        <ProgressBar
          value={mandatoryTotal > 0 ? mandatoryDone / mandatoryTotal : 0}
          height={8}
        />
        <Notice
          tone={allMandatoryDone ? "success" : "warning"}
          icon={allMandatoryDone ? "check" : "alert"}
        >
          {allMandatoryDone
            ? t("mobile.training.allDoneHint")
            : t("mobile.training.notDoneHint")}
        </Notice>
      </Card>

      {modulesQuery.isLoading ? (
        <CenterSpinner />
      ) : modules.length === 0 ? (
        <EmptyState
          icon="graduation"
          title={t("mobile.training.emptyTitle")}
          subtitle={t("mobile.training.emptyBody")}
        />
      ) : (
        modules.map((m) => (
          <ModuleCard
            key={m.id}
            module={m}
            highlight={m.id === nextId}
            onWatch={() => {
              if (!m.video_url) return;
              Linking.openURL(m.video_url).catch(() => {});
              if (!m.started_at) startMutation.mutate(m.id);
            }}
            onComplete={() => completeMutation.mutate(m.id)}
            completing={completeMutation.isPending}
          />
        ))
      )}
    </Screen>
  );
}

const ModuleCard = React.memo(function ModuleCard({
  module,
  highlight,
  onWatch,
  onComplete,
  completing,
}: {
  module: TrainingModule;
  highlight: boolean;
  onWatch: () => void;
  onComplete: () => void;
  completing: boolean;
}) {
  const done = !!module.completed_at;
  const started = !!module.started_at && !done;
  const hasVideo = !!module.video_url;

  return (
    <Card
      style={[
        styles.card,
        highlight && { borderColor: colors.primary[300], borderWidth: 1.5 },
      ]}
    >
      <View style={styles.cardRow}>
        <Pressable
          onPress={onWatch}
          disabled={!hasVideo}
          accessibilityRole="button"
          accessibilityLabel={hasVideo ? t("mobile.training.watchCta") : t("mobile.training.noVideoUrl")}
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        >
          <Thumbnail done={done} />
        </Pressable>
        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <Txt v="headline" numberOfLines={2}>
            {module.title}
          </Txt>
          <View style={styles.badges}>
            {module.is_mandatory ? (
              <Badge label={t("mobile.training.mandatory")} tone="error" dot={false} />
            ) : null}
            {done ? (
              <Badge label={t("mobile.training.status.done")} tone="success" />
            ) : started ? (
              <Badge label={t("mobile.training.status.inProgress")} tone="warning" />
            ) : (
              <Badge label={t("mobile.training.status.notStarted")} tone="neutral" />
            )}
          </View>
        </View>
      </View>

      {module.description ? (
        <Txt v="subhead" color={colors.neutral[600]}>
          {module.description}
        </Txt>
      ) : null}

      {!done ? (
        <View style={{ gap: 8 }}>
          <Button
            label={
              !hasVideo
                ? t("mobile.training.noVideoUrl")
                : started
                  ? t("mobile.ui.training.continue")
                  : t("mobile.training.watchCta")
            }
            icon="play"
            variant={started ? "outline" : "primary"}
            size="md"
            onPress={onWatch}
            disabled={!hasVideo}
          />
          <Button
            label={t("mobile.training.markCompletedCta")}
            icon="check"
            variant="ghost"
            size="md"
            onPress={onComplete}
            disabled={completing}
          />
        </View>
      ) : null}
    </Card>
  );
});

/** Navy → green gradient tile with a play (or check) disc — drawn with SVG. */
function Thumbnail({ done }: { done: boolean }) {
  return (
    <View style={styles.thumb}>
      <Svg width={THUMB_W} height={THUMB_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="trainingThumb" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.secondary[500]} />
            <Stop offset="1" stopColor={colors.primary[500]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={THUMB_W} height={THUMB_H} rx={radius.md} fill="url(#trainingThumb)" />
      </Svg>
      <View style={styles.thumbDisc}>
        {done ? (
          <Icon name="check" size={16} color={colors.primary[600]} strokeWidth={2.5} />
        ) : (
          <Icon name="play" size={14} color={colors.primary[600]} strokeWidth={2.5} />
        )}
      </View>
    </View>
  );
}

const THUMB_W = 104;
const THUMB_H = 64;

const styles = StyleSheet.create({
  progressCard: { gap: 14 },
  progressTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  card: { gap: 12, padding: 14 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
});
