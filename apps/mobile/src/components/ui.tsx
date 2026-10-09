/**
 * Mobile UI kit — implements the Figma "📱 Mobile App" component set
 * (Priya Cleaning Service · Product). Every screen builds from these so
 * spacing, type and colour stay identical across the app.
 *
 * Legacy exports (Button, Card, Chip, Toggle, Input, CenterSpinner,
 * EmptyState) keep their original props so older call sites still work.
 */

import { type ReactNode } from "react";
import {
  ActivityIndicator,
  type ColorValue,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/icon";
import { colors, fonts, radius, shadow, spacing, text, type TextVariant } from "@/lib/theme";

export { Icon, type IconName };

/* ------------------------------- Tones -------------------------------- */

export type Tone = "brand" | "success" | "warning" | "error" | "info" | "neutral" | "sage";

/** [background, accent, foreground] per tone — Figma Badge / Icon Chip. */
const TONES: Record<Tone, { bg: string; accent: string; fg: string }> = {
  brand: { bg: colors.primary[50], accent: colors.primary[500], fg: colors.primary[700] },
  success: { bg: colors.success[50], accent: colors.success[500], fg: colors.success[700] },
  warning: { bg: colors.warning[50], accent: colors.warning[500], fg: colors.warning[700] },
  error: { bg: colors.error[50], accent: colors.error[500], fg: colors.error[700] },
  info: { bg: colors.secondary[50], accent: colors.secondary[500], fg: colors.secondary[600] },
  neutral: { bg: colors.neutral[100], accent: colors.neutral[400], fg: colors.neutral[600] },
  sage: { bg: colors.accent[100], accent: colors.accent[600], fg: colors.accent[700] },
};
export const tone = (t: Tone) => TONES[t];

/* -------------------------------- Text -------------------------------- */

export function Txt({
  v = "body",
  color = colors.neutral[900],
  style,
  children,
  ...rest
}: TextProps & { v?: TextVariant; color?: ColorValue }) {
  return (
    <Text {...rest} style={[text[v] as object, { color }, style]}>
      {children}
    </Text>
  );
}

/* ------------------------------- Screen ------------------------------- */

/**
 * Page scaffold: safe-area top, light-green canvas, scrollable content
 * with the standard 16px gutter and 16px section gap.
 */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  bg = colors.tertiary[200],
  refreshing,
  onRefresh,
  contentStyle,
  edges = ["top"],
  gap = spacing[4],
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  bg?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  gap?: number;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={edges}>
      {header}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.screenContent, { gap }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary[500]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

/** Tab-root header: large navy title, subtitle, trailing actions. */
export function LargeHeader({
  title,
  subtitle,
  right,
  leading,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <View style={styles.largeHeader}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="display" color={colors.secondary[500]} numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="subhead" color={colors.neutral[500]}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ? <View style={styles.row8}>{right}</View> : null}
    </View>
  );
}

