# Component Catalog

Design component patterns harvested from reference sites (PayFit, Hosman, RealAdvisor), mapped to buyer-v2 surfaces.

---

## 1. PasteLinkInput

- **Source**: Hosman hero search bar
- **Purpose**: Primary conversion entry point -- paste a Zillow/Redfin/Realtor.com URL to ingest a property
- **Visual**: Full-width input with subtle border, large placeholder text, paste icon on the left, animated arrow/submit button on the right. Soft shadow on focus. Rounded corners (radius-lg). White surface with brand-surface tinted background behind it.
- **Variants**:
  - `hero` -- oversized for homepage hero, centered with max-width constraint
  - `inline` -- compact for dashboard/deal-room header embedding
  - `loading` -- shimmer state while URL is being parsed
  - `error` -- red border + inline error message for invalid URLs
- **Surfaces**: Homepage hero, buyer dashboard (quick add), deal room header

---

## 2. ScoreBadge

- **Source**: RealAdvisor score pill
- **Purpose**: Display a competitiveness or pricing score as a compact, glanceable badge
- **Visual**: Rounded pill (radius-full) with score number and optional label. Background color maps to score range: success for high, warning for medium, error for low. White text on filled variant, colored text on outlined variant.
- **Variants**:
  - `filled` -- solid background, white text
  - `outlined` -- border + colored text, transparent background
  - `sm` / `md` / `lg` -- size variants
- **Surfaces**: PropertyCard, pricing panel, comps table, deal room sidebar

---

## 3. PropertyCard

- **Source**: Composite (Hosman listing card + RealAdvisor score overlay)
- **Purpose**: Display a property listing with photo, key metrics, and AI score
- **Visual**: Rounded card (radius-lg) with property photo filling the top half. ScoreBadge overlaid on the photo (top-right). Below photo: address (semibold), price (bold, large), beds/baths/sqft row in gray-500 text. Subtle shadow-sm, hover elevates to shadow-md with ease-default transition.
- **Variants**:
  - `default` -- vertical card layout
  - `horizontal` -- side-by-side photo + details (for list view)
  - `compact` -- smaller photo, tighter spacing (for search results grid)
  - `skeleton` -- loading placeholder with shimmer animation
- **Surfaces**: Search results, buyer dashboard (saved properties), deal room property list

---

## 4. TrustBar

- **Source**: Hosman trust strip
- **Purpose**: Social proof strip showing partner logos, stats, and trust signals
- **Visual**: Full-width bar on gray-50 background. Horizontally scrollable on mobile, centered grid on desktop. Each item: logo or icon + stat number (bold) + label (gray-500, sm text). Items separated by subtle vertical dividers (gray-200).
- **Variants**:
  - `logos` -- partner/press logos only
  - `stats` -- numeric stats with labels (e.g., "500+ buyers helped")
  - `combined` -- logos + stats mixed
- **Surfaces**: Homepage (below hero), landing pages

---

## 5. KPICard

- **Source**: PayFit dashboard metric card
- **Purpose**: Display a single KPI metric with trend indicator
- **Visual**: White card (radius-md, shadow-sm) with metric label (gray-500, sm), large metric value (gray-900, 2xl, bold), and trend arrow with percentage change. Trend is color-coded: success for up, error for down. Optional sparkline or mini chart below.
- **Variants**:
  - `default` -- label + value + trend
  - `with-chart` -- includes sparkline below the value
  - `loading` -- skeleton shimmer for all elements
  - `compact` -- tighter padding, no trend indicator
- **Surfaces**: Buyer dashboard, broker console, admin analytics

---

## 6. PricingTable

- **Source**: Hosman pricing page
- **Purpose**: Buyer savings calculator / commission comparison
- **Visual**: Side-by-side comparison cards in a row. Each card (radius-lg, shadow-md): header with plan name, large price/percentage, feature list with check/x icons, CTA button at bottom. Recommended plan highlighted with primary-500 border and "Recommended" badge. Background alternates between white and brand-surface.
- **Variants**:
  - `comparison` -- 2-3 columns side-by-side
  - `calculator` -- single card with interactive slider for home price input
  - `mobile` -- stacked cards, swipeable
- **Surfaces**: Homepage pricing section, standalone pricing page

---

## 7. TimelineStep

