/**
 * Design tokens for the mobile app.
 *
 * SOURCE OF TRUTH — Figma "Priya Cleaning - Design System" frame
 * (fileKey fhyfId0zOZTy3bvgGtDrSk, node 4009:279, v1.0 March 2026).
 * The web app's `src/app/globals.css` uses the exact same hex values so
 * the two apps look like siblings. Colours + radii below are copied
 * from the Figma DS 1:1.
 *
 * Consumed by every component either directly (`colors.primary[500]`)
 * or via the `useTheme()` hook that returns the same object plus a
 * derived light/dark mode. Dark mode is intentionally deferred — the
 * web app doesn't ship it yet and shipping only-mobile dark mode would
 * create visual drift.
 *
 * Naming choice: `spacing` keeps its existing pixel-value keys
 * (spacing[3] = 12 px, spacing[4] = 16 px, …) rather than adopting
 * Figma's 8-grid slot numbering (space-3 = 16 px, space-4 = 24 px, …)
 * because a rename would touch every mobile component for a value
 * change users will not perceive on a phone. The four-place variants
 * (12/20) that aren't strict 8-grid multiples are kept as small
 * adjustments — the web app's Tailwind config uses the same fudge.
 */

export const colors = {
  // Primary — Brand Green (Figma 50 → 900)
  primary: {
    50: "#EEF5E8",
    100: "#D9E9C8",
    200: "#BFDAA4",
    300: "#A4CA7F",
    400: "#8BBB65",
    500: "#72A94F",
    600: "#5D8E3F",
    700: "#487030",
    800: "#345321",
    900: "#213715",
  },
  // Secondary — Navy Blue (Figma 50 → 900)
  secondary: {
    50: "#E5EEF3",
    100: "#BFD4E0",
    200: "#95B6CA",
    300: "#6A97B4",
    400: "#407AA0",
    500: "#16587C",
    600: "#124A68",
    700: "#0F3C54",
    800: "#0B2D40",
    900: "#081F2C",
  },
  // Accent — Green Mid (Figma 50 → 900)
  accent: {
    50: "#F2F8EB",
    100: "#E1EECF",
    200: "#CFE4B3",
    300: "#BED999",
    400: "#B3D292",
    500: "#A8CC87",
    600: "#8BB06B",
    700: "#6F9052",
    800: "#54713B",
    900: "#3A5227",
  },
  // Tertiary — Light Green background (Figma: single tone at "200")
  tertiary: {
    100: "#FDFFFB",
    200: "#F2FFEA",
    300: "#EAF7DC",
  },
  // Neutrals — Figma's warm green-tinted ramp
  neutral: {
    50: "#F8FAF7",
    100: "#EEF2EC",
    200: "#DDE3DA",
    300: "#C3CCBE",
    400: "#9DA898",
    500: "#78857A",
    600: "#5A6659",
    700: "#414B40",
    800: "#272E27",
    900: "#141814",
  },
  // Semantic — matches Figma exactly
  success: {
    50: "#E8F7EF",
    500: "#2D9E6B",
    700: "#1F6E4A",
  },
  warning: {
    50: "#FDEFE5",
    300: "#F5C46B",
    500: "#F4A261",
    700: "#B36F3A",
  },
  error: {
    50: "#FCE7E9",
    100: "#FBD4D7",
    500: "#E63946",
    700: "#A32933",
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

// Border radius — Figma DS scale exactly (xs=4, sm=6, md=8, lg=12, xl=16, 2xl=24, full=pill)
export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 24,
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
    extrabold: "800" as const,
  },
  // Sizes — the numeric keys (xs / sm / base / md / lg / xl / 2xl / 3xl)
  // are legacy and used throughout the mobile app; the Figma-named
  // semantic keys (caption / body / h3 / h2 / h1 / display) are new and
  // let new components author against the DS spec directly.
  size: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 16,
    xl: 20,
    "2xl": 24,
    "3xl": 28,
    // Figma semantic scale
    caption: 12,
    body: 14,
    h3: 16,
    h2: 20,
    h1: 24,
    display: 40,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.5, // Figma Body = 14/21 → 21/14 = 1.5
    display: 1.1, // Figma Display = 40/44
  },
} as const;

export const shadow = {
  // React Native has no cross-platform shadow syntax — iOS uses shadow*,
  // Android uses elevation. This object bundles both so components can
  // spread it into their style prop. Colours tuned to the warm neutral
  // (rgba 20,24,20) so shadows sit in the same colour family as the
  // rest of the DS.
  xs: {
    shadowColor: "#141814",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  card: {
    shadowColor: "#141814",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  raised: {
    shadowColor: "#141814",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  overlay: {
    shadowColor: "#141814",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
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
