import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@/lib/theme";

/**
 * Placeholder shell used by the tabs that haven't been fully built yet.
 * Provides the header + centred body copy so the navigation feels
 * complete while follow-up turns fill in the real screens.
 */
export function StubScreen({
  title,
  subtitle,
  body,
}: {
  title: string;
  subtitle: string;
  body: string;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>COMING SOON</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing[4],
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
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[8],
    gap: spacing[3],
  },
  badge: {
    backgroundColor: colors.warning[50],
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.warning[700],
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  body: {
    textAlign: "center",
    color: colors.neutral[500],
    fontSize: typography.size.md,
    lineHeight: 22,
    maxWidth: 320,
  },
});
