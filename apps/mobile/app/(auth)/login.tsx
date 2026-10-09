/**
 * Login — email + password. On success:
 *   - admin/dispatcher with a verified TOTP factor → gets an MFA
 *     challenge before the session finalises.
 *   - admin/dispatcher without TOTP → the root layout gate redirects
 *     to /setup-2fa after sign-in completes.
 *   - employee → straight through.
 *
 * Layout follows Figma frames "01 Login" (navy→green hero + white
 * sheet) and "26 2FA" (white screen, shield chip, six code boxes).
 */

import { useRef, useState } from "react";
import {
  Alert,
  Image,
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
import Constants from "expo-constants";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Button, Icon, IconChip, InputField, Notice, Txt } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function LoginScreen() {
  const supabase = getSupabase();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

  async function onSignIn() {
    if (!email.trim() || !password) {
      Alert.alert(t("login.missingFields"));
      return;
    }
    setPending(true);
    const { error, data } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setPending(false);
      Alert.alert(t("login.failed"), error.message);
      return;
    }

    // Check for TOTP factors — if a verified one exists, we owe a
    // challenge before the session is fully authorised. The AAL
    // upgrade happens via mfa.challenge() → mfa.verify().
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
    if (totp) {
      const ch = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (ch.error || !ch.data) {
        setPending(false);
        Alert.alert(t("login.failed"), ch.error?.message ?? "mfa error");
        return;
      }
      setChallengeId(ch.data.id);
      setFactorId(totp.id);
      setPending(false);
      return;
    }

    // No TOTP factor — the AuthGate will route based on role.
    setPending(false);
    // Session is already live via onAuthStateChange in AuthProvider.
    void data;
  }

  async function onVerifyOtp() {
    if (!factorId || !challengeId || otp.length !== 6) return;
    setPending(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: otp,
    });
    setPending(false);
    if (error) {
      Alert.alert(t("login.wrongCode"), error.message);
      return;
    }
    // Root AuthGate will route to /(tabs).
  }

  function onUseOtherAccount() {
    setChallengeId(null);
    setFactorId(null);
    setOtp("");
    void supabase.auth.signOut();
  }

  /* ----------------------------- 2FA step ----------------------------- */
  if (challengeId) {
    return (
      <View style={[styles.white, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.mfaContent, { paddingBottom: insets.bottom + spacing[6] }]}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={onUseOtherAccount}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.backLink}
            >
              <Icon name="chevron-left" size={16} color={colors.primary[600]} strokeWidth={2.5} />
              <Txt v="subheadStrong" color={colors.primary[600]}>
                {t("auth.mfaCancel")}
              </Txt>
            </Pressable>

            <View style={styles.mfaBody}>
              <IconChip icon="shield" tone="brand" size={72} iconSize={30} />
              <View style={{ gap: spacing[2] }}>
                <Txt v="title">{t("settings.security.loginChallengeTitle")}</Txt>
                <Txt v="body" color={colors.neutral[500]}>
                  {t("settings.security.loginChallengeBody")}
                </Txt>
              </View>

              <CodeBoxes value={otp} onChange={setOtp} />

              <Button
                label={t("settings.security.verify")}
                icon="check"
                onPress={onVerifyOtp}
                loading={pending}
                disabled={otp.length !== 6}
              />

              <Notice tone="neutral" icon="clock">
                {t("mobile.ui.auth.codeHint")}
              </Notice>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  /* ---------------------------- Sign-in step --------------------------- */
  const version = Constants.expoConfig?.version;

  return (
    <View style={styles.white}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.white}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          overScrollMode="never"
        >
          {/* Hero — diagonal navy → green gradient behind the copy. */}
          <View style={[styles.hero, { paddingTop: insets.top + spacing[4] }]}>
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="loginHero" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#0B2D40" />
                  <Stop offset="0.55" stopColor="#16587C" />
                  <Stop offset="1" stopColor="#487030" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#loginHero)" />
            </Svg>

            {/* Wordmark ships white-on-transparent (110×44, already
             *  includes "PRIYA'S" + "Leistung mit Herz"). */}
            <Image
              source={require("../../assets/logo-wordmark.png")}
              style={styles.wordmark}
              resizeMode="contain"
              accessibilityLabel={t("common.appName")}
            />

            <View style={styles.heroCopy}>
              <Txt v="overline" color={colors.primary[300]}>
                {t("auth.heroEyebrow")}
              </Txt>
              <Txt v="display" color={colors.white}>
                {t("mobile.ui.auth.heroTitle")}
              </Txt>
              <Txt v="callout" color="rgba(255,255,255,0.85)" style={styles.heroBody}>
                {t("mobile.ui.auth.heroBody")}
              </Txt>
            </View>
          </View>

          {/* White sheet with the form. */}
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[3] }]}>
            <View style={{ gap: 6 }}>
              <Txt v="title">{t("login.title")}</Txt>
              <Txt v="subhead" color={colors.neutral[500]}>
                {t("mobile.ui.auth.signInSubtitle")}
              </Txt>
            </View>

            <View style={styles.form}>
              <InputField
                label={t("login.email")}
                icon="mail"
                placeholder={t("auth.emailPlaceholder")}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                value={email}
                onChangeText={setEmail}
                focused={focused === "email"}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused((f) => (f === "email" ? null : f))}
              />
              <InputField
                label={t("login.password")}
                icon="lock"
                placeholder={t("mobile.ui.auth.passwordPlaceholder")}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={onSignIn}
                returnKeyType="go"
                focused={focused === "password"}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused((f) => (f === "password" ? null : f))}
                right={
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword
                        ? t("mobile.ui.auth.hidePassword")
                        : t("mobile.ui.auth.showPassword")
                    }
                  >
                    <Icon
                      name={showPassword ? "eye-off" : "eye"}
                      size={20}
                      color={colors.neutral[500]}
                    />
                  </Pressable>
                }
              />
              <Button
                label={t("login.submit")}
                icon="arrow-right"
                onPress={onSignIn}
                loading={pending}
              />
              <Notice tone="brand" style={styles.protectedNotice}>
                <View style={styles.protectedRow}>
                  <Icon name="shield" size={16} color={colors.primary[700]} />
                  <Txt v="caption" color={colors.primary[700]}>
                    {t("mobile.ui.auth.protected2fa")}
                  </Txt>
                </View>
              </Notice>
            </View>

            <View style={styles.footer}>
              <Txt v="caption" color={colors.neutral[600]} style={styles.center}>
                {t("mobile.ui.auth.trouble")}
              </Txt>
              <Txt v="caption" color={colors.neutral[400]} style={styles.center}>
                {version
                  ? `${t("mobile.ui.auth.version", { version })} · ${t("common.appName")}`
                  : t("common.appName")}
              </Txt>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Six one-digit boxes backed by a single hidden TextInput, so paste and
 * iOS one-time-code autofill keep working. Tapping any box focuses it.
 */
