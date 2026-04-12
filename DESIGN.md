# buyer-v2 Design System

Canonical design language for the buyer-v2 platform. Every UI surface — marketing site, deal room, dashboards, broker console, iOS app — derives from this document.

---

## 1. North Star

> **PayFit aesthetic in Hosman structural form.**

This means two things working in concert:

**PayFit supplies the visual identity.** Deep blues that convey trust, warm coral accents that invite action, generous whitespace, crisp geometric typography (Inter), smooth micro-interactions, and polished component surfaces (cards with subtle shadows, rounded inputs, pill badges). The overall feeling is modern European SaaS — professional without being corporate, friendly without being juvenile.

**Hosman supplies the page architecture.** Full-width hero sections with a prominent search/input CTA, scrolling trust strips with logos and stats, structured calculator and pricing sections, testimonial blocks, and conversion-oriented layout sequencing (hook → credibility → value prop → proof → CTA). Every public page follows Hosman's proven real estate marketing cadence.

**RealAdvisor supplements with data patterns.** Score badges (e.g., 9.4/10 pills), comparison tables, agent matching cards, and data visualization conventions for metrics-heavy surfaces like the deal room and broker console.

The result: a platform that *looks* like the best SaaS tools in Europe and *flows* like the best real estate marketing sites.

---

## 2. Reference Hierarchy

| Source | What We Take | What We Skip |
|---|---|---|
| **PayFit** | Color palette (deep blue + coral), typography (Inter, geometric sans), spacing system (generous), component polish (cards, buttons, inputs, badges), motion language (subtle, purposeful), illustration tone (friendly, minimal), empty state patterns | HR/payroll domain content, pricing tiers layout, enterprise feature comparison grids |
| **Hosman** | Page architecture (hero → trust → features → CTA), hero with prominent input, calculator/pricing section placement, trust bar pattern, testimonial layout, section sequencing, conversion flow, information architecture | French-specific real estate content, agent matching directory, city-specific landing page templates |
| **RealAdvisor** | Score badge component (numeric pill), data visualization patterns, comparison table layout, metric cards, property data display conventions | Agent directory layout, Swiss market specifics, multi-language navigation patterns |

---

## 3. Color Palette

### Brand Colors

| Token | Value | Usage |
|---|---|---|
| `brand-primary` | `#1B2B65` | Primary UI surfaces, headings, nav, trust |
| `brand-primary-light` | `#2A3F8F` | Hover states, secondary surfaces |
| `brand-primary-dark` | `#111D45` | Deep backgrounds, footer |
| `brand-accent` | `#FF6B4A` | CTAs, action buttons, highlights, warmth |
| `brand-accent-light` | `#FF8A70` | Hover on accent, soft emphasis |
| `brand-accent-dark` | `#E85535` | Active/pressed state on accent |
| `brand-secondary` | `#0FA573` | Success states, positive metrics, confirmations |
| `brand-secondary-light` | `#34C791` | Lighter success surfaces |
| `brand-secondary-dark` | `#0B7D57` | Dark success emphasis |

### Neutrals (Cool Gray)

| Token | Value |
|---|---|
| `neutral-50` | `#F8FAFC` |
| `neutral-100` | `#F1F5F9` |
| `neutral-200` | `#E2E8F0` |
| `neutral-300` | `#CBD5E1` |
| `neutral-400` | `#94A3B8` |
| `neutral-500` | `#64748B` |
| `neutral-600` | `#475569` |
| `neutral-700` | `#334155` |
| `neutral-800` | `#1E293B` |
| `neutral-900` | `#0F172A` |
| `neutral-950` | `#020617` |

### Semantic Colors

| Token | Value | Usage |
|---|---|---|
| `success` | `#0FA573` | Positive outcomes, confirmations |
| `success-light` | `#ECFDF5` | Success backgrounds |
| `warning` | `#F59E0B` | Caution, pending states |
| `warning-light` | `#FFFBEB` | Warning backgrounds |
| `error` | `#EF4444` | Errors, destructive actions |
| `error-light` | `#FEF2F2` | Error backgrounds |
| `info` | `#3B82F6` | Informational, links, help |
| `info-light` | `#EFF6FF` | Info backgrounds |

