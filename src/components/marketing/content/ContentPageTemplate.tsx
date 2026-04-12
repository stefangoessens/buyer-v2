import type { ReactNode } from "react";
import type { ContentPageMeta } from "@/lib/content/types";

/**
 * Shared page wrapper for every public content surface
 * (pricing / FAQ / legal / brokerage disclosures).
 *
 * The template owns the hero layout, eyebrow label, page title, and
 * description. Route pages compose it with section-level renderers
 * (FAQSection, LegalDocumentTemplate, PricingSections, etc.) so
 * content updates flow through one place.
 */
export function ContentPageTemplate({
  meta,
  heroSuffix,
  children,
}: {
  meta: ContentPageMeta;
  /**
   * Optional extra content rendered inside the hero under the
   * description (e.g. the "Last updated" stamp for legal docs).
   */
  heroSuffix?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {/* Hero */}
      <section className="w-full bg-gradient-to-br from-primary-800 to-primary-900 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-[1048px] px-6">
          {meta.eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-200">
              {meta.eyebrow}
            </p>
          )}
          <h1 className="mt-3 text-4xl font-bold tracking-tight lg:text-5xl">
            {meta.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-primary-100">
            {meta.description}
          </p>
          {heroSuffix && <div className="mt-4">{heroSuffix}</div>}
        </div>
      </section>

      {/* Body */}
      <section className="w-full bg-neutral-50 py-12 lg:py-16">
        <div className="mx-auto max-w-[1048px] px-6">
          <div className="mx-auto max-w-3xl">{children}</div>
        </div>
      </section>
    </>
  );
}

/**
 * Error state rendered when content validation fails. Shown on
 * dev/preview builds so content misconfigurations are loud — prod
 * builds should catch these at build time via test coverage.
 */
export function ContentValidationError({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-2xl border-2 border-error-400 bg-error-50 p-6">
      <h2 className="text-lg font-semibold text-error-700">
        Content configuration error
      </h2>
      <p className="mt-2 text-sm text-error-700">
        The following content items are missing or empty:
      </p>
      <ul className="mt-3 list-disc pl-5 text-sm text-error-700">
        {missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
