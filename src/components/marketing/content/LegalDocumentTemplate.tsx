import type { LegalDocument } from "@/lib/content/types";
import { filterPublic } from "@/lib/content/publicFilter";

/**
 * Shared renderer for any `LegalDocument`. Route pages pass the
 * whole document (already looked up from the registry) and this
 * template handles the summary, numbered sections, and
 * "last updated" stamp.
 *
 * Internal-only sections are filtered out here so we never leak
 * review notes onto a public page even if a route forgets to call
 * `filterPublic` itself.
 */
export function LegalDocumentTemplate({ doc }: { doc: LegalDocument }) {
  const publicSections = filterPublic(doc.sections);

  if (publicSections.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-neutral-200">
        <p className="text-sm text-neutral-600">
          This document has no publicly published sections yet.
        </p>
      </div>
    );
  }

  return (
    <article className="space-y-8">
      <p className="rounded-2xl bg-white p-5 text-sm leading-relaxed text-neutral-700 ring-1 ring-neutral-200">
        {doc.summary}
      </p>

      <div className="space-y-8 rounded-2xl bg-white p-6 ring-1 ring-neutral-200 lg:p-10">
        {publicSections.map((section) => (
          <section key={section.id}>
            <h2 className="text-xl font-semibold text-neutral-900">
              {section.heading}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-700">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}

/**
 * Small stamp component showing the document's effective date. Kept
 * separate from the main template so the hero can render it inline
 * under the description.
 */
export function EffectiveDateStamp({ doc }: { doc: LegalDocument }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-primary-200">
      Effective: {doc.effectiveDate}
    </p>
  );
}