/** Pushed-screen header: round back button, centred title, optional action. */
export function NavHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.navHeader}>
      <RoundButton
        icon="chevron-left"
        accessibilityLabel="Zurück"
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)")))}
      />
      <Txt v="headline" style={styles.navTitle} numberOfLines={1}>
        {title}
      </Txt>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="headline">{title}</Txt>
        {subtitle ? (
          <Txt v="subhead" color={colors.neutral[500]}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Txt v="subheadStrong" color={colors.primary[600]}>
            {actionLabel}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function GroupLabel({ children }: { children: string }) {
  return (
    <Txt v="overline" color={colors.neutral[500]} style={{ paddingHorizontal: 4 }}>
      {children}
    </Txt>
  );
}

/* -------------------------------- Card -------------------------------- */

export function Card({
  children,
  style,
  padded = true,
  elevation = "sm",
  onPress,
}: ViewProps & {
  padded?: boolean;
  elevation?: "sm" | "md" | "none";
  onPress?: () => void;
}) {
  const s = [
    styles.card,
    elevation !== "none" && shadow[elevation],
    padded && { padding: spacing[4] },
    style,
  ];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.9 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

/* ------------------------------- Button ------------------------------- */

type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";

const BUTTONS: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary[500], fg: colors.white },
  secondary: { bg: colors.secondary[500], fg: colors.white },
  outline: { bg: colors.white, fg: colors.neutral[800], border: colors.neutral[200] },
  danger: { bg: colors.error[50], fg: colors.error[700] },
  ghost: { bg: "transparent", fg: colors.primary[700] },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  disabled,
  loading,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "lg" | "md";
  icon?: IconName | ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const b = BUTTONS[variant];
  const lg = size === "lg";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: b.bg,
          borderColor: b.border ?? "transparent",
          minHeight: lg ? 50 : 40,
          paddingHorizontal: lg ? 20 : 16,
          borderRadius: lg ? radius.lg : radius.md,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={b.fg} />
      ) : (
        <>
          {typeof icon === "string" ? (
            <Icon name={icon as IconName} size={lg ? 20 : 18} color={b.fg} />
          ) : (
            icon
          )}
          <Txt v={lg ? "bodyStrong" : "subheadStrong"} color={b.fg} numberOfLines={1}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

/** Circular icon button (header actions, inline call/mail, map route). */
export function RoundButton({
  icon,
  onPress,
  variant = "default",
  size = 40,
  dot,
  accessibilityLabel,
  color,
}: {
  icon: IconName;
  onPress?: () => void;
  variant?: "default" | "primary" | "subtle" | "plain";
  size?: number;
  dot?: boolean;
  accessibilityLabel?: string;
  color?: string;
}) {
  const v = {
    default: { bg: colors.white, fg: colors.neutral[800], border: colors.neutral[100] },
    primary: { bg: colors.primary[500], fg: colors.white, border: "transparent" },
    subtle: { bg: colors.neutral[50], fg: colors.neutral[800], border: "transparent" },
    plain: { bg: "transparent", fg: colors.neutral[800], border: "transparent" },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, backgroundColor: v.bg, borderColor: v.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Icon name={icon} size={size <= 32 ? 16 : 20} color={color ?? v.fg} />
      {dot ? <View style={styles.roundDot} /> : null}
    </Pressable>
  );
}

/* ------------------------------- Badges ------------------------------- */

export function Badge({
  label,
  tone: t = "neutral",
  dot = true,
  style,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = TONES[t];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      {dot ? <View style={[styles.badgeDot, { backgroundColor: c.accent }]} /> : null}
      <Txt v="overline" color={c.fg} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Legacy alias — maps the old Chip tones onto Badge tones. */
export function Chip({
  label,
  tone: t = "neutral",
  icon,
}: {
  label: string;
  tone?: "primary" | "success" | "warning" | "error" | "neutral" | "secondary";
  icon?: ReactNode;
}) {
  const map: Record<string, Tone> = { primary: "brand", secondary: "info" };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {icon}
      <Badge label={label} tone={(map[t] ?? t) as Tone} dot={false} />
    </View>
  );
}

/** Red unread counter (chat, notifications, menu rows). */
export function CountPill({ count, tone: t = "error" }: { count: number | string; tone?: "error" | "brand" }) {
  return (
    <View style={[styles.countPill, { backgroundColor: t === "error" ? colors.error[500] : colors.primary[500] }]}>
      <Txt v="caption" color={colors.white}>
        {String(count)}
      </Txt>
    </View>
  );
}

/* ------------------------------- Avatars ------------------------------ */

export type AvatarTone = "green" | "navy" | "orange" | "red" | "sage";
const AVATARS: Record<AvatarTone, string> = {
  green: colors.primary[500],
  navy: colors.secondary[500],
  orange: colors.warning[500],
  red: colors.error[500],
  sage: colors.accent[600],
};

export function initialsOf(name?: string | null): string {
  if (!name) return "—";
  const parts = name.replace(/[^\p{L}\p{N}\s-]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function toneFor(seed?: string | null): AvatarTone {
  const tones: AvatarTone[] = ["green", "navy", "sage", "orange", "navy", "green"];
  let h = 0;
  for (const ch of seed ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tones[h % tones.length]!;
}

export function Avatar({
  name,
  initials,
  tone: t,
  size = 40,
  ring,
  rounded = "full",
}: {
  name?: string | null;
  initials?: string;
  tone?: AvatarTone;
  size?: number;
  ring?: boolean;
  rounded?: "full" | "lg";
}) {
  const bg = AVATARS[t ?? toneFor(name ?? initials)];
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: rounded === "full" ? size / 2 : radius.lg,
          backgroundColor: bg,
        },
        ring && { borderWidth: 2, borderColor: colors.white },
      ]}
    >
      <Txt
        v={size >= 56 ? "title" : size >= 40 ? "subheadStrong" : "tabLabel"}
        color={colors.white}
      >
        {initials ?? initialsOf(name)}
      </Txt>
    </View>
  );
}

export function AvatarStack({ names, max = 3, size = 32 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <View style={{ flexDirection: "row" }}>
      {shown.map((n, i) => (
        <View key={`${n}-${i}`} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={n} size={size} ring />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.avatar, styles.avatarMore, { width: size, height: size, borderRadius: size / 2 }]}>
          <Txt v="tabLabel" color={colors.neutral[600]}>
            +{extra}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/** Square tinted icon tile — section/list leading visual. */
export function IconChip({
  icon,
  tone: t = "brand",
  size = 36,
  iconSize,
  bg,
  fg,
  rounded = "md",
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
  iconSize?: number;
  bg?: string;
  fg?: string;
  rounded?: "md" | "full";
}) {
  const c = TONES[t];
  const iconColor = fg ?? (t === "brand" ? colors.primary[600] : t === "info" ? colors.secondary[500] : c.fg);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rounded === "full" ? size / 2 : radius.md,
        backgroundColor: bg ?? c.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size / 2)} color={iconColor} />
    </View>
  );
}

/* --------------------------- Filters & tabs --------------------------- */

export function FilterChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number | string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.filterChip, selected ? styles.filterChipOn : styles.filterChipOff]}
    >
      <Txt v="callout" color={selected ? colors.white : colors.neutral[700]}>
        {label}
      </Txt>
      {count != null ? (
        <View style={[styles.filterCount, { backgroundColor: selected ? "rgba(255,255,255,0.25)" : colors.neutral[100] }]}>
          <Txt v="caption" color={selected ? colors.white : colors.neutral[600]}>
            {String(count)}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Horizontally scrolling chip row that bleeds to the screen edge. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing[4], flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: spacing[4], gap: spacing[2] }}
    >
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Txt v={on ? "subheadStrong" : "subhead"} color={on ? colors.neutral[900] : colors.neutral[500]}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Underlined, horizontally scrolling tabs (detail screens). */
export function TabsRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing[4], flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: spacing[4], gap: 20 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ gap: 8, alignItems: "center" }}>
            <View style={styles.row6}>
              <Txt v={on ? "subheadStrong" : "subhead"} color={on ? colors.primary[700] : colors.neutral[500]}>
                {o.label}
              </Txt>
              {o.count != null ? (
                <View style={styles.tabCount}>
                  <Txt v="caption" color={colors.neutral[600]}>
                    {String(o.count)}
                  </Txt>
                </View>
              ) : null}
            </View>
            <View style={[styles.tabUnderline, { backgroundColor: on ? colors.primary[500] : "transparent" }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* -------------------------------- Inputs ------------------------------ */

export function SearchField(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={20} color={colors.neutral[400]} />
      <TextInput
        placeholderTextColor={colors.neutral[400]}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        {...props}
        style={[text.body, { flex: 1, color: colors.neutral[900], paddingVertical: 0 }, props.style]}
      />
    </View>
  );
}

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Txt v="callout" color={colors.neutral[700]}>
      {label}
      {required ? <Txt v="callout" color={colors.error[500]}> *</Txt> : null}
    </Txt>
  );
}

