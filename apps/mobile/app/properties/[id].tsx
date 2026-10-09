/**
 * Property detail — Figma "Objekt" (frame 12).
 *
 * Hero card (kind tile, status + kind badges, address / client / since,
 * 4 stat tiles, chat · schedule · route actions), tabs (Übersicht ·
 * Einsätze) with recent shifts, safety & access information and notes.
 * Read-only: editing lives on the web app.
 */

import { useMemo, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  inferPropertyKind,
  loadMobilePropertyActivity,
  loadMobilePropertyDetail,
  type PropertyActivity,
  type PropertyKind,
  type PropertyShift,
  type PropertyStatus,
} from "@/lib/properties";
import { loadMyChannels } from "@/lib/chat";
import { useAuth } from "@/lib/auth-context";
import {
  Badge,
  Button,
  Card,
  CenterSpinner,
  DateBlock,
  Divider,
  EmptyState,
  Grid,
  HALF,
  Icon,
  KeyValue,
  NavHeader,
  RoundButton,
  Screen,
  SectionHeader,
  StatTile,
  TabsRow,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

type TabKey = "overview" | "shifts";

const OVERVIEW_SHIFTS = 5;

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

const STATUS_TONE: Record<PropertyStatus, Tone> = {
  active: "success",
  onboarding: "info",
  attention: "warning",
};

function kindIcon(kind: PropertyKind, alltags: boolean): IconName {
  return alltags || kind === "residential" ? "home" : kind === "industrial" ? "briefcase" : "building";
}

/** Shift status → badge (scheduled shifts whose start passed are late). */
function shiftBadge(s: PropertyShift): { label: string; tone: Tone } {
  const late = s.status === "scheduled" && new Date(s.starts_at).getTime() < Date.now();
  if (late) return { label: t("mobile.ui.properties.shift.late"), tone: "error" };
  switch (s.status) {
    case "completed":
      return { label: t("properties.detail.recentAssignments.statusCompleted"), tone: "success" };
    case "in_progress":
      return { label: t("properties.detail.recentAssignments.statusInProgress"), tone: "warning" };
    case "cancelled":
      return { label: t("properties.detail.recentAssignments.statusCancelled"), tone: "neutral" };
    case "no_show":
      return { label: t("properties.detail.recentAssignments.statusNoShow"), tone: "error" };
    default:
      return { label: t("properties.detail.recentAssignments.statusScheduled"), tone: "info" };
  }
}

function openMaps(address: string, lat?: number | null, lng?: number | null) {
  const q = encodeURIComponent(address);
  const coords = lat != null && lng != null ? `${lat},${lng}` : "0,0";
  const native =
    Platform.OS === "ios" ? `maps:${coords}?q=${q}` : `geo:${coords}?q=${q}`;
  // Native maps app first; Google Maps web where no handler exists.
  Linking.openURL(native).catch(() =>
    Linking.openURL(`https://maps.google.com/?q=${q}`),
  );
}

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [tab, setTab] = useState<TabKey>("overview");

  const query = useQuery({
    queryKey: ["propertyDetail", id],
    queryFn: () => loadMobilePropertyDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const activityQuery = useQuery<PropertyActivity>({
    queryKey: ["propertyActivity", id],
    queryFn: () => loadMobilePropertyActivity(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  // Same key + loader as the tab bar's unread badge → no extra request.
  const { data: channels } = useQuery({
    queryKey: ["chat-channels"],
    queryFn: loadMyChannels,
    enabled: !!session,
  });

  const d = query.data;
  // Property channels are created by a DB trigger as "#prop-<name ≤60>".
  const channelId = useMemo(() => {
    if (!d) return null;
    const name = `#prop-${d.name.slice(0, 60)}`;
    return (channels ?? []).find((c) => c.name === name)?.id ?? null;
  }, [channels, d]);

  const navHeader = <NavHeader title={t("mobile.ui.properties.detail.title")} />;

  if (query.isLoading) {
    return (
      <Screen scroll={false} header={navHeader}>
        <CenterSpinner />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen scroll={false} header={navHeader}>
        <EmptyState
          icon="building"
          title={t("mobile.properties.notFoundTitle")}
          subtitle={t("mobile.properties.notFoundBody")}
        />
      </Screen>
    );
  }

  const a = activityQuery.data;
  const alltags = d.client_customer_type === "alltagshilfe";
  const kind = inferPropertyKind(d.name, d.client_customer_type, d.kind);
  const young = !!d.created_at && Date.now() - new Date(d.created_at).getTime() < 30 * 86_400_000;
  // Same rule as the web detail: new + no shifts this week → onboarding,
  // nothing in 14 days → attention, otherwise active.
  const status: PropertyStatus | null = a
    ? young && a.shifts_last_7d === 0
      ? "onboarding"
      : a.shifts_last_14d === 0
        ? "attention"
        : "active"
    : null;
  const fullAddress = [
    d.address_line1,
    d.address_line2,
    [d.postal_code, d.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const shortAddress = [d.address_line1, [d.postal_code, d.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

  const safety: { label: string; value: string; mono?: boolean; color?: string }[] = [];
  // Legacy planned rhythm (only on deployments that carry the column).
  if (d.weekly_frequency != null && d.weekly_frequency > 0) {
    safety.push({
      label: t("mobile.properties.detail.weeklyFrequency"),
      value: t("mobile.properties.detail.freqEveryWeeks", {
        n: Math.round(1 / d.weekly_frequency),
      }),
    });
  }
  if (d.floor) safety.push({ label: t("properties.detail.floor"), value: d.floor });
  if (d.building_section)
    safety.push({ label: t("properties.detail.buildingSection"), value: d.building_section });
  if (d.access_code)
    safety.push({ label: t("properties.detail.accessCode"), value: d.access_code, mono: true });
  if (d.key_holder) safety.push({ label: t("mobile.properties.detail.keyHolder"), value: d.key_holder });
  if (a?.keys_out != null)
    safety.push({ label: t("mobile.ui.properties.detail.keysOut"), value: String(a.keys_out) });
  if (a?.incidents_12mo != null)
    safety.push({
      label: t("properties.detail.safety.incidents12mo"),
      value: String(a.incidents_12mo),
      color: a.incidents_12mo > 0 ? colors.warning[700] : undefined,
    });

  const longNotes: { label: string; value: string }[] = [
    { label: t("properties.detail.allergies"), value: d.allergies ?? "" },
    { label: t("properties.detail.restrictedAreas"), value: d.restricted_areas ?? "" },
    { label: t("properties.detail.safetyRegulations"), value: d.safety_regulations ?? "" },
    { label: t("mobile.properties.detail.alarmNotes"), value: d.alarm_notes ?? "" },
  ].filter((x) => x.value.trim().length > 0);

  const shifts = a?.shifts ?? [];

  return (
    <Screen
      header={navHeader}
      refreshing={query.isRefetching || activityQuery.isRefetching}
      onRefresh={() => {
        void query.refetch();
        void activityQuery.refetch();
      }}
    >
      {/* ------------------------------ Hero ------------------------------ */}
      <Card elevation="md" style={{ gap: 14 }}>
        <View style={styles.heroTop}>
          <View
            style={[
              styles.heroTile,
              { backgroundColor: alltags ? colors.error[500] : colors.secondary[500] },
            ]}
          >
            <Icon name={kindIcon(kind, alltags)} size={28} color={colors.white} />
          </View>
          <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
            <Txt v="title" color={colors.secondary[500]} numberOfLines={3}>
              {d.name}
            </Txt>
            <View style={styles.badges}>
              {status ? (
                <Badge label={t(`mobile.ui.properties.status.${status}`)} tone={STATUS_TONE[status]} />
              ) : null}
              <Badge label={t(`properties.kind.${kind}`)} tone={alltags ? "error" : "info"} dot={false} />
            </View>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          {shortAddress ? (
            <Meta icon="map-pin" onPress={() => openMaps(fullAddress, d.latitude, d.longitude)}>
              {shortAddress}
            </Meta>
          ) : null}
          <Meta
            icon="users"
            color={colors.secondary[500]}
            onPress={() => router.push({ pathname: "/clients/[id]", params: { id: d.client_id } })}
          >
            {d.client_name}
          </Meta>
          {d.created_at ? (
            <Meta icon="calendar">
              {t("mobile.ui.properties.detail.since", {
                date: format(parseISO(d.created_at), "LLLL yyyy", { locale: dfLocale() }),
              })}
            </Meta>
          ) : null}
        </View>

        <Grid gap={spacing[2]}>
          <StatTile
            style={HALF}
            label={t("mobile.ui.properties.detail.area")}
            value={
              d.size_sqm != null
                ? `${d.size_sqm.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²`
                : "—"
            }
          />
          <StatTile
            style={HALF}
            label={t("mobile.ui.properties.detail.team")}
            value={a ? String(a.team.length) : "—"}
          />
          <StatTile
            style={HALF}
            label={t("mobile.ui.properties.detail.frequency")}
            value={a ? t("mobile.ui.properties.detail.perWeek", { n: a.shifts_last_7d }) : "—"}
            valueColor={colors.primary[700]}
          />
          <StatTile
            style={HALF}
            label={t("mobile.ui.properties.detail.shiftsTotal")}
            value={a ? String(a.total_shifts) : "—"}
          />
        </Grid>

        <View style={styles.heroActions}>
          {channelId ? (
            <RoundButton
              icon="chat"
              variant="subtle"
              size={44}
              accessibilityLabel={t("clients.detail.openChat")}
              onPress={() =>
                router.push({ pathname: "/chat/[channelId]", params: { channelId } })
              }
            />
          ) : null}
          <RoundButton
            icon="calendar"
            variant="subtle"
            size={44}
            accessibilityLabel={t("clients.detail.openSchedule")}
            onPress={() => router.push("/(tabs)/schedule")}
          />
          {fullAddress ? (
            <Button
              label={t("mobile.ui.properties.detail.route")}
              icon="navigation"
              size="md"
              style={{ flex: 1, minHeight: 44 }}
              onPress={() => openMaps(fullAddress, d.latitude, d.longitude)}
            />
          ) : null}
        </View>
      </Card>

      <TabsRow
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: t("properties.detail.tabOverview") },
          { value: "shifts", label: t("mobile.ui.properties.detail.tabShifts"), count: a?.total_shifts },
        ]}
      />

      {activityQuery.isLoading ? <CenterSpinner /> : null}

      {/* ---------------------------- Overview ---------------------------- */}
      {tab === "overview" ? (
        <>
          {a ? (
            <Card style={{ gap: spacing[2] }}>
              <SectionHeader
                title={t("properties.detail.recentAssignments.title")}
                subtitle={t("mobile.ui.properties.detail.thisMonth", { n: a.shifts_this_month })}
                actionLabel={
                  shifts.length > OVERVIEW_SHIFTS ? t("mobile.ui.properties.detail.all") : undefined
                }
                onAction={() => setTab("shifts")}
              />
              <ShiftList shifts={shifts.slice(0, OVERVIEW_SHIFTS)} />
            </Card>
          ) : null}

          {safety.length > 0 || longNotes.length > 0 ? (
            <Card style={{ gap: spacing[1] }}>
              <Txt v="headline">{t("properties.detail.safetySectionTitle")}</Txt>
              {safety.map((r, i) => (
                <View key={r.label}>
                  {i > 0 ? <Divider /> : null}
                  <KeyValue label={r.label} value={r.value} mono={r.mono} valueColor={r.color} />
                </View>
              ))}
              {longNotes.map((n, i) => (
                <View key={n.label}>
                  {i > 0 || safety.length > 0 ? <Divider /> : null}
                  <View style={styles.longNote}>
                    <Txt v="subhead" color={colors.neutral[500]}>
                      {n.label}
                    </Txt>
                    <Txt v="subhead" color={colors.neutral[900]}>
                      {n.value}
                    </Txt>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {d.notes ? (
            <Card style={{ gap: spacing[2] }}>
              <Txt v="headline">{t("mobile.properties.detail.notesSection")}</Txt>
              <Txt v="subhead" color={colors.neutral[800]}>
                {d.notes}
              </Txt>
            </Card>
          ) : null}
        </>
      ) : null}

      {/* ----------------------------- Shifts ----------------------------- */}
      {tab === "shifts" && a ? (
        <Card style={{ gap: spacing[2] }}>
          <SectionHeader
            title={t("mobile.ui.properties.detail.tabShifts")}
            subtitle={t("mobile.ui.properties.detail.thisMonth", { n: a.shifts_this_month })}
          />
          <ShiftList shifts={shifts} />
        </Card>
      ) : null}
    </Screen>
  );
}

function Meta({
  icon,
  children,
  onPress,
  color = colors.neutral[600],
}: {
  icon: IconName;
  children: string;
  onPress?: () => void;
  color?: string;
}) {
  const body = (
    <View style={styles.meta}>
      <Icon name={icon} size={16} color={colors.neutral[400]} />
      <Txt v="subhead" color={color} numberOfLines={1} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="link">
      {body}
    </Pressable>
  ) : (
    body
  );
}

function ShiftList({ shifts }: { shifts: PropertyShift[] }) {
  const locale = dfLocale();
  if (shifts.length === 0) {
    return (
      <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
        {t("properties.detail.recentAssignments.emptyState")}
      </Txt>
    );
  }
  const today = new Date();
  return (
    <View>
      {shifts.map((s, i) => {
        const start = new Date(s.starts_at);
        const end = new Date(s.ends_at);
        const badge = shiftBadge(s);
        const title =
          s.notes?.split("\n")[0]?.trim() ||
          format(start, i18n.locale === "en" ? "EEEE, MMMM d" : "EEEE, d. MMMM", { locale });
        return (
          <View key={s.id}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.shiftRow}>
              <DateBlock
                day={format(start, "d")}
                month={format(start, "MMM", { locale }).replace(".", "")}
                highlight={isSameDay(start, today)}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt v="subheadStrong" numberOfLines={2}>
                  {title}
                </Txt>
                <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                  {`${format(start, "HH:mm")} – ${format(end, "HH:mm")} · ${
                    s.employee_name ?? t("properties.detail.recentAssignments.unassigned")
                  }`}
                </Txt>
              </View>
              <Badge label={badge.label} tone={badge.tone} dot={false} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyLine: { textAlign: "center", paddingVertical: spacing[3] },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  longNote: { gap: 2, paddingVertical: 10 },
});
