import Link from "next/link";
import type {
  DisclosureModule,
  PricingSection as PricingSectionType,
} from "@/lib/content/types";

/**
 * Renders a vertical stack of PricingSection content blocks with
 * optional bullets and CTA button. Input should already be filtered
 * to public sections.
 */
export function PricingSections({
  sections,
}: {
  sections: readonly PricingSectionType[];
}) {
  return (
    <div className="space-y-6">
      {sections.map((section, idx) => (
        <PricingSectionCard
          key={section.id}
          section={section}
          emphasized={idx === 0}
        />
      ))}
    </div>
  );
}

function PricingSectionCard({
  section,
  emphasized,
}: {
  section: PricingSectionType;
  emphasized?: boolean;
}) {
  const cardClass = emphasized
    ? "rounded-2xl bg-gradient-to-br from-primary-700 to-primary-800 p-6 text-white shadow-lg lg:p-10"
    : "rounded-2xl bg-white p-6 ring-1 ring-neutral-200 lg:p-10";

  const titleClass = emphasized
    ? "text-2xl font-bold text-white lg:text-3xl"
    : "text-xl font-semibold text-neutral-900 lg:text-2xl";

  const bodyClass = emphasized
    ? "mt-3 text-base text-primary-100"
    : "mt-3 text-base text-neutral-700";

  const bulletClass = emphasized
    ? "text-sm text-primary-100"
    : "text-sm text-neutral-700";

  return (
    <section className={cardClass}>
      <h2 className={titleClass}>{section.title}</h2>
      <p className={bodyClass}>{section.body}</p>

      {section.bullets && section.bullets.length > 0 && (
        <ul className="mt-5 space-y-2">
          {section.bullets.map((bullet, i) => (
            <li key={i} className={`flex gap-2 ${bulletClass}`}>
              <span className={emphasized ? "text-primary-300" : "text-primary-500"} aria-hidden>
                ✓
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {section.cta && (
        <div className="mt-6">
          <Link
            href={section.cta.href}
            className={
              emphasized
                ? "inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary-800 transition hover:bg-primary-50"
                : "inline-flex items-center rounded-xl bg-primary-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-800"
            }
          >
            {section.cta.label}
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * Renders a curated list of disclosure modules. Used by the brokerage
 * disclosure page and the pricing page footer. Input should already
 * be filtered to public modules.
 */
export function DisclosureList({
  modules,
}: {
  modules: readonly DisclosureModule[];
}) {
  if (modules.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-neutral-600 ring-1 ring-neutral-200">
        No disclosures available.
      </div>
    );
  }

  return (
    <dl className="space-y-4">
      {modules.map((d) => {
        const severityClass =
          d.severity === "strong"
            ? "border-l-4 border-accent-500 bg-accent-50"
            : d.severity === "emphasis"
              ? "border-l-4 border-primary-500 bg-primary-50/60"
              : "border-l-4 border-neutral-300 bg-white ring-1 ring-neutral-200";
        return (
          <div key={d.id} className={`rounded-r-lg p-5 ${severityClass}`}>
            <dt className="text-sm font-semibold text-neutral-900">
              {d.label}
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-neutral-700">
              {d.body}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