/** Labelled text field (Figma "Input Field"); multiline doubles as textarea. */
export function InputField({
  label,
  required,
  icon,
  right,
  hint,
  error,
  focused,
  ...input
}: TextInputProps & {
  label?: string;
  required?: boolean;
  icon?: IconName;
  right?: ReactNode;
  hint?: string;
  error?: string | null;
  focused?: boolean;
}) {
  const multiline = !!input.multiline;
  return (
    <View style={{ gap: 8 }}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <View
        style={[
          styles.field,
          multiline && { minHeight: 104, alignItems: "flex-start", paddingVertical: 12 },
          (focused || error) && { borderColor: error ? colors.error[500] : colors.primary[500], borderWidth: 1.5 },
        ]}
      >
        {icon ? <Icon name={icon} size={20} color={colors.neutral[400]} /> : null}
        <TextInput
          placeholderTextColor={colors.neutral[400]}
          {...input}
          style={[
            text.body,
            { flex: 1, color: colors.neutral[900], paddingVertical: multiline ? 0 : 12 },
            multiline && { textAlignVertical: "top", minHeight: 80 },
            input.style,
          ]}
        />
        {right}
      </View>
      {error ? (
        <Txt v="caption" color={colors.error[700]}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt v="caption" color={colors.neutral[500]}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** Legacy bare input — restyled to the new field look. */
export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.neutral[400]}
      {...props}
      style={[text.body, styles.legacyInput, props.multiline && { minHeight: 104, textAlignVertical: "top" }, props.style]}
    />
  );
}

/** Tappable picker field (opens a sheet / list). */
export function SelectField({
  label,
  required,
  icon,
  value,
  placeholder,
  onPress,
}: {
  label?: string;
  required?: boolean;
  icon?: IconName;
  value?: string | null;
  placeholder?: string;
  onPress?: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.field, pressed && { opacity: 0.85 }]}>
        {icon ? <Icon name={icon} size={20} color={colors.neutral[400]} /> : null}
        <Txt v="body" color={value ? colors.neutral[900] : colors.neutral[400]} style={{ flex: 1, paddingVertical: 14 }} numberOfLines={1}>
          {value || placeholder || "—"}
        </Txt>
        <Icon name="chevron-down" size={18} color={colors.neutral[500]} />
      </Pressable>
    </View>
  );
}

