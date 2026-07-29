/**
 * Login — email + password. On success:
 *   - admin/dispatcher with a verified TOTP factor → gets an MFA
 *     challenge before the session finalises.
 *   - admin/dispatcher without TOTP → the root layout gate redirects
 *     to /setup-2fa after sign-in completes.
 *   - employee → straight through.
 */

import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function LoginScreen() {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoLetter}>P</Text>
            </View>
            <Text style={styles.brandName}>Priya's</Text>
            <Text style={styles.brandTag}>Leistung mit Herz</Text>
          </View>

          {!challengeId ? (
            <>
              <Text style={styles.title}>{t("login.title")}</Text>
              <Text style={styles.subtitle}>{t("login.subtitle")}</Text>

              <View style={styles.form}>
                <Input
                  placeholder={t("login.email")}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <Input
                  placeholder={t("login.password")}
                  secureTextEntry
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                />
                <Button
                  label={t("login.submit")}
                  onPress={onSignIn}
                  loading={pending}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {t("settings.security.loginChallengeTitle")}
              </Text>
              <Text style={styles.subtitle}>
                {t("settings.security.loginChallengeBody")}
              </Text>
              <View style={styles.form}>
                <Input
                  placeholder="••••••"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  style={styles.otp}
                />
                <Button
                  label={t("settings.security.verify")}
                  onPress={onVerifyOtp}
                  loading={pending}
                  disabled={otp.length !== 6}
                />
                <Button
                  label={t("settings.security.loginChallengeBack")}
                  variant="ghost"
                  onPress={() => {
                    setChallengeId(null);
                    setFactorId(null);
                    setOtp("");
                    void supabase.auth.signOut();
                  }}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing[6],
    justifyContent: "center",
  },
  brand: {
    alignItems: "center",
    marginBottom: spacing[8],
    gap: spacing[2],
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: {
    color: colors.white,
    fontSize: 34,
    fontWeight: "800",
  },
  brandName: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  brandTag: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "700",
    color: colors.secondary[500],
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.size.md,
    color: colors.neutral[500],
    marginBottom: spacing[6],
  },
  form: {
    gap: spacing[3],
  },
  otp: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
});
