# buyer-v2 Design System

Canonical design language for the buyer-v2 platform. Every authenticated surface — deal room, dashboards, broker console — derives from this document. Marketing surfaces remain on the legacy PayFit/Hosman tokens until they are migrated.

---

## 1. North Star

> **shadcn preset `b2D0wqNxS` (radix-luma) with brand-tinted primary.**

The canonical baseline for every authenticated surface is the shadcn radix-luma preset, installed from `https://ui.shadcn.com/create?preset=b2D0wqNxS&item=preview`. The preset ships a coherent set of tokens, primitives, motion keyframes, and an icon library (HugeIcons) that we adopt wholesale. The only override is a brand tint applied to `--primary`, `--sidebar-primary`, and `--ring` so that every shadcn button, link, focus ring, and sidebar accent picks up the PayFit blue `#0F6FDE` without disturbing the rest of the palette.

This direction was mandated by **KIN-770**. It replaces the previous "PayFit aesthetic in Hosman structural form" custom-palette approach, which is now demoted to marketing-only / historical reference.

The result: a platform whose authenticated surfaces inherit the polish of the shadcn radix-luma preset — generous rounding, translucent menus, subtle active states — while the brand blue keeps the identity consistent with the legacy marketing site.

---

## 2. Reference Hierarchy

| Source | Role | What We Take | What We Skip |
|---|---|---|---|
| **shadcn preset `b2D0wqNxS` (radix-luma)** | **Canonical baseline — single source of truth for authenticated surfaces.** | Everything: color tokens (`oklch()`), variants, sizing, radii scale, shadow model, motion (`tw-animate-css` + accordion keyframes from `shadcn/tailwind.css`), icon library (HugeIcons), menu translucency, data-attribute icon slots, active-state translate pattern, outlined destructive variant. | Nothing. |
| **PayFit** | **Historical inspiration for brand blue `#0F6FDE`.** Still authoritative for legacy marketing surfaces. | The specific PayFit blue tint, shifted into `--primary`, `--sidebar-primary`, and `--ring` as `oklch(0.56 0.18 247)` (ring uses `oklch(0.66 0.16 247)`). The legacy `--color-primary-*` scale remains in `@theme {}` for marketing pages. | Custom PayFit scales for neutrals and accents outside the brand blue, pay-slip UI patterns, enterprise pricing tier layouts, HR/payroll content patterns. |
| **Hosman** | **Historical inspiration for marketing page architecture.** Does not apply to authenticated surfaces. | Hero → trust strip → CTA sequencing on marketing routes only. | Any application to dashboards, deal room, or broker console. |
| **RealAdvisor** | **Optional reference for data-viz patterns** on metrics-heavy surfaces. Still tier-3. | Numeric score pill conventions, comparison table conventions. | Agent directory, multi-language navigation. |

---

## 3. Color Tokens

### 3.1 Canonical layer (shadcn preset, `oklch()` space)

Defined in `:root {}` and `.dark {}` in `src/app/globals.css`. Exposed to Tailwind through the `@theme inline {}` block so utilities like `bg-primary`, `text-foreground`, `border-border`, `bg-sidebar-accent` resolve to these values. **All new code must use this layer.**