### Surface Colors

| Token | Value | Usage |
|---|---|---|
| `surface-white` | `#FFFFFF` | Card backgrounds, modals |
| `surface-subtle` | `#F8FAFC` | Page background, alternating sections |
| `surface-muted` | `#F1F5F9` | Disabled surfaces, secondary panels |
| `surface-tinted` | `#EEF2FF` | Brand-tinted background (hero, feature sections) |
| `surface-dark` | `#1B2B65` | Dark sections (footer, dark hero variant) |
| `surface-overlay` | `rgba(15, 23, 42, 0.6)` | Modal/dialog backdrop |

---

## 4. Typography

### Font Stack

| Role | Font | Fallback |
|---|---|---|
| **Display / Headings** | `Inter` | `system-ui, -apple-system, sans-serif` |
| **Body** | `Inter` | `system-ui, -apple-system, sans-serif` |
| **Monospace** | `JetBrains Mono` | `ui-monospace, 'Cascadia Code', monospace` |

Load via `next/font/google` for automatic optimization:

```tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
```

### Type Scale

| Token | Size | Line Height | Usage |
|---|---|---|---|
| `text-xs` | 12px | 1.5 | Captions, fine print, badges |
| `text-sm` | 14px | 1.5 | Secondary text, table cells, helper text |
| `text-base` | 16px | 1.5 | Body text (default) |
| `text-lg` | 18px | 1.5 | Lead paragraphs, emphasized body |
| `text-xl` | 20px | 1.35 | Card headings, section subheads |
| `text-2xl` | 24px | 1.3 | Section headings |
| `text-3xl` | 30px | 1.25 | Page titles |
| `text-4xl` | 36px | 1.2 | Hero subheadings |
| `text-5xl` | 48px | 1.15 | Hero headings |
| `text-6xl` | 60px | 1.1 | Display (marketing hero, large) |
| `text-7xl` | 72px | 1.1 | Display (max, used sparingly) |

### Font Weights

| Token | Weight | Usage |
|---|---|---|
| `font-regular` | 400 | Body text, descriptions |
| `font-medium` | 500 | Labels, nav items, emphasis |
| `font-semibold` | 600 | Subheadings, buttons, card titles |
| `font-bold` | 700 | Hero headings, display text, strong emphasis |

### Letter Spacing

| Token | Value | Usage |
|---|---|---|
| `tracking-tight` | `-0.02em` | Headings (text-2xl and above) |
| `tracking-normal` | `0` | Body text |
| `tracking-wide` | `0.05em` | All-caps labels, overlines |

---

## 5. Spacing

Base unit: **4px**. All spacing values are multiples of 4.

| Token | Value | Usage |
|---|---|---|
| `space-0` | 0px | Reset |
| `space-1` | 4px | Tight internal padding (badge, tag) |
| `space-2` | 8px | Icon-to-text gap, inline spacing |
| `space-3` | 12px | Input padding, compact card padding |
| `space-4` | 16px | Standard padding, form gaps |
| `space-5` | 20px | Card padding, button padding-x |
| `space-6` | 24px | Gutter (min), section-internal spacing |
| `space-8` | 32px | Gutter (standard), card-to-card gap |
| `space-10` | 40px | Large component spacing |
| `space-12` | 48px | Section padding (compact) |
| `space-16` | 64px | Section padding (standard) |
| `space-20` | 80px | Section padding (generous) |
| `space-24` | 96px | Section padding (max) |

### Layout Constants

| Constant | Value |
|---|---|
| Container max-width | `1280px` |
| Container padding-x | `24px` (mobile), `32px` (tablet+) |
| Section padding-y | `64px` (mobile), `80px` (tablet), `96px` (desktop) |
| Grid gutter | `24px` (mobile), `32px` (desktop) |
| Sidebar width | `260px` (collapsed: `64px`) |
| Top nav height | `64px` |

---

## 6. Border Radii

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | `6px` | Inputs, badges, small tags |
| `radius-md` | `8px` | Cards, dropdowns, tooltips |
| `radius-lg` | `12px` | Modals, panels, large cards |
| `radius-xl` | `16px` | Hero cards, featured CTAs, promo banners |
| `radius-full` | `9999px` | Pills, avatars, circular buttons |

