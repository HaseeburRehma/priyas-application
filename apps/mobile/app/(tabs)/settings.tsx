/**
 * Settings — currently a minimal signed-in shell showing the caller's
 * identity + a sign-out button. Full 8-section settings port lands in
 * the next mobile turn (My Account first, then Security, Notifications,
 * then the management-only sections behind role gates).
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Chip } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function SettingsTab() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <Text style={styles.sub}>{t("settings.subtitle")}</Text>

        <Card style={styles.card}>
          <View style={styles.rowSpread}>
            <View>
              <Text style={styles.name}>{profile?.fullName ?? "—"}</Text>
              <Text style={styles.role}>{profile?.role ?? "—"}</Text>
            </View>
            {profile?.role && (
              <Chip
                label={
                  profile.role === "admin"
                    ? "MANAGEMENT"
                    : profile.role === "dispatcher"
                      ? "PROJECT MANAGER"
                      : "FIELD STAFF"
                }
                tone={profile.role === "admin" ? "primary" : profile.role === "dispatcher" ? "secondary" : "success"}
              />
            )}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionH}>{t("settings.helpTitle")}</Text>
          <Text style={styles.helpBody}>{t("settings.helpBody")}</Text>
        </Card>

        <View style={{ height: spacing[4] }} />

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
    gap: spacing[4],
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
    marginTop: 2,
    marginBottom: spacing[2],
  },
  card: {
    gap: spacing[2],
  },
  rowSpread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: typography.size.lg,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  role: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
    textTransform: "capitalize",
  },
  sectionH: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing[1],
  },
  helpBody: {
    fontSize: typography.size.md,
    color: colors.neutral[600],
    lineHeight: 20,
  },
});