| Token | Light value | Role |
|---|---|---|
| `--background` | `oklch(1 0 0)` | App background |
| `--foreground` | `oklch(0.145 0 0)` | Default text |
| `--card` | `oklch(1 0 0)` | Card surface |
| `--card-foreground` | `oklch(0.145 0 0)` | Text on card |
| `--popover` | `oklch(1 0 0)` | Popover, dropdown, tooltip surface |
| `--popover-foreground` | `oklch(0.145 0 0)` | Text on popover |
| `--primary` | `oklch(0.56 0.18 247)` *(brand override)* | CTAs, primary buttons, link accents, active sidebar nav |
| `--primary-foreground` | `oklch(0.985 0 0)` | Text/icons on primary surfaces |
| `--secondary` | `oklch(0.967 0.001 286.375)` | Secondary buttons, subtle chips |
| `--secondary-foreground` | `oklch(0.21 0.006 285.885)` | Text on secondary |
| `--muted` | `oklch(0.97 0 0)` | Muted panels, disabled surfaces |
| `--muted-foreground` | `oklch(0.556 0 0)` | Helper text, captions, placeholder |
| `--accent` | `oklch(0.97 0 0)` | Hover/accent wash on interactive items |
| `--accent-foreground` | `oklch(0.205 0 0)` | Text on accent |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Error text, outlined destructive border |
| `--border` | `oklch(0.922 0 0)` | Default component border |
| `--input` | `oklch(0.922 0 0)` | Input stroke / data-empty background |
| `--ring` | `oklch(0.66 0.16 247)` *(brand override)* | Focus ring |
| `--sidebar` | `oklch(0.985 0 0)` | Sidebar surface |
| `--sidebar-foreground` | `oklch(0.145 0 0)` | Sidebar default text |
| `--sidebar-primary` | `oklch(0.56 0.18 247)` *(brand override)* | Active nav item background |
| `--sidebar-primary-foreground` | `oklch(0.985 0 0)` | Active nav item text |
| `--sidebar-accent` | `oklch(0.97 0 0)` | Sidebar hover / selected row wash |
| `--sidebar-accent-foreground` | `oklch(0.205 0 0)` | Text on sidebar accent |
| `--sidebar-border` | `oklch(0.922 0 0)` | Sidebar divider |
| `--sidebar-ring` | `oklch(0.66 0.16 247)` *(brand override)* | Focus ring inside sidebar |
| `--chart-1` | `oklch(0.845 0.143 164.978)` | Data viz series 1 |
| `--chart-2` | `oklch(0.696 0.17 162.48)` | Series 2 |
| `--chart-3` | `oklch(0.596 0.145 163.225)` | Series 3 |
| `--chart-4` | `oklch(0.508 0.118 165.612)` | Series 4 |
| `--chart-5` | `oklch(0.432 0.095 166.913)` | Series 5 |

Dark mode values live in `.dark { ... }` alongside `:root`. The `.dark` class is available via `@custom-variant dark (&:is(.dark *));` but is not wired up to a theme toggle yet — all surfaces currently render in light mode.

### 3.2 Brand override

The preset's neutral primary is replaced with PayFit blue. Only three variables change from the stock preset:

```css
:root {
  --primary: oklch(0.56 0.18 247);       /* #0F6FDE PayFit blue */
  --sidebar-primary: oklch(0.56 0.18 247);
  --ring: oklch(0.66 0.16 247);          /* lighter blue for focus */
  --sidebar-ring: oklch(0.66 0.16 247);
}
```

Every other preset color is untouched. This gives us one centralized handle for brand intensity without forking the preset.

### 3.3 Legacy layer (preserved for backwards compatibility)

The `@theme {}` block in `src/app/globals.css` still defines the extracted PayFit/Hosman scales:

- `--color-primary-{50..900}` — PayFit blue ramp
- `--color-accent-{50..900}` — Hosman teal ramp
- `--color-neutral-{50..950}` — PayFit gray ramp
- `--color-success-*`, `--color-warning-*`, `--color-error-*`, `--color-info-*` — semantic ramps

These remain in place because **1066 existing Tailwind class usages** (`bg-primary-500`, `text-neutral-800`, `border-accent-400`, etc.) across marketing pages, auth screens, and legacy components depend on them. Removing the scale would break compilation for marketing routes.

**Rule:** new code must not reach for `bg-primary-500` or similar scale utilities. Use shadcn-layer utilities (`bg-primary`, `text-foreground`, `border-border`, `bg-sidebar-accent`) instead. Legacy utilities are allowed only when editing within existing legacy files that are not yet scheduled for migration.

---

## 4. Typography

### 4.1 Font stack

The preset uses **Geist** as the sans default, loaded via `next/font/google` in `src/app/layout.tsx` and applied as `font-sans` on the root element. `--font-sans` is exposed through `@theme inline {}` so Tailwind's `font-sans` resolves to Geist.

