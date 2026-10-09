/**
 * Settings — Figma "18 · Einstellungen". Hidden tab route reached from
 * the More screen, so it uses the pushed-screen NavHeader.
 *
 * Account card on top, then grouped rows. Rows that carry a form or a
 * list expand inline so all logic stays on one screen:
 *   - Konto       → Personal data (name + phone form) · Language
 *   - Sicherheit  → Two-factor status (+ disable for field staff) ·
 *                   Sessions & devices (revoke · sign out others)
 *   - App         → Version (expo-constants)
 * Sign out as a danger button at the bottom.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import Constants from "expo-constants";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  GroupLabel,
  Icon,
  IconChip,
  InputField,
  ListRow,
  NavHeader,
  RoundButton,
  Screen,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadMfaState,
  loadMyDevices,
  loadMyPhone,
  revokeDevice,
  signOutOthers,
  unenrollTotp,
  updateMyProfile,
  type MfaState,
  type UserDevice,
} from "@/lib/account";
import { colors, spacing } from "@/lib/theme";
import { i18n, saveLocale, t, type Locale } from "@/lib/i18n";

type Panel = "profile" | "language" | "twoFactor" | "sessions";
const LOCALES: Locale[] = ["de", "en", "ta"];

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

function roleLabelKey(role?: string | null): string | null {
  return role === "admin" || role === "dispatcher" || role === "employee"
    ? `mobile.ui.more.role.${role}`
    : null;
}

export default function SettingsTab() {
  const router = useRouter();
  const { profile, session, signOut, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Panel | null>(null);
  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p));

  // ── My Account form state ────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [phone, setPhone] = useState("");
  const [profilePending, setProfilePending] = useState(false);

  // Sync from context whenever profile refreshes (e.g. after save).
  useEffect(() => {
    if (profile?.fullName) setFullName(profile.fullName);
  }, [profile?.fullName]);

  // Prefill the stored phone so saving the name doesn't clear it.
  const phoneTouched = useRef(false);
  const { data: storedPhone } = useQuery({
    queryKey: ["my-phone", profile?.id],
    queryFn: loadMyPhone,
    enabled: !!profile?.id,
  });
  useEffect(() => {
    if (storedPhone && !phoneTouched.current) setPhone(storedPhone);
  }, [storedPhone]);

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

  // ── Language ─────────────────────────────────────────────────────
  const [locale, setLocale] = useState<Locale>(i18n.locale as Locale);
  async function onPickLocale(l: Locale) {
    await saveLocale(l);
    setLocale(l);
    setOpen(null);
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

  // ── Presentation helpers ─────────────────────────────────────────
  const roleKey = roleLabelKey(profile?.role);
  const email = session?.user?.email ?? null;
  const version = Constants.expoConfig?.version ?? null;
  const build =
    Platform.OS === "ios"
      ? Constants.platform?.ios?.buildNumber
      : Constants.platform?.android?.versionCode;
  const versionText = version
    ? build != null && build !== ""
      ? t("mobile.ui.settings.build", { version, build: String(build) })
      : version
    : "—";
  const devicesSub = devicesLoading
    ? t("settings.sessions.loading")
    : t("mobile.ui.settings.devicesCount", { n: (devices ?? []).length });
  const expandIcon = (p: Panel) => (
    <Icon name={open === p ? "chevron-down" : "chevron-right"} size={18} color={colors.neutral[400]} />
  );

  return (
    <Screen
      scroll={false}
      header={
        <NavHeader
          title={t("settings.title")}
          onBack={() => router.navigate("/more" as never)}
        />
      }
    >
      <ScrollView
        contentContainerStyle={styles.container}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={devicesRefetching}
            onRefresh={() => refetchDevices()}
            tintColor={colors.primary[500]}
          />
        }
      >
        {/* Identity card — role + email at a glance. */}
        <Card style={styles.account}>
          <Avatar name={profile?.fullName} size={56} />
          <View style={styles.accountText}>
            <Txt v="headline" numberOfLines={1}>
              {profile?.fullName ?? "—"}
            </Txt>
            {email ? (
              <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
                {email}
              </Txt>
            ) : null}
            {roleKey ? (
              <Badge label={t(roleKey)} tone="info" dot={false} style={styles.roleBadge} />
            ) : null}
          </View>
          <RoundButton
            icon="edit"
            variant="subtle"
            onPress={() => toggle("profile")}
            accessibilityLabel={t("common.edit")}
          />
        </Card>

        {/* ── Konto ── */}
        <Group label={t("mobile.more.sectionAccount")}>
          <ListRow
            title={t("mobile.ui.settings.personalData")}
            subtitle={t("mobile.ui.settings.personalDataHint")}
            leading={<RowIcon icon="user" tone="brand" />}
            trailing={expandIcon("profile")}
            chevron={false}
            onPress={() => toggle("profile")}
          />
          {open === "profile" ? (
            <View style={styles.panel}>
              <InputField
                label={t("settings.myAccount.fullName")}
                value={fullName}
                onChangeText={setFullName}
              />
              <InputField
                label={t("settings.myAccount.phone")}
                value={phone}
                onChangeText={(v) => {
                  phoneTouched.current = true;
                  setPhone(v);
                }}
                placeholder="+49 …"
                keyboardType="phone-pad"
                autoCorrect={false}
              />
              <Button
                label={t("settings.save")}
                onPress={saveProfile}
                loading={profilePending}
                size="md"
              />
            </View>
          ) : null}
          <Divider />
          <ListRow
            title={t("settings.account.language")}
            leading={<RowIcon icon="globe" tone="info" />}
            trailing={
              <View style={styles.valueRow}>
                <Txt v="subhead" color={colors.neutral[500]}>
                  {t(`mobile.ui.settings.lang.${locale}`)}
                </Txt>
                {expandIcon("language")}
              </View>
            }
            chevron={false}
            onPress={() => toggle("language")}
          />
          {open === "language"
            ? LOCALES.map((l) => (
                <View key={l}>
                  <Divider inset={64} />
                  <ListRow
                    title={t(`mobile.ui.settings.lang.${l}`)}
                    leading={<View style={styles.optionIndent} />}
                    trailing={
                      l === locale ? (
                        <Icon name="check" size={18} color={colors.primary[600]} strokeWidth={2.5} />
                      ) : null
                    }
                    chevron={false}
                    onPress={() => void onPickLocale(l)}
                  />
                </View>
              ))
            : null}
        </Group>

        {/* ── Sicherheit ── */}
        <Group label={t("settings.security.title")}>
          <ListRow
            title={t("settings.security.twoFactor")}
            subtitle={
              mfa?.hasVerifiedTotp
                ? t("mobile.ui.settings.authenticatorApp")
                : t("settings.security.twoFactorOff")
            }
            leading={<RowIcon icon="shield" tone="success" />}
            badge={
              mfa ? (
                <Badge
                  label={
                    mfa.hasVerifiedTotp
                      ? t("settings.security.enabled")
                      : t("settings.security.disabled")
                  }
                  tone={mfa.hasVerifiedTotp ? "success" : "neutral"}
                />
              ) : null
            }
            trailing={expandIcon("twoFactor")}
            chevron={false}
            onPress={() => toggle("twoFactor")}
          />
          {open === "twoFactor" ? (
            <View style={styles.panel}>
              <Txt v="subhead" color={colors.neutral[600]}>
                {mfa?.hasVerifiedTotp
                  ? t("settings.security.twoFactorOn")
                  : t("settings.security.twoFactorOff")}
              </Txt>
              {mfa?.hasVerifiedTotp && profile?.role === "employee" && (
                <Button
                  label={t("settings.security.disable")}
                  variant="outline"
                  size="md"
                  onPress={onDisable2FA}
                  loading={mfaPending}
                />
              )}
              {mfa?.hasVerifiedTotp && profile?.role !== "employee" && (
                <Txt v="caption" color={colors.neutral[500]}>
                  {t("settings.security.mandatoryNote")}
                </Txt>
              )}
              {!mfa?.hasVerifiedTotp && profile?.role !== "employee" && (
                <Txt v="caption" color={colors.neutral[500]}>
                  {t("settings.security.enrolOnWeb")}
                </Txt>
              )}
            </View>
          ) : null}
          <Divider />
          <ListRow
            title={t("settings.sessions.title")}
            subtitle={devicesSub}
            leading={<RowIcon icon="settings" tone="neutral" />}
            trailing={expandIcon("sessions")}
            chevron={false}
            onPress={() => toggle("sessions")}
          />
          {open === "sessions" ? (
            <View style={styles.panel}>
              {devicesLoading && (
                <Txt v="subhead" color={colors.neutral[500]} style={styles.center}>
                  {t("settings.sessions.loading")}
                </Txt>
              )}
              {!devicesLoading && (devices ?? []).length === 0 && (
                <Txt v="subhead" color={colors.neutral[500]} style={styles.center}>
                  {t("settings.sessions.none")}
                </Txt>
              )}
              {(devices ?? []).map((d, i) => (
                <View key={d.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.deviceRow}>
                    <View style={styles.deviceText}>
                      <Txt v="bodyStrong" numberOfLines={1}>
                        {d.device_label}
                      </Txt>
                      <Txt v="mono" color={colors.neutral[500]} style={styles.deviceMeta} numberOfLines={1}>
                        {d.geo_label ?? t("settings.sessions.geoUnknown")} ·{" "}
                        {format(parseISO(d.last_seen_at), "d LLL · HH:mm", { locale: dfLocale() })}
                      </Txt>
                    </View>
                    <Button
                      label={t("settings.sessions.revoke")}
                      variant="danger"
                      size="md"
                      onPress={() => onRevokeDevice(d.id)}
                    />
                  </View>
                </View>
              ))}
              {devices && devices.length > 1 && (
                <Button
                  label={t("settings.sessions.signOutOthers")}
                  variant="outline"
                  size="md"
                  icon="logout"
                  onPress={onSignOutOthers}
                />
              )}
            </View>
          ) : null}
        </Group>

        {/* ── App ── */}
        <Group label={t("mobile.ui.settings.appSection")}>
          <ListRow
            title={t("mobile.ui.settings.version")}
            leading={<RowIcon icon="file-text" tone="neutral" />}
            trailing={
              <Txt v="mono" color={colors.neutral[500]}>
                {versionText}
              </Txt>
            }
            chevron={false}
          />
        </Group>

        <Button
          label={t("nav.logout") ?? "Sign out"}
          onPress={() => signOut()}
          variant="danger"
          icon="logout"
        />
      </ScrollView>
    </Screen>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <GroupLabel>{label}</GroupLabel>
      <Card padded={false} style={styles.groupCard}>
        {children}
      </Card>
    </View>
  );
}

function RowIcon({ icon, tone }: { icon: IconName; tone: Tone }) {
  return <IconChip icon={icon} tone={tone} size={36} iconSize={18} />;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
    gap: spacing[4],
  },
  account: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  accountText: { flex: 1, minWidth: 0, gap: 2 },
  roleBadge: { marginTop: 4 },
  group: { gap: spacing[2] },
  groupCard: { overflow: "hidden" },
  panel: {
    gap: spacing[3],
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 14,
  },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  optionIndent: { width: 36 },
  center: { textAlign: "center", paddingVertical: spacing[2] },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  deviceText: { flex: 1, minWidth: 0, gap: 2 },
  deviceMeta: { fontSize: 12 },
});
