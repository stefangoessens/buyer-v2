/**
 * buyer-v2 Design Tokens — TypeScript Constants
 * PayFit aesthetic in Hosman structural form
 */

export const colors = {
  primary: {
    50: "#EEF0FF",
    100: "#D9DEFF",
    200: "#B3BCFF",
    300: "#8D9AFF",
    400: "#6678FF",
    500: "#3B4FE4",
    600: "#2D3DB5",
    700: "#1F2B86",
    800: "#1B2B65",
    900: "#0F1A42",
  },
  accent: {
    50: "#FFF1EE",
    100: "#FFE0D9",
    200: "#FFC1B3",
    300: "#FFA28D",
    400: "#FF8367",
    500: "#FF6B4A",
    600: "#E5553A",
    700: "#CC3F2B",
    800: "#992F20",
    900: "#661F15",
  },
  success: {
    50: "#ECFDF5",
    100: "#D1FAE5",
    500: "#0FA573",
    700: "#047857",
  },
  warning: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    500: "#F59E0B",
    700: "#B45309",
  },
  error: {
    50: "#FEF2F2",
    100: "#FEE2E2",
    500: "#EF4444",
    700: "#B91C1C",
  },
  gray: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
    950: "#030712",
  },
  surface: {
    background: "#FFFFFF",
    surface: "#F9FAFB",
    raised: "#FFFFFF",
    overlay: "rgba(0, 0, 0, 0.5)",
    brand: "#EEF0FF",
  },
} as const;

export const typography = {
  fontFamily: {
    sans: '"Inter", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
    "6xl": "3.75rem",
    "7xl": "4.5rem",
  },
  fontSizePx: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
    "5xl": 48,
    "6xl": 60,
    "7xl": 72,
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.1,
    snug: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  letterSpacing: {
    tighter: "-0.03em",
    tight: "-0.02em",
    normal: "0em",
    wide: "0.05em",
  },
} as const;

export const spacing = {
  0: "0px",
  0.5: "2px",
  1: "4px",
  1.5: "6px",
  2: "8px",
  2.5: "10px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

export const radii = {
  none: "0px",
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  "2xl": "24px",
  full: "9999px",
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
} as const;

export const motion = {
  duration: {
    fast: "150ms",
    normal: "250ms",
    slow: "400ms",
    page: "600ms",
  },
  easing: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

export const breakpointsPx = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;
