/**
 * Settings tab — three sections in one scroll: My Account, Security,
 * Sessions & Devices. Each section is a Card block with its own save /
 * action buttons. Kept in one file since none of the sections is big
 * enough to warrant its own screen.
 */

import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Button, Card, Chip, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadMfaState,
  loadMyDevices,
  revokeDevice,
  signOutOthers,
  unenrollTotp,
  updateMyProfile,
  type MfaState,
  type UserDevice,
} from "@/lib/account";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function SettingsTab() {
  const { profile, signOut, refreshProfile } = useAuth();
  const qc = useQueryClient();

  // ── My Account form state ────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [phone, setPhone] = useState("");
  const [profilePending, setProfilePending] = useState(false);

  // Sync from context whenever profile refreshes (e.g. after save).
  useEffect(() => {
    if (profile?.fullName) setFullName(profile.fullName);
  }, [profile?.fullName]);

  async function saveProfile() {
    setProfilePending(true);
    const r = await updateMyProfile({ fullName, phone });
    setProfilePending(false);
    if (!r.ok) {
      Alert.alert(t("settings.saveFailed"), r.error);
      return;
    }
    await refreshProfile();
    Alert.alert(t("settings.saved"));
  }

  // ── MFA / Security ───────────────────────────────────────────────
  const { data: mfa, refetch: refetchMfa } = useQuery<MfaState>({
    queryKey: ["mfa-state", profile?.id],
    queryFn: loadMfaState,
    enabled: !!profile?.id,
  });

  async function onDisable2FA() {
    if (!mfa?.factorId) return;
    const canDisable = profile?.role === "employee"; // spec §6.2
    if (!canDisable) {
      Alert.alert(
        t("settings.security.cannotDisable"),
        t("settings.security.cannotDisableBody"),
      );
      return;
    }
    setMfaPending(true);
    const r = await unenrollTotp(mfa.factorId);
    setMfaPending(false);
    if (!r.ok) {
      Alert.alert(t("settings.security.disableFailed"), r.error);
      return;
    }
    await refetchMfa();
  }
  const [mfaPending, setMfaPending] = useState(false);

  // ── Sessions ─────────────────────────────────────────────────────
  const {
    data: devices,
    isLoading: devicesLoading,
    refetch: refetchDevices,
    isRefetching: devicesRefetching,
  } = useQuery<UserDevice[]>({
    queryKey: ["my-devices", profile?.id],
    queryFn: loadMyDevices,
    enabled: !!profile?.id,
  });

  async function onRevokeDevice(id: string) {
    const r = await revokeDevice(id);
    if (!r.ok) {
      Alert.alert(t("settings.sessions.revokeFailed"), r.error);
      return;
    }
    qc.setQueryData<UserDevice[]>(["my-devices", profile?.id], (prev) =>
      (prev ?? []).filter((d) => d.id !== id),
    );
  }

  async function onSignOutOthers() {
    Alert.alert(
      t("settings.sessions.signOutOthersTitle"),
      t("settings.sessions.signOutOthersBody"),
      [
        { text: t("schedule.cancel"), style: "cancel" },
        {
          text: t("settings.sessions.signOutOthersConfirm"),
          style: "destructive",
          onPress: async () => {
            const r = await signOutOthers();
            if (!r.ok) {
              Alert.alert(t("settings.sessions.revokeFailed"), r.error);
              return;
            }
            await refetchDevices();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={devicesRefetching}
            onRefresh={() => refetchDevices()}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t("settings.title")}</Text>
          <Text style={styles.sub}>{t("settings.subtitle")}</Text>
        </View>

        {/* Identity card — role + email at a glance. */}
        <Card style={styles.card}>
          <View style={styles.identityRow}>
            <View
              style={[
                styles.avatarLarge,
                {
                  backgroundColor:
                    profile?.role === "admin"
                      ? colors.primary[500]
                      : profile?.role === "dispatcher"
                        ? colors.secondary[500]
                        : colors.success[500],
                },
              ]}
            >
              <Text style={styles.avatarLargeText}>
                {(profile?.fullName?.[0] ?? "?").toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{profile?.fullName ?? "—"}</Text>
              <Text style={styles.email}>{profile?.orgId ? "" : ""}</Text>
              {profile?.role && (
                <Chip
                  label={
                    profile.role === "admin"
                      ? "MANAGEMENT"
                      : profile.role === "dispatcher"
                        ? "PROJECT MANAGER"
                        : "FIELD STAFF"
                  }
                  tone={
                    profile.role === "admin"
                      ? "primary"
                      : profile.role === "dispatcher"
                        ? "secondary"
                        : "success"
                  }
                />
              )}
            </View>
          </View>
        </Card>

        {/* ── My Account ── */}
        <Card style={styles.card}>
          <Text style={styles.sectionH}>{t("settings.myAccount.title")}</Text>
          <Text style={styles.sectionSub}>
            {t("settings.myAccount.subtitle")}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("settings.myAccount.fullName")}</Text>
            <Input value={fullName} onChangeText={setFullName} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("settings.myAccount.phone")}</Text>
            <Input
              value={phone}
              onChangeText={setPhone}
              placeholder="+49 …"
              keyboardType="phone-pad"
              autoCorrect={false}
            />
          </View>

          <Button
            label={t("settings.save")}
            onPress={saveProfile}
            loading={profilePending}
          />
        </Card>

        {/* ── Security ── */}
        <Card style={styles.card}>
          <Text style={styles.sectionH}>{t("settings.security.title")}</Text>
          <Text style={styles.sectionSub}>{t("settings.security.subtitle")}</Text>

          <View style={styles.rowSpread}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {t("settings.security.twoFactor")}
              </Text>
              <Text style={styles.rowBody}>
                {mfa?.hasVerifiedTotp
                  ? t("settings.security.twoFactorOn")
                  : t("settings.security.twoFactorOff")}
              </Text>
            </View>
            <Chip
              label={mfa?.hasVerifiedTotp ? "ENABLED" : "DISABLED"}
              tone={mfa?.hasVerifiedTotp ? "success" : "neutral"}
            />
          </View>
          {mfa?.hasVerifiedTotp && profile?.role === "employee" && (
            <Button
              label={t("settings.security.disable")}
              variant="ghost"
              onPress={onDisable2FA}
              loading={mfaPending}
            />
          )}
          {mfa?.hasVerifiedTotp && profile?.role !== "employee" && (
            <Text style={styles.mfaNote}>
              {t("settings.security.mandatoryNote")}
            </Text>
          )}
          {!mfa?.hasVerifiedTotp && profile?.role !== "employee" && (
            <Text style={styles.mfaNote}>
              {t("settings.security.enrolOnWeb")}
            </Text>
          )}
        </Card>

        {/* ── Sessions ── */}
        <Card style={styles.card}>
          <View style={styles.rowSpread}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionH}>
                {t("settings.sessions.title")}
              </Text>
              <Text style={styles.sectionSub}>
                {t("settings.sessions.subtitle")}
              </Text>
            </View>
            {devices && devices.length > 1 && (
              <Pressable onPress={onSignOutOthers} style={styles.signOutOthersBtn}>
                <Text style={styles.signOutOthersText}>
                  {t("settings.sessions.signOutOthers")}
                </Text>
              </Pressable>
            )}
          </View>

          {devicesLoading && (
            <Text style={styles.emptyLine}>{t("settings.sessions.loading")}</Text>
          )}
          {!devicesLoading && (devices ?? []).length === 0 && (
            <Text style={styles.emptyLine}>{t("settings.sessions.none")}</Text>
          )}
          {(devices ?? []).map((d) => (
            <View key={d.id} style={styles.deviceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceLabel}>{d.device_label}</Text>
                <Text style={styles.deviceMeta}>
                  {d.geo_label ?? t("schedule.gpsPermTitle")} ·{" "}
                  {format(parseISO(d.last_seen_at), "d LLL · HH:mm")}
                </Text>
              </View>
              <Pressable
                onPress={() => onRevokeDevice(d.id)}
                style={styles.revokeBtn}
              >
                <Text style={styles.revokeBtnText}>
                  {t("settings.sessions.revoke")}
                </Text>
              </Pressable>
            </View>
          ))}
        </Card>

        <View style={{ height: spacing[3] }} />
        <Button
          label={t("nav.logout") ?? "Sign out"}
          onPress={() => signOut()}
          variant="danger"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[8],
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
  card: { gap: spacing[3] },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  avatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLargeText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 24,
  },
  name: {
    fontSize: typography.size.lg,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  email: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
    marginBottom: 6,
  },
  sectionH: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.secondary[500],
  },
  sectionSub: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  fieldGroup: {
    marginTop: spacing[2],
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[700],
    marginBottom: 6,
  },
  rowSpread: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginTop: spacing[1],
  },
  rowTitle: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  rowBody: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  mfaNote: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    fontStyle: "italic",
    marginTop: spacing[2],
    lineHeight: 18,
  },
  signOutOthersBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.error[100],
    backgroundColor: colors.error[50],
  },
  signOutOthersText: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.error[700],
  },
  emptyLine: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    padding: spacing[3],
    textAlign: "center",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  deviceLabel: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  deviceMeta: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: 2,
    fontFamily: "Menlo",
  },
  revokeBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error[100],
    backgroundColor: colors.white,
  },
  revokeBtnText: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.error[700],
  },
});
