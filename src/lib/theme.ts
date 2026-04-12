/**
 * Design tokens for programmatic use in components.
 * Source: design-references/tokens.ts (canonical)
 *
 * For Tailwind classes, use the CSS custom properties defined in globals.css @theme.
 * This file is for cases where you need token values in JS (e.g., charts, Canvas, dynamic styles).
 */
export { colors, typography, spacing, radii, shadows, motion, breakpoints } from "../../design-references/tokens";

/** Semantic color aliases for common UI patterns */
export const semanticColors = {
  textPrimary: "var(--color-neutral-900)",
  textSecondary: "var(--color-neutral-600)",
  textMuted: "var(--color-neutral-400)",
  surfaceDefault: "var(--color-neutral-50)",
  surfaceCard: "white",
  surfaceBrand: "var(--color-primary-50)",
  borderDefault: "var(--color-neutral-200)",
  borderFocus: "var(--color-primary-500)",
} as const;
