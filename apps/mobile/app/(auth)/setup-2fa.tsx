/**
 * Standalone TOTP enrolment — spec §6.2.
 *
 * Shown to admin + dispatcher accounts that don't yet have a verified
 * TOTP factor. Uses `mfa.enroll()` to get a QR secret, then
 * `mfa.challenge()` + `mfa.verify()` for the 6-digit confirmation.
 */

import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { Button, Card, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function Setup2FA() {
  const supabase = getSupabase();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.badge}>{t("setup2fa.badge")}</Text>
        <Text style={styles.title}>{t("setup2fa.title")}</Text>
        <Text style={styles.lead}>{t("setup2fa.lead")}</Text>

        <Card style={styles.card}>
          <Text style={styles.sectionH}>{t("setup2fa.checklistTitle")}</Text>
          <Step n={1} title={t("setup2fa.step1Title")} body={t("setup2fa.step1Body")} />
          <Step n={2} title={t("setup2fa.step2Title")} body={t("setup2fa.step2Body")} />
          <Step n={3} title={t("setup2fa.step3Title")} body={t("setup2fa.step3Body")} />
        </Card>

        <Card style={styles.card}>
          {qrSvg ? (
            <View style={styles.qrWrap}>
              <SvgXml xml={qrSvg} width={200} height={200} />
            </View>
          ) : (
            <ActivityIndicator color={colors.primary[500]} />
          )}
          {secret ? (
            <View style={styles.secretRow}>
              <Text style={styles.secretLabel}>
                {t("settings.security.secret")}:
              </Text>
              <Text style={styles.secret}>{secret}</Text>
            </View>
          ) : null}
          <Input
            keyboardType="number-pad"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChangeText={setCode}
            style={styles.otp}
          />
          <Button
            label={t("settings.security.verify")}
            onPress={onVerify}
            loading={pending}
            disabled={code.length !== 6}
          />
          <Button
            label={t("settings.security.loginChallengeBack")}
            variant="ghost"
            onPress={() => signOut()}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[5],
    gap: spacing[4],
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.warning[50],
    color: colors.warning[700],
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "700",
    color: colors.secondary[500],
    lineHeight: 32,
  },
  lead: {
    fontSize: typography.size.md,
    color: colors.neutral[600],
    lineHeight: 20,
  },
  card: {
    gap: spacing[3],
  },
  sectionH: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing[2],
  },
  step: {
    flexDirection: "row",
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 12,
  },
  stepTitle: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  stepBody: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  qrWrap: {
    alignItems: "center",
    padding: spacing[3],
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  secretRow: {
    flexDirection: "row",
    gap: spacing[2],
    alignItems: "center",
    flexWrap: "wrap",
  },
  secretLabel: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  secret: {
    fontFamily: "Menlo",
    fontSize: 12,
    color: colors.neutral[700],
  },
  otp: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: "Menlo",
  },
});
