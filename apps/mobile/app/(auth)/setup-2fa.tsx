/**
 * Standalone TOTP enrolment — spec §6.2.
 *
 * Shown to admin + dispatcher accounts that don't yet have a verified
 * TOTP factor. Uses `mfa.enroll()` to get a QR secret, then
 * `mfa.challenge()` + `mfa.verify()` for the 6-digit confirmation.
 *
 * Visual language matches the login 2FA step (Figma frame "26 2FA"):
 * white screen, shield chip, six code boxes, primary confirm button.
 */

import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SvgXml } from "react-native-svg";
import {
  Badge,
  Button,
  Card,
  Divider,
  GroupLabel,
  Icon,
  IconChip,
  Notice,
  Txt,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function Setup2FA() {
  const supabase = getSupabase();
  const insets = useSafeAreaInsets();
  const { refreshProfile, signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Priya's mobile",
      });
      if (error || !data) {
        Alert.alert(t("settings.security.wrongCode"), error?.message ?? "");
        return;
      }
      setFactorId(data.id);
      setQrSvg((data.totp.qr_code as unknown as string) ?? "");
      setSecret(data.totp.secret);
    })();
  }, [supabase]);

  async function onVerify() {
    if (!factorId || code.length !== 6) return;
    setPending(true);
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error || !ch.data) {
      setPending(false);
      Alert.alert(t("settings.security.wrongCode"), ch.error?.message ?? "");
      return;
    }
    const v = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.data.id,
      code,
    });
    setPending(false);
    if (v.error) {
      Alert.alert(t("settings.security.wrongCode"), v.error.message);
      return;
    }
    await refreshProfile();
  }

  return (
    <View style={[styles.white, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing[6] }]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => signOut()}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.backLink}
          >
            <Icon name="chevron-left" size={16} color={colors.primary[600]} strokeWidth={2.5} />
            <Txt v="subheadStrong" color={colors.primary[600]}>
              {t("auth.mfaCancel")}
            </Txt>
          </Pressable>

          <View style={styles.intro}>
            <IconChip icon="shield" tone="brand" size={72} iconSize={30} />
            <View style={{ gap: spacing[2] }}>
              <Badge label={t("setup2fa.badge")} tone="warning" />
              <Txt v="title">{t("setup2fa.title")}</Txt>
              <Txt v="body" color={colors.neutral[500]}>
                {t("setup2fa.lead")}
              </Txt>
            </View>
          </View>

          <Card style={{ gap: spacing[3] }}>
            <GroupLabel>{t("setup2fa.checklistTitle")}</GroupLabel>
            <Step n={1} title={t("setup2fa.step1Title")} body={t("setup2fa.step1Body")} />
            <Divider />
            <Step n={2} title={t("setup2fa.step2Title")} body={t("setup2fa.step2Body")} />
            <Divider />
            <Step n={3} title={t("setup2fa.step3Title")} body={t("setup2fa.step3Body")} />
          </Card>

          <Card style={styles.qrCard}>
            <Txt v="subhead" color={colors.neutral[500]} style={styles.center}>
              {t("settings.security.scanCode")}
            </Txt>
            <View style={styles.qrWrap}>
              {qrSvg ? (
                <SvgXml xml={qrSvg} width={200} height={200} />
              ) : (
                <ActivityIndicator color={colors.primary[500]} />
              )}
            </View>
            {secret ? (
              <View style={styles.secretBox}>
                <Txt v="overline" color={colors.neutral[500]}>
                  {t("settings.security.secret")}
                </Txt>
                <Txt v="mono" color={colors.neutral[800]} selectable style={styles.center}>
                  {secret}
                </Txt>
              </View>
            ) : null}
          </Card>

          <View style={{ gap: spacing[3] }}>
            <Txt v="callout" color={colors.neutral[700]}>
              {t("settings.security.verifyTitle")}
            </Txt>
            <CodeBoxes value={code} onChange={setCode} />
          </View>

          <Button
            label={t("settings.security.verify")}
            icon="check"
            onPress={onVerify}
            loading={pending}
            disabled={code.length !== 6}
          />

          <Notice tone="neutral" icon="clock">
            {t("mobile.ui.auth.codeHint")}
          </Notice>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Txt v="caption" color={colors.white}>
          {String(n)}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="subheadStrong">{title}</Txt>
        <Txt v="subhead" color={colors.neutral[500]}>
          {body}
        </Txt>
      </View>
    </View>
  );
}

/**
 * Six one-digit boxes backed by a single hidden TextInput (paste and
 * one-time-code autofill keep working). Tapping any box focuses it.
 */
function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityRole="none" style={styles.codeRow}>
      {Array.from({ length: 6 }).map((_, i) => {
        const d = digits[i];
        const active = focused && i === Math.min(value.length, 5) && value.length < 6;
        return (
          <View
            key={i}
            style={[styles.codeBox, d ? styles.codeBoxFilled : null, active ? styles.codeBoxActive : null]}
          >
            {d ? (
              <Txt v="title" color={colors.neutral[900]}>
                {d}
              </Txt>
            ) : active ? (
              <View style={styles.caret} />
            ) : null}
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        accessibilityLabel={t("auth.mfaCodeLabel")}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  white: { flex: 1, backgroundColor: colors.white },
  center: { textAlign: "center" },
  container: { paddingHorizontal: spacing[6], gap: spacing[5] },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: spacing[3],
  },
  intro: { marginTop: spacing[4], gap: spacing[5] },
  step: { flexDirection: "row", gap: spacing[3] },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  qrCard: { gap: spacing[4], alignItems: "stretch" },
  qrWrap: {
    alignSelf: "center",
    minHeight: 200,
    minWidth: 200,
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  secretBox: {
    gap: 4,
    alignItems: "center",
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.neutral[50],
  },
  codeRow: { flexDirection: "row", gap: spacing[2] },
  codeBox: {
    flex: 1,
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxFilled: { backgroundColor: colors.neutral[50] },
  codeBoxActive: { borderWidth: 2, borderColor: colors.primary[500], backgroundColor: colors.white },
  caret: { width: 2, height: 24, borderRadius: 1, backgroundColor: colors.primary[500] },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