---

## 7. Elevation / Shadows

| Token | Value | Usage |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Inputs, subtle lift |
| `shadow-md` | `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)` | Cards, dropdowns |
| `shadow-lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)` | Modals, popovers, floating panels |
| `shadow-xl` | `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)` | Full-page overlays, hero feature cards |
| `shadow-inner` | `inset 0 2px 4px rgba(0, 0, 0, 0.05)` | Pressed inputs, inset surfaces |
| `shadow-none` | `none` | Reset |

### Elevation Usage Pattern

- **Resting**: `shadow-sm` or none (most components)
- **Interactive hover**: `shadow-md` (cards, buttons)
- **Floating**: `shadow-lg` (dropdowns, popovers, tooltips)
- **Modal**: `shadow-xl` (dialogs, full overlays)

---

## 8. Motion

### Duration

| Token | Value | Usage |
|---|---|---|
| `duration-fast` | `150ms` | Hover states, color changes, opacity |
| `duration-normal` | `250ms` | Expand/collapse, slide, scale |
| `duration-slow` | `400ms` | Page transitions, complex animations |
| `duration-page` | `600ms` | Full page/section reveals, hero entrance |

### Easing

| Token | Value | Usage |
|---|---|---|
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Elements entering view, exits |
| `ease-in-out` | `cubic-bezier(0.45, 0, 0.55, 1)` | State transitions, transforms |
| `ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Interactive feedback, bouncy press |

### Animation Rules

1. **Purposeful only** — animation must communicate state change or guide attention. No decorative animation.
2. **Respect `prefers-reduced-motion`** — wrap all animations in a `@media (prefers-reduced-motion: no-preference)` check or use Tailwind's `motion-safe:` variant.
3. **Entrance pattern** — fade-up (translate-y 8px + opacity 0 → 0 + 1) at `duration-normal` with `ease-out`. Stagger siblings by 50ms.
4. **Hover pattern** — shadow lift + subtle scale (1.01-1.02) at `duration-fast`.
5. **Loading pattern** — skeleton pulse with neutral-200 → neutral-100 gradient sweep at `duration-slow` in a loop.

---

## 9. Surface Mapping

How design patterns map to buyer-v2 surfaces:

| Surface | Primary Reference | Layout Pattern | Key Components |
|---|---|---|---|
| **Public homepage** | Hosman hero + PayFit polish | Full-width hero → trust strip → feature cards → calculator teaser → testimonials → CTA | `PasteLinkInput`, `TrustBar`, `FeatureCard`, `TestimonialCard` |
| **Pricing / FAQ** | Hosman structure + PayFit tables | Section-based vertical scroll: hero → pricing table → FAQ accordion → CTA | `PricingTable`, `AccordionFAQ`, `ComparisonRow` |
| **Savings calculator** | Hosman placement + PayFit inputs | Two-column: controls (sliders, inputs) left, results (cards, chart) right | `SliderInput`, `ResultCard`, `SavingsChart` |
| **Deal room** | RealAdvisor data + PayFit cards | Dashboard grid: property header → score panel → analysis tabs → timeline | `ScoreBadge`, `PropertyCard`, `AnalysisPanel`, `TimelineStep` |
| **Buyer dashboard** | PayFit SaaS dashboard | Left sidebar nav + main content area with card grid | `NavSidebar`, `DealCard`, `TaskList`, `KPICard` |
| **Broker console** | PayFit ops + shadcn data tables | Left sidebar nav + table/detail split view | `DataTable`, `QueueCard`, `KPICard`, `StatusBadge` |
| **Onboarding flow** | PayFit onboarding stepper | Centered card with progress stepper, one question per step | `StepIndicator`, `QuestionCard`, `ProgressBar` |
| **Auth screens** | PayFit minimal | Centered card on tinted background, logo + form | `AuthCard`, `SocialLoginButton` |

---

## 10. Component Patterns

Key reusable components derived from the reference sites. Each component lists its source inspiration, visual characteristics, and buyer-v2 adaptation.

### PasteLinkInput
- **Source**: Hosman hero search bar, adapted for URL paste
- **Visual**: Large input (48-56px height), rounded-xl, prominent placeholder, brand-accent submit button, subtle shadow-md
- **Behavior**: Paste or type a Zillow/Redfin/Realtor.com URL; validates on paste; animates to loading state
- **Surface**: Public homepage hero

### ScoreBadge
- **Source**: RealAdvisor score pills (e.g., "9.4" / "7.4")
- **Visual**: Rounded-full pill, bold numeric value, color-coded background (green/amber/red based on score), compact (28-32px height)
- **Variants**: `positive` (green), `neutral` (amber), `negative` (red), `info` (blue)
- **Surface**: Deal room, property cards, analysis panels

### PropertyCard
- **Source**: Hosman property listing + RealAdvisor metrics
- **Visual**: radius-md card with photo (aspect-video), score badge overlay, address, key metrics row (price, beds, baths, sqft), subtle shadow-md on hover
- **Surface**: Buyer dashboard, deal room, search results

### TrustBar
- **Source**: Hosman trust strip
- **Visual**: Full-width, neutral-50 background, horizontally scrolling or evenly spaced partner logos, optional stats ("500+ buyers served", "$2M+ saved")
- **Surface**: Public homepage, below hero

### KPICard
- **Source**: PayFit dashboard metric cards
- **Visual**: radius-md card, large numeric value (text-3xl, font-bold), label below (text-sm, neutral-500), optional trend indicator (up/down arrow + percentage), optional sparkline
- **Surface**: Buyer dashboard, broker console

### TimelineStep
- **Source**: PayFit process stepper
- **Visual**: Vertical timeline with circle indicators (brand-primary filled for complete, accent for current, neutral-300 for future), connecting line, step label + description
- **Variants**: `completed`, `current`, `upcoming`
- **Surface**: Deal room timeline, onboarding flow

### FeatureCard
- **Source**: PayFit feature sections
- **Visual**: radius-lg card, icon (40px, brand-primary tint), heading (text-xl, font-semibold), description (text-base, neutral-600), optional link
- **Surface**: Public homepage feature sections

### AccordionFAQ
- **Source**: Hosman FAQ section
- **Visual**: Clean accordion with neutral-200 dividers, smooth expand/collapse (duration-normal), chevron rotation, generous padding
- **Surface**: Pricing/FAQ page

### EmptyState
- **Source**: PayFit empty states
- **Visual**: Centered layout, friendly illustration (minimal line art style, brand-primary + accent colors), heading, description, primary CTA button
- **Surface**: Any list/dashboard with no data

### LoadingState
- **Source**: PayFit skeleton loaders
- **Visual**: Skeleton shapes matching the component they replace (rounded rects for text, circles for avatars, aspect-video rects for images), pulse animation with neutral-200/neutral-100 gradient
- **Surface**: All async-loaded components

### DataTable
- **Source**: shadcn/ui Table + PayFit styling
- **Visual**: Clean header row (font-medium, neutral-500, text-sm), alternating row backgrounds (white/neutral-50), hover highlight (surface-tinted), sortable column indicators, pagination
- **Surface**: Broker console, admin views

### StatusBadge
- **Source**: PayFit status indicators
- **Visual**: Rounded-full pill, dot indicator + label, color-coded per status
- **Variants**: `active` (green), `pending` (amber), `closed` (neutral), `urgent` (red)
- **Surface**: Dashboards, tables, cards

---

## 11. Adopted vs. Rejected Patterns

### PayFit

| Adopted | Rationale |
|---|---|
| Deep blue + warm accent palette | Conveys trust (real estate) + action (conversion) |
| Inter typeface at all scales | Clean, geometric, excellent readability, free |
| Generous whitespace and section padding | Premium feel, reduces cognitive load |
| Card-based component surfaces with subtle shadows | Consistent containment, clear hierarchy |
| Skeleton loading states | Smooth perceived performance |
| Dashboard sidebar + content layout | Proven SaaS pattern, good for dense data |
| Metric cards with trend indicators | Quick buyer/broker status comprehension |
| Stepper/timeline for multi-step flows | Clear progress indication for long processes |
| Micro-interactions (hover lift, fade-up entrance) | Polish without distraction |
| Empty state with illustration + CTA | Guides users to action vs. blank screen |

| Rejected | Rationale |
|---|---|
| HR/payroll content patterns | Different domain (real estate) |
| Enterprise pricing tier layout | buyer-v2 has a single commission model, not SaaS tiers |
| Complex multi-tab settings UI | Over-engineered for buyer-v2's simpler config needs |
| Illustration-heavy onboarding | buyer-v2 onboarding is URL-paste-first, not tour-based |

### Hosman

| Adopted | Rationale |
|---|---|
| Full-width hero with prominent search/input | URL paste is the primary intent signal — hero input is the #1 conversion surface |
| Trust strip below hero | Social proof is critical in real estate |
| Calculator section in marketing flow | Savings calculator is a core value prop |
| Section-based scroll architecture | Proven real estate marketing cadence |
| Testimonial blocks with photos | Builds trust for high-stakes transactions |
| FAQ accordion in pricing context | Answers objections at the decision point |
| Footer with structured sitemap | SEO + navigation completeness |

| Rejected | Rationale |
|---|---|
| French real estate content patterns | buyer-v2 is Florida-specific |
| Agent matching directory | buyer-v2 has its own broker assignment model |
| City-specific landing page templates | Not needed at launch (FL-first) |
| Hosman's specific color scheme | Replaced by PayFit-derived brand palette |

### RealAdvisor

| Adopted | Rationale |
|---|---|
| Numeric score badge (pill with value) | Perfect for deal room property scoring |
| Data visualization in property context | AI engine outputs need clear visual representation |
| Comparison table layout | Useful for comp analysis in deal room |
| Metric-dense card patterns | Broker console needs information density |

| Rejected | Rationale |
|---|---|
| Agent directory listing layout | buyer-v2 doesn't have a public agent directory |
| Swiss market navigation patterns | Different market |
| Multi-language selector UI | English-only at launch |
| Review/rating collection UI | buyer-v2 doesn't collect public reviews |

---

## 12. Coverage Rationale

### What This Document Covers

This design system covers every visual and structural decision needed to build buyer-v2's UI surfaces:

- **Color**: Full brand palette with primary, accent, secondary, neutrals, semantic, and surface colors — sufficient for all UI states.
- **Typography**: Font family, scale (12-72px), weights, line heights, and letter spacing — covers everything from badge captions to hero display text.
- **Spacing**: 4px-base grid with 15 tokens from 0-96px, plus layout constants (container, gutter, section padding, sidebar, nav height).
- **Shape**: Border radii from 6px (inputs) to 9999px (pills) — 5 tokens covering all component shapes.
- **Elevation**: 6 shadow tokens with clear usage guidance (resting → hover → floating → modal).
- **Motion**: Duration, easing, and animation rules with accessibility compliance (prefers-reduced-motion).
- **Surface mapping**: 8 distinct surfaces mapped to reference sources, layout patterns, and key components.
- **Component patterns**: 12 key components with source attribution, visual specification, and surface assignments.
- **Adopted/rejected patterns**: Explicit decisions for all three reference sites with rationale.

### What Is Intentionally Out of Scope

- **Icon library**: Uses Lucide (configured in `components.json`). No custom icon set needed.
- **Illustration style**: Will be defined when illustration assets are commissioned. Guideline: minimal line art, brand-primary + accent colors, friendly tone (per PayFit).
- **iOS-specific tokens**: SwiftUI adaptations will derive from these tokens but are documented in `ios/DESIGN_IOS.md` when that milestone begins.
- **Dark mode**: Not in scope for launch. The neutral scale and surface tokens are structured to support it later.
- **Print styles**: Not applicable.
- **Email templates**: Separate design concern, will reference brand colors and typography but not component patterns.

### Token Implementation

Design tokens are implemented in two companion files (owned by the token-impl teammate):

- `design-references/tokens.css` — CSS custom properties for all tokens above
- `design-references/tokens.ts` — TypeScript constants mirroring CSS tokens for use in component logic

These files are the single source of truth for token *values*. This document (`DESIGN.md`) is the single source of truth for token *semantics and usage*.
