/**
 * Design tokens for the mobile app.
 *
 * Mirrors the web app's Tailwind palette (see `tailwind.config.ts` in the
 * root Next.js project) so the two apps look like siblings. Numbers are
 * the same 50 → 900 stops, values are hex.
 *
 * Consumed by every component either directly (`colors.primary[500]`)
 * or via the `useTheme()` hook that returns the same object plus a
 * derived light/dark mode. Dark mode is intentionally deferred — the
 * web app doesn't ship it yet and shipping only-mobile dark mode would
 * create visual drift.
 */

export const colors = {
  primary: {
    50: "#F1F7EB",
    100: "#E1EEDB",
    200: "#C4DDB6",
    300: "#A8CC87",
    400: "#8CBB6E",
    500: "#72A94F",
    600: "#588843",
    700: "#3F6631",
    800: "#294420",
    900: "#152210",
  },
  secondary: {
    50: "#EEF4F8",
    100: "#D2E1EC",
    500: "#16587C",
    600: "#124862",
    700: "#0D3648",
  },
  tertiary: {
    100: "#FDFFFB",
    200: "#F6FAF3",
    300: "#EDF3E6",
  },
  neutral: {
    50: "#F8FAF7",
    100: "#EEF1EA",
    200: "#DFE4DA",
    300: "#BDC5B4",
    400: "#8B9483",
    500: "#5F675A",
    600: "#454B41",
    700: "#2E322C",
    800: "#1D201B",
    900: "#0E0F0D",
  },
  success: {
    50: "#EBF7EE",
    500: "#4BAF63",
    700: "#2E7A45",
  },
  warning: {
    50: "#FFF6E5",
    300: "#F5C46B",
    500: "#F4A261",
    700: "#B26319",
  },
  error: {
    50: "#FDECEC",
    100: "#F9D6D6",
    500: "#C74848",
    700: "#8B2A2A",
  },
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

export const typography = {
  // Native iOS uses "System" (SF Pro) automatically; on Android RN maps
  // "System" to Roboto. Custom brand font can be added later via
  // expo-font — until then System keeps rendering fast and safe.
  fontFamily: {
    regular: undefined, // system
    medium: undefined,
    semibold: undefined,
    bold: undefined,
  },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
  size: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 16,
    xl: 20,
    "2xl": 24,
    "3xl": 28,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;

export const shadow = {
  // React Native has no cross-platform shadow syntax — iOS uses shadow*,
  // Android uses elevation. This object bundles both so components can
  // spread it into their style prop.
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  raised: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
};

export const theme: Theme = {
  colors,
  spacing,
  radius,
  typography,
  shadow,
};