| Role | Font | Loader |
|---|---|---|
| **Sans (default)** | `Geist` | `next/font/google` in `src/app/layout.tsx` |
| **Heading** | `Geist` (via `--font-heading` → `--font-sans`) | same |
| **Mono** | `JetBrains Mono` | `next/font/google` in `src/app/fonts.ts` |

Hybrid loader setup: Geist drives `font-sans` via the preset's `@theme inline` override, which takes precedence over the legacy `@theme { --font-sans: var(--font-inter) }` declaration in `globals.css`. `Inter` is still loaded in `src/app/fonts.ts` but is effectively unused after the preset override — scheduled for removal in a follow-up. `JetBrains Mono` stays as the canonical monospace font, exposed via the legacy `--font-mono → var(--font-jetbrains-mono)` binding.

### 4.2 Type scale

The preset does **not** redefine the Tailwind type scale. The default `text-xs` through `text-7xl` utilities continue to work, and component composition relies on them unchanged.

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

### 4.3 Weights and tracking

Standard Tailwind weights (`font-regular` 400, `font-medium` 500, `font-semibold` 600, `font-bold` 700). Headings get `tracking-tight` + `font-semibold` by default via `@layer base`:

```css
@layer base {
  h1, h2, h3, h4, h5, h6 {
    @apply tracking-tight font-semibold;
  }
}
```

---

## 5. Radii

The preset redefines the radii scale as multiples of a single `--radius` variable (`0.625rem` = 10px), providing a generous upper end that is central to the radix-luma identity:

| Token | Expression | Approx value |
|---|---|---|
| `--radius` | `0.625rem` | 10px |
| `--radius-sm` | `calc(var(--radius) * 0.6)` | 6px |
| `--radius-md` | `calc(var(--radius) * 0.8)` | 8px |
| `--radius-lg` | `var(--radius)` | 10px |
| `--radius-xl` | `calc(var(--radius) * 1.4)` | 14px |
| `--radius-2xl` | `calc(var(--radius) * 1.8)` | 18px |
| `--radius-3xl` | `calc(var(--radius) * 2.2)` | 22px |
| `--radius-4xl` | `calc(var(--radius) * 2.6)` | 26px |

**radix-luma cards use `rounded-4xl`.** Generous rounding is part of the visual identity — don't tone it down to `rounded-lg` on a whim. The preset ships card primitives with `rounded-4xl` and expects other surfaces to echo that cadence.

---

## 6. Shadows & Elevation

Shadow tokens are unchanged from the legacy set. Preserved because the preset's default shadow utilities are compatible with these values and the existing elevation pattern is well-understood:

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Inputs, subtle lift |
| `--shadow-md` | `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)` | Cards, dropdowns |
| `--shadow-lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)` | Modals, popovers, floating panels |
| `--shadow-xl` | `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)` | Full-page overlays, hero feature cards |

Elevation usage:

- **Resting**: `shadow-sm` or none
- **Interactive hover**: `shadow-md`
- **Floating**: `shadow-lg`
- **Modal**: `shadow-xl`

---

## 7. Motion

### 7.1 Keyframe utilities

The preset imports two CSS sources that make motion available without extra configuration:

```css
@import "tw-animate-css";
@import "shadcn/tailwind.css";
```

- **`tw-animate-css`** provides keyframe utilities (`animate-in`, `animate-out`, `fade-in`, `slide-in-from-*`, `zoom-in`, etc.) used by shadcn primitives for enter/exit transitions.
- **`shadcn/tailwind.css`** ships the accordion keyframes (`accordion-down`, `accordion-up`) that radix accordion primitives depend on.

Because these are imported globally, any shadcn primitive that expects them (Dialog, Sheet, Popover, Tooltip, Accordion, Collapsible) will animate correctly out of the box.

### 7.2 Duration and easing tokens