function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  const digits = value.split("");
  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      accessibilityRole="none"
      style={styles.codeRow}
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const d = digits[i];
        const active = focused && i === Math.min(value.length, 5) && value.length < 6;
        return (
          <View
            key={i}
            style={[
              styles.codeBox,
              d ? styles.codeBoxFilled : null,
              active ? styles.codeBoxActive : null,
            ]}
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
        autoFocus
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

  /* Sign-in */
  hero: {
    paddingHorizontal: spacing[6],
    // 28 visible + 24 hidden under the sheet's rounded top.
    paddingBottom: 28 + spacing[6],
    overflow: "hidden",
  },
  wordmark: { width: 120, height: 48, tintColor: colors.white },
  heroCopy: { marginTop: 56, gap: spacing[2] },
  heroBody: { marginTop: 4 },
  sheet: {
    flexGrow: 1,
    marginTop: -spacing[6],
    paddingTop: 28,
    paddingHorizontal: spacing[6],
    borderTopLeftRadius: radius["2xl"],
    borderTopRightRadius: radius["2xl"],
    backgroundColor: colors.white,
    gap: spacing[5],
  },
  form: { gap: spacing[5] },
  protectedNotice: { justifyContent: "center", paddingVertical: 12, marginTop: -spacing[2] },
  protectedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  footer: { marginTop: "auto", paddingTop: spacing[6], gap: 6 },

  /* 2FA */
  mfaContent: { flexGrow: 1, paddingHorizontal: spacing[6] },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: spacing[3],
  },
  mfaBody: { marginTop: spacing[10], gap: spacing[6] },
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
