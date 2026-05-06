import type { Config } from "tailwindcss";

/**
 * Theme is bound to CSS variables defined in src/app/globals.css so the same
 * tokens used in the HTML prototypes drive Tailwind utilities. Changing a
 * value in globals.css automatically updates every Tailwind class that
 * references it. See `:root` in globals.css for the source of truth.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "var(--font-noto-tamil)",
          "Noto Sans Tamil",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        tamil: ["var(--font-noto-tamil)", "Noto Sans Tamil", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        primary: {
          50: "var(--primary-50)",
          100: "var(--primary-100)",
          200: "var(--primary-200)",
          300: "var(--primary-300)",
          500: "var(--primary-500)",
          600: "var(--primary-600)",
          700: "var(--primary-700)",
          800: "var(--primary-800)",
        },
        secondary: {
          50: "var(--secondary-50)",
          100: "var(--secondary-100)",
          500: "var(--secondary-500)",
          600: "var(--secondary-600)",
          700: "var(--secondary-700)",
          800: "var(--secondary-800)",
          900: "var(--secondary-900)",
        },
        accent: {
          100: "var(--accent-100)",
          300: "var(--accent-300)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
        },
        tertiary: {
          200: "var(--tertiary-200)",
        },
        success: {
          50: "var(--success-50)",
          500: "var(--success-500)",
          700: "var(--success-700)",
        },
        warning: {
          50: "var(--warning-50)",
          500: "var(--warning-500)",
          700: "var(--warning-700)",
        },
        error: {
          50: "var(--error-50)",
          100: "var(--error-100)",
          500: "var(--error-500)",
          700: "var(--error-700)",
        },
        info: {
          50: "var(--info-50)",
          500: "var(--info-500)",
        },
        neutral: {
          50: "var(--neutral-50)",
          100: "var(--neutral-100)",
          200: "var(--neutral-200)",
          300: "var(--neutral-300)",
          400: "var(--neutral-400)",
          500: "var(--neutral-500)",
          600: "var(--neutral-600)",
          700: "var(--neutral-700)",
          800: "var(--neutral-800)",
          900: "var(--neutral-900)",
        },
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "var(--shadow-focus)",
      },
      fontSize: {
        // Default Tailwind scale is fine; the prototype uses arbitrary
        // values like 11px/13px which we'll keep as tracked custom sizes.
        "11": ["11px", { lineHeight: "1.4" }],
        "13": ["13px", { lineHeight: "1.5" }],
      },
      letterSpacing: {
        tightish: "-0.005em",
        tighter2: "-0.01em",
        tightest: "-0.02em",
      },
      transitionTimingFunction: {
        "ease-soft": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