| Token | Value | Usage |
|---|---|---|
| `--duration-fast` | `150ms` | Hover states, color changes, opacity |
| `--duration-normal` | `250ms` | Expand/collapse, slide, scale |
| `--duration-slow` | `400ms` | Page transitions |
| `--duration-page` | `600ms` | Full page/section reveals |
| `--ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default transitions |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entrances |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Interactive feedback |

### 7.3 Accessibility

A `prefers-reduced-motion` block in `globals.css` neutralizes animation duration and transitions for users who opt out:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 8. Components

Canonical primitives come from shadcn preset `b2D0wqNxS`, installed under `src/components/ui/`. The radix-luma style means: `rounded-4xl` on card shells, `bg-clip-padding` on interactive surfaces, `translate-y-px` on active states, outlined (not filled) destructive variant, and data-attribute icon slots for composing icon + label in buttons.

### 8.1 Installed primitives

Each file lives at `src/components/ui/<name>.tsx` and is driven by the shadcn variables listed above.

| Primitive | Variants | Sizes | Notes |
|---|---|---|---|
| **Badge** | `default`, `secondary`, `outline`, `destructive` | n/a | Radix-luma pill with data-attribute icon slot. Destructive is outlined. |
| **Button** | `default`, `outline`, `secondary`, `ghost`, `destructive`, `link` | `default`, `xs`, `sm`, `lg`, `icon` | Active state applies `translate-y-px`. Destructive is outlined, not filled. Icon slot via `[&_svg]:size-4` data attributes. |
| **Card** | single shell + `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` | n/a | `rounded-4xl`, `bg-clip-padding`, subtle border from `--border`. Central container for dashboard surfaces. |
| **Input** | single | single | Uses `--input` for background in data-empty state, `--ring` for focus, destructive border when `aria-invalid`. |

### 8.2 To-add primitives

The following shadcn primitives are expected additions as authenticated surfaces are built out. They all compose against the tokens in §3:

| Primitive | Purpose | Where it will land |
|---|---|---|
| **Sidebar** | Replace hand-rolled `AppSidebar` with the shadcn sidebar primitive — uses `--sidebar`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-ring`. | Deal room + buyer dashboard |
| **Breadcrumb** | Route breadcrumbs for nested dashboard surfaces. | Deal room, property detail |
| **Separator** | Horizontal/vertical dividers (thin rule using `--border`). | Card sections, sidebar groups |
| **Dropdown-menu** | Radix-powered menu with translucent surface (`menuColor: "default-translucent"`, `menuAccent: "subtle"`). | Top nav, row actions, user menu |
| **Dialog** | Modal surfaces (reports, confirmations, onboarding steps). | Any destructive or multi-step flow |
| **Sheet** | Side panel for filters, details, comparisons. | Property compare, broker actions |
| **Tooltip** | Hover affordances for icon-only buttons. | Sidebar collapsed state, data-dense rows |
| **Skeleton** | Loading placeholders matching the primitive shapes. | Any async surface |
| **Toast** | Transient feedback (`sonner` is the preset default). | CRUD confirmations, errors |
| **Tabs** | Horizontal tab navigation. | Deal room analysis panels |
| **Avatar** | User/agent profile image with fallback. | Nav, agent cards |
| **Accordion** | Collapsible sections (uses the accordion keyframes from §7.1). | FAQ-like panels, legacy migrations |
| **Table** | Data tables with sortable headers. | Broker console, comps view |
| **Select** | Form select built on radix `Select`. | Forms, filters |
| **Checkbox / Radio / Switch** | Form controls. | Forms, settings |

When adding a primitive, run `pnpm dlx shadcn@latest add <name>` against the same preset so the file picks up radix-luma styling automatically.

### 8.3 Icon library

`iconLibrary` in `components.json` is set to `hugeicons`. All new icon usage should pull from `@hugeicons/react` or the preset-provided slot pattern. `lucide-react` has zero usages in the codebase, so the swap is free. If an existing legacy component imports lucide, migrate it when you touch that file — don't leave a half-migrated module.

### 8.4 Legacy custom components

