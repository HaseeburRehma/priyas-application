/**
 * UI primitives — Button, Card, Chip, Toggle, Input, Loading, Empty.
 *
 * Deliberately minimal: React Native has no `<button>` / `<div>`, so
 * these wrap Pressable + View with sensible defaults that match the
 * web app's `.btn`, `.card`, and chip styles pixel-for-pixel where the
 * platform allows.
 */

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from "react-native";
import { colors, radius, shadow, spacing, typography } from "@/lib/theme";

/* ------------------------------- Button -------------------------------- */

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const bg =
    variant === "primary"
      ? colors.primary[500]
      : variant === "secondary"
        ? colors.secondary[500]
        : variant === "danger"
          ? colors.error[500]
          : colors.white;
  const fg =
    variant === "ghost" ? colors.neutral[700] : colors.white;
  const border =
    variant === "ghost" ? colors.neutral[200] : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/* -------------------------------- Card --------------------------------- */

export function Card({
  children,
  style,
  padded = true,
}: ViewProps & { padded?: boolean }) {
  return (
    <View
      style={[
        styles.card,
        padded && { padding: spacing[5] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* -------------------------------- Chip --------------------------------- */

export function Chip({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: "primary" | "success" | "warning" | "error" | "neutral" | "secondary";
  icon?: React.ReactNode;
}) {
  const toneMap = {
    primary: { bg: colors.primary[50], fg: colors.primary[700] },
    success: { bg: colors.success[50], fg: colors.success[700] },
    warning: { bg: colors.warning[50], fg: colors.warning[700] },
    error: { bg: colors.error[50], fg: colors.error[700] },
    secondary: { bg: colors.secondary[50], fg: colors.secondary[500] },
    neutral: { bg: colors.neutral[100], fg: colors.neutral[600] },
  } as const;
  const t = toneMap[tone];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: t.bg },
      ]}
    >
      {icon}
      <Text style={{ color: t.fg, fontSize: 11, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/* ------------------------------- Toggle -------------------------------- */

export function Toggle({
  on,
  onPress,
  disabled,
}: {
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      style={[
        styles.toggle,
        { backgroundColor: on ? colors.primary[500] : colors.neutral[200] },
      ]}
    >
      <View
        style={[
          styles.toggleKnob,
          { left: on ? 21 : 3 },
        ]}
      />
    </Pressable>
  );
}

/* ------------------------------- Input --------------------------------- */

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.neutral[400]}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

/* --------------------------- Loading + Empty --------------------------- */

export function CenterSpinner() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary[500]} />
    </View>
  );
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
      {action}
    </View>
  );
}

/* -------------------------------- Styles ------------------------------- */

const styles = StyleSheet.create({
  btn: {
    minHeight: 46,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  btnLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    ...shadow.card,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  toggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  toggleKnob: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    fontSize: typography.size.md,
    color: colors.neutral[800],
    backgroundColor: colors.white,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    padding: spacing[8],
    alignItems: "center",
    gap: spacing[3],
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[700],
    textAlign: "center",
  },
  emptySub: {
    fontSize: typography.size.md,
    color: colors.neutral[500],
    textAlign: "center",
    lineHeight: 20,
  },
});
