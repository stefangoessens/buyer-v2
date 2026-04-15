import {
  PiggyBankIcon,
  Settings02Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import type { FAQTheme } from "@/lib/content/types";

/**
 * Editorial metadata for the three public FAQ themes.
 *
 * Centralised here so `FaqAccordionSection`, `FaqThemeJumpNav`, and
 * any future surface that references the theme IA all read the same
 * eyebrow, title, copy, anchor id, and Hugeicons icon. Keeping copy
 * in one module avoids drift between the jump-nav pill labels and
 * the in-page section titles.
 *
 * `introEmphasis` is the longer two-sentence intro used when a theme
 * is rendered with the `emphasis` variant (Theme 3, Protection).
 */

export type FaqThemeMeta = {
  eyebrow: string;
  title: string;
  intro: string;
  introEmphasis?: string;
  anchor: string;
  icon: typeof Settings02Icon;
};

export const FAQ_THEME_META: Record<FAQTheme, FaqThemeMeta> = {
  how_it_works: {
    eyebrow: "Theme 1",
    title: "How it works",
    intro:
      "What buyer-v2 is, how the paste-a-link flow actually runs, and how humans stay in the loop.",
    anchor: "theme-how-it-works",
    icon: Settings02Icon,
  },
  how_you_save: {
    eyebrow: "Theme 2",
    title: "How you save",
    intro:
      "How the fee model, buyer credit, and lender rules combine to put real money back in your pocket.",
    anchor: "theme-how-you-save",
    icon: PiggyBankIcon,
  },
  protection: {
    eyebrow: "Theme 3",
    title: "Protection & peace of mind",
    intro:
      "We're a licensed Florida brokerage. Every contract, disclosure, and cancellation path is the one Florida buyers already know.",
    introEmphasis:
      "We're a licensed Florida brokerage, and every contract, disclosure, and cancellation path is the one Florida buyers already know. The trust story lives here so sceptical buyers can read it before they engage.",
    anchor: "theme-protection",
    icon: Shield01Icon,
  },
};

export const FAQ_THEME_ORDER: readonly FAQTheme[] = [
  "how_it_works",
  "how_you_save",
  "protection",
] as const;
