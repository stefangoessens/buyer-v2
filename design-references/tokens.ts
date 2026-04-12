/**
 * buyer-v2 Design Tokens — TypeScript Constants
 * All color values extracted via getComputedStyle from live reference sites.
 * PayFit = aesthetic source, Hosman = structural source, RealAdvisor = data patterns
 */

export const brand = {
  primary: "#052D5B",
  primaryLight: "#0F6FDE",
  primaryDark: "#030E1D",
  accent: "#00C4AC",
  accentLight: "#CCF5EF",
  accentDark: "#009B87",
  secondary: "#3A2899",
  secondaryLight: "#FBFAFF",
  secondaryDark: "#21175A",
} as const;

export const colors = {
  primary: {
    50: "#E5F1FF",
    100: "#C7E1FF",
    200: "#78B6FC",
    300: "#4A94E8",
    400: "#0F6FDE",
    500: "#0D62C4",
    600: "#0B5BB8",
    700: "#052D5B",
    800: "#030E1D",
    900: "#030E1D",
  },
  accent: {
    50: "#E6FBF8",
    100: "#CCF5EF",
    200: "#99EBE0",
    300: "#66E1D0",
    400: "#33D4C1",
    500: "#00C4AC",
    600: "#009B87",
    700: "#007A6B",
    800: "#005A4F",
    900: "#003A33",
  },
  success: { 50: "#ECFDF5", 100: "#D1FAE5", 500: "#10BC4C", 700: "#0A8F3A" },
  warning: { 50: "#FFFBEB", 100: "#FEF3C7", 500: "#FFB60A", 700: "#CC9208" },
  error: { 50: "#FEF2F2", 100: "#FEE2E2", 500: "#EF4444", 700: "#B91C1C" },
  info: { 50: "#E5F1FF", 100: "#C7E1FF", 500: "#0F6FDE", 700: "#0B5BB8" },
  neutral: {
    50: "#F8F9FC",
    100: "#F5F6F9",
    200: "#ECEFF4",
    300: "#E0E5EB",
    400: "#626F7E",
    500: "#556272",
    600: "#364153",
    700: "#1E1A37",
    800: "#030E1D",
    900: "#030E1D",
    950: "#030E1D",
  },
  surface: {
    background: "#FFFFFF",
    surface: "#F8F9FC",
    raised: "#FFFFFF",
    tinted: "#E5F1FF",
    dark: "#052D5B",
    overlay: "rgba(0, 0, 0, 0.70)",
  },
} as const;

export const typography = {
  fontFamily: {
    sans: '"Inter", system-ui, -apple-system, sans-serif',
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
    "5xl": "3.25rem",
    "6xl": "3.5rem",
    "7xl": "4.5rem",
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: { tight: 1.1, snug: 1.15, normal: 1.5, relaxed: 1.6 },
  letterSpacing: { tight: "-0.006em", normal: "0em", wide: "0.05em" },
} as const;

export const spacing = {
  0: "0px", 0.5: "2px", 1: "4px", 1.5: "6px", 2: "8px",
  3: "12px", 4: "16px", 5: "20px", 6: "24px", 8: "32px",
  10: "40px", 12: "48px", 16: "64px", 20: "80px", 24: "96px",
} as const;

export const radii = {
  none: "0px", sm: "6px", md: "12px", lg: "16px",
  xl: "24px", "2xl": "32px", full: "9999px",
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
} as const;

export const motion = {
  duration: { fast: "150ms", normal: "250ms", slow: "400ms", page: "600ms" },
  easing: {
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

export const layout = {
  containerMax: "1248px",
  navHeight: "80px",
  heroInputHeight: "68px",
  heroCtaHeight: "64px",
} as const;

export const breakpoints = {
  sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px",
} as const;