- **Source**: PayFit process stepper
- **Purpose**: Visualize deal progress through transaction milestones
- **Visual**: Vertical timeline with connected line segments. Each step: circle indicator (filled for complete, outlined for current, gray for future) + step title (medium weight) + description (gray-500, sm) + optional timestamp. Current step has primary-500 ring pulse animation. Completed steps use success-500 fill with checkmark icon.
- **Variants**:
  - `vertical` -- standard vertical timeline
  - `horizontal` -- horizontal stepper for compact layouts
  - `compact` -- minimal, just circles and labels (no descriptions)
- **Surfaces**: Deal room main view, buyer dashboard deal cards, transaction detail page

---

## 8. EmptyState

- **Source**: PayFit empty state pattern
- **Purpose**: Friendly placeholder when no data exists (no deals, no tours, no saved properties)
- **Visual**: Centered layout with illustrative icon or illustration (gray-300 stroke), heading (gray-800, lg, semibold), description (gray-500, base), and primary CTA button below. Generous vertical spacing (space-8 between elements). Contained within a dashed border (gray-200) rounded box on brand-surface background.
- **Variants**:
  - `page` -- full-page empty state
  - `section` -- inline within a page section
  - `card` -- compact card-sized empty state
- **Surfaces**: Buyer dashboard (no active deals), deal room (no documents), tour schedule (no upcoming tours), search (no results)

---

## 9. LoadingState

- **Source**: PayFit skeleton loaders
- **Purpose**: Skeleton placeholders during data fetching
- **Visual**: Gray-100 animated blocks matching the shape of the content they replace. Shimmer animation sweeps left-to-right using a gradient overlay (gray-100 to gray-200 to gray-100). Rounded to match the component being loaded (radius-md for cards, radius-full for avatars).
- **Variants**:
  - `card` -- PropertyCard skeleton
  - `table-row` -- table row skeleton with cells
  - `text` -- paragraph text lines (varying widths)
  - `avatar` -- circular skeleton
  - `chart` -- chart area placeholder
- **Surfaces**: All data-loading states throughout the application

---

## 10. HeroSection

- **Source**: Hosman homepage hero
- **Purpose**: Homepage hero with headline, subtitle, and PasteLinkInput
- **Visual**: Full-viewport-height section with brand-surface background fading to white. Large headline (5xl on desktop, 3xl on mobile, bold, tight leading, tracking-tight) centered. Subtitle below (lg, gray-600, normal leading). PasteLinkInput centered below subtitle with max-width constraint. Optional floating property card previews flanking the input on desktop (decorative). Subtle gradient orbs or blurred shapes in background for depth.
- **Variants**:
  - `default` -- full hero with all elements
  - `compact` -- shorter height, no decorative elements (for secondary landing pages)
- **Surfaces**: Homepage, campaign landing pages

---

## 11. FeatureGrid

- **Source**: PayFit feature cards section
- **Purpose**: Showcase platform features in a grid layout
- **Visual**: 2x2 or 3-column grid of feature cards. Each card (radius-lg, white surface, shadow-sm): icon in a tinted circle (primary-50 bg, primary-500 icon), title (lg, semibold), description (base, gray-500). Cards have hover state: slight elevation (shadow-md) + icon circle scales up subtly. Section has centered heading above the grid.
- **Variants**:
  - `grid-2` -- 2-column layout (4 features)
  - `grid-3` -- 3-column layout (6 features)
  - `alternating` -- alternating left/right large feature blocks with illustration
- **Surfaces**: Homepage features section, about page, feature detail pages

---

## 12. TestimonialCard

- **Source**: Hosman testimonials section
- **Purpose**: Social proof via buyer testimonials and success stories
- **Visual**: White card (radius-lg, shadow-sm) with quote text (lg, gray-800, italic, snug leading). Below: avatar circle (48px, radius-full), name (medium), role/location (sm, gray-500). Optional star rating row above the quote. Quotation mark decorative element (primary-100, oversized) in top-left corner.
- **Variants**:
  - `default` -- standard card with quote + attribution
  - `featured` -- larger card, primary-50 background, used for hero testimonial
  - `compact` -- inline quote without card chrome, for embedding in other sections
  - `carousel` -- multiple cards in a horizontally scrollable row
- **Surfaces**: Homepage testimonials section, landing pages, deal room (agent reviews)