/** Large selectable option tile (damage category, supplies status). */
export function ChoiceTile({
  label,
  sub,
  icon,
  tone: t = "brand",
  selected,
  onPress,
  style,
}: {
  label: string;
  sub?: string;
  icon: IconName;
  tone?: Tone;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = TONES[t];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.choice,
        selected ? { backgroundColor: c.bg, borderColor: c.accent, borderWidth: 2 } : null,
        style,
      ]}
    >
      <IconChip icon={icon} tone={t} size={34} iconSize={17} bg={selected ? colors.white : undefined} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt v="subheadStrong">{label}</Txt>
        {sub ? (
          <Txt v="caption" color={colors.neutral[500]}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {selected ? (
        <View style={[styles.choiceCheck, { backgroundColor: c.accent }]}>
          <Icon name="check" size={14} color={colors.white} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------- Toggle ------------------------------- */

export function Toggle({ on, onPress, disabled }: { on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      hitSlop={6}
      style={[styles.toggle, { backgroundColor: on ? colors.primary[500] : colors.neutral[200], opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[styles.toggleKnob, { left: on ? 21 : 3 }]} />
    </Pressable>
  );
}

/* ------------------------------ Data bits ----------------------------- */

export function ProgressBar({
  value,
  tone: t = "brand",
  height = 6,
  color,
}: {
  value: number; // 0..1
  tone?: Tone;
  height?: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.neutral[100], overflow: "hidden" }}>
      <View
        style={{
          width: `${pct * 100}%`,
          minWidth: pct > 0 ? height : 0,
          height,
          borderRadius: height / 2,
          backgroundColor: color ?? TONES[t].accent,
        }}
      />
    </View>
  );
}

/** Key / value row (details cards). */
export function KeyValue({
  label,
  value,
  mono,
  valueColor = colors.neutral[900],
  onPress,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  valueColor?: string;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.kv}>
      <Txt v="subhead" color={colors.neutral[500]}>
        {label}
      </Txt>
      {typeof value === "string" || typeof value === "number" ? (
        <Txt v={mono ? "mono" : "subheadStrong"} color={valueColor} style={{ flexShrink: 1, textAlign: "right" }} numberOfLines={2}>
          {String(value)}
        </Txt>
      ) : (
        value
      )}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

/** Day/month tile used in shift and assignment lists. */
export function DateBlock({ day, month, highlight }: { day: string; month: string; highlight?: boolean }) {
  return (
    <View style={[styles.dateBlock, highlight && { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
      <Txt v="headline" color={highlight ? colors.primary[700] : colors.secondary[500]}>
        {day}
      </Txt>
      <Txt v="overline" color={colors.neutral[500]}>
        {month}
      </Txt>
    </View>
  );
}

/** Figma "KPI Card": icon chip, optional trend badge, label, value, sub. */
export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone: t = "brand",
  trend,
  onPress,
  valueColor = colors.secondary[500],
  accent,
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: IconName;
  tone?: Tone;
  trend?: { label: string; tone: Tone; dot?: boolean };
  onPress?: () => void;
  valueColor?: string;
  accent?: "left" | "top";
  style?: StyleProp<ViewStyle>;
}) {
  const c = TONES[t];
  const body = (
    <>
      {icon || trend ? (
        <View style={styles.kpiTop}>
          {icon ? <IconChip icon={icon} tone={t} size={34} iconSize={18} /> : <View />}
          {trend ? <Badge label={trend.label} tone={trend.tone} dot={trend.dot ?? false} /> : null}
        </View>
      ) : null}
      <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="kpi" color={valueColor} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      {sub ? (
        <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
          {sub}
        </Txt>
      ) : null}
    </>
  );
  const s = [
    styles.kpi,
    accent === "left" && { borderLeftWidth: 3, borderLeftColor: c.accent },
    accent === "top" && { borderTopWidth: 3, borderTopColor: c.accent },
    style,
  ];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.9 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={s}>{body}</View>
  );
}

/** Two-column wrapping grid for KPI cards / tiles. */
export function Grid({ children, gap = spacing[3] }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>{children}</View>;
}
/** Style for a half-width cell inside <Grid>. */
export const HALF: ViewStyle = { flexBasis: "47%", flexGrow: 1, minWidth: 0 };

/** Small neutral stat tile (hero cards). */
export function StatTile({
  label,
  value,
  sub,
  valueColor = colors.secondary[500],
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.statTile, style]}>
      <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="headline" color={valueColor} numberOfLines={1}>
        {value}
      </Txt>
      {sub ? (
        <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/** Generic list row: leading visual, title/subtitle, trailing slot. */
export function ListRow({
  title,
  subtitle,
  leading,
  badge,
  trailing,
  chevron = true,
  onPress,
  highlight,
  titleColor = colors.neutral[900],
  subtitleLines = 1,
}: {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  badge?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  highlight?: boolean;
  titleColor?: string;
  subtitleLines?: number;
}) {
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Txt v="bodyStrong" color={titleColor} numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="subhead" color={colors.neutral[500]} numberOfLines={subtitleLines}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {badge}
      {trailing}
      {chevron && onPress ? <Icon name="chevron-right" size={18} color={colors.neutral[400]} /> : null}
    </>
  );
  const s = [styles.listRow, highlight && { backgroundColor: "rgba(238,245,232,0.5)" }];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { backgroundColor: colors.neutral[50] }]}>
      {body}
    </Pressable>
  ) : (
    <View style={s}>{body}</View>
  );
}

/** Tinted inline notice (info / warning / success / error / brand). */
export function Notice({
  tone: t = "info",
  icon,
  children,
  style,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = TONES[t];
  const fg = t === "brand" ? colors.primary[700] : c.fg;
  return (
    <View style={[styles.notice, { backgroundColor: c.bg }, style]}>
      {icon ? <Icon name={icon} size={18} color={t === "info" ? colors.secondary[500] : fg} /> : null}
      <View style={{ flex: 1 }}>
        {typeof children === "string" ? (
          <Txt v="caption" color={fg}>
            {children}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** Sticky footer for form screens (primary action above home indicator). */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>{children}</View>;
}

/* --------------------------- Loading + Empty -------------------------- */

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
  icon = "check",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <View style={styles.empty}>
      <IconChip icon={icon} tone="brand" size={56} iconSize={26} rounded="full" />
      <Txt v="headline" color={colors.neutral[800]} style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {subtitle ? (
        <Txt v="subhead" color={colors.neutral[500]} style={{ textAlign: "center" }}>
          {subtitle}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

/* -------------------------------- Styles ------------------------------ */

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[6] },
  largeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    height: 52,
  },
  navTitle: { flex: 1, textAlign: "center", marginHorizontal: spacing[2] },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  row6: { flexDirection: "row", alignItems: "center", gap: 6 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  divider: { height: 1, backgroundColor: colors.neutral[100] },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2], borderWidth: 1 },
  round: { alignItems: "center", justifyContent: "center", borderRadius: radius.full, borderWidth: 1 },
  roundDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.error[500],
    borderWidth: 2,
    borderColor: colors.white,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 8,
    paddingRight: 9,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  countPill: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, alignItems: "center" },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarMore: { marginLeft: -8, backgroundColor: colors.neutral[100], borderWidth: 2, borderColor: colors.white },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: radius.full,
  },
  filterChipOn: { backgroundColor: colors.primary[500] },
  filterChipOff: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.neutral[200] },
  filterCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full },
  segmented: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
  },
  segment: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 7, borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.white, ...shadow.sm },
  tabCount: { paddingHorizontal: 6, borderRadius: radius.full, backgroundColor: colors.neutral[100] },
  tabUnderline: { height: 2, borderRadius: 1, alignSelf: "stretch" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    backgroundColor: colors.white,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.white,
  },
  legacyInput: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    color: colors.neutral[900],
    backgroundColor: colors.white,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.white,
  },
  choiceCheck: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toggle: { width: 46, height: 28, borderRadius: 14, justifyContent: "center" },
  toggleKnob: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, ...shadow.sm },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingVertical: 10,
  },
  dateBlock: {
    width: 46,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  kpi: {
    gap: 8,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    backgroundColor: colors.white,
    ...shadow.sm,
  },
  kpiTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statTile: {
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[50],
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: 14,
    backgroundColor: "transparent",
  },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: radius.md },
  bottomBar: {
    gap: spacing[2],
    paddingTop: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing[8] },
  empty: { padding: spacing[8], alignItems: "center", gap: spacing[3] },
});

// Re-export fonts for screens that need a raw family (e.g. TextInput).
export { fonts };