The following hand-rolled components still exist and still work:

- `src/components/dealroom/AppSidebar.tsx`
- `src/components/dealroom/BuyerDashboardClient.tsx`
- `src/components/dealroom/PasteLinkCTA.tsx`
- `src/components/dealroom/ScoreBadge.tsx`
- Other `src/components/dealroom/*`

These are classified as **legacy custom components**. They coexist with the shadcn primitives and are scheduled to be rebuilt on top of shadcn sidebar/card/badge/button primitives as follow-up work. Until then they may continue to use the legacy `@theme` scale (`bg-primary-500`, `text-neutral-800`, etc.). Do not build *new* surfaces on these components.

---

## 9. Surface Mapping

| Surface | Styling basis | Migration posture |
|---|---|---|
| **Marketing routes** (`/`, `/pricing`, `/how-it-works`, etc.) | Legacy PayFit/Hosman tokens via `@theme {}` scales. Geist font still applies (loaded globally). | **Out of scope for preset adoption.** No planned rewrite. Stays on legacy tokens indefinitely. |
| **Sign-in / sign-up** | Legacy custom components on the legacy token layer. | Migrate to shadcn `Card` + `Input` + `Button` as a follow-up card. Small scope, should be an early migration target. |
| **Authenticated app surfaces** — buyer dashboard, favourites, profile, compare, reports | **Canonical target of the shadcn preset.** New code uses shadcn `Card`, `Button`, `Input`, `Badge`, and the to-add primitives from §8.2. The custom `AppSidebar` still provides the left nav. | Active — all new work lands here on the shadcn layer. Replace the custom sidebar when the shadcn sidebar primitive lands. |
| **Property detail** (`/property/[propertyId]`) | Mixed — uses some custom components, some direct Tailwind composition. Header, metrics, analysis tabs are candidates for shadcn `Card` + `Tabs`. | Incremental migration. Convert one component per touch until the page is fully on shadcn primitives. |
| **Deal room** | Hand-rolled `src/components/dealroom/*` on the legacy layer. | Migrate to shadcn sidebar + card when the sidebar primitive lands. Until then, additive work is fine on the existing components — don't rebuild wholesale. |
| **Broker console** (future) | Should be built on shadcn primitives from day one. | Greenfield; no legacy baggage. |

---

## 10. Migration Posture

New code uses the shadcn preset tokens (`bg-primary`, `text-foreground`, `bg-card`, `border-border`, etc.) and shadcn primitives. Existing code keeps working through the preserved legacy `@theme` scales — no flag day, no big-bang rewrite.

Migration rules:

1. **Greenfield surfaces** — shadcn primitives and preset tokens only.
2. **Touching a legacy file** — if the touch is small (bug fix, content tweak), leave the tokens alone. If the touch is a component refactor, migrate the component to the shadcn layer in the same PR.
3. **Marketing pages** — explicitly **out of scope**. Do not migrate marketing routes to shadcn tokens. They stay on the legacy `--color-primary-*` / `--color-neutral-*` scales until a dedicated marketing redesign card is scheduled.
4. **Dark mode** — the `.dark` class and token values exist but are not wired to a toggle. Don't build UI that assumes dark mode is available yet.

---

## 11. Coverage Rationale

This document covers the shadcn preset baseline + brand overrides: color tokens, typography, radii, shadows, motion, primitive inventory, surface mapping, and migration posture. It is the single source of truth for *which tokens and primitives a new surface should use*.

Anything beyond — specific route compositions, feature UX flows, content strategy, copy, empty-state illustrations — lives in the originating Linear issue or the route's own README. Legacy marketing-style tokens are documented inline in `src/app/globals.css` alongside the shadcn layer, so a developer editing a legacy file can see both ramps in one place.

For questions about the preset itself (variant implementations, data-attribute slot patterns, component internals), the preset preview is authoritative: `https://ui.shadcn.com/create?preset=b2D0wqNxS&item=preview`. For the ticket that mandated this adoption, see **KIN-770**.
