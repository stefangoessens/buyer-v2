// Roll-up panel showing offer validation errors and warnings so buyers see everything blocking send.
import type { OfferCockpitValidation } from "@/lib/dealroom/offer-cockpit-types";

interface OfferValidationSummaryProps {
  validation: OfferCockpitValidation;
}

export function OfferValidationSummary({ validation }: OfferValidationSummaryProps) {
  const { errors, warnings } = validation;
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  if (!hasErrors && !hasWarnings) {
    return null;
  }

  return (
    <div className="space-y-3">
      {hasErrors ? (
        <div
          role="alert"
          className="rounded-lg border border-error-200 bg-error-50 p-4"
        >
          <p className="text-sm font-semibold text-error-700">
            {errors.length} issue{errors.length === 1 ? "" : "s"} to fix before sending
          </p>
          <ul className="mt-2 space-y-1 text-sm text-error-700">
            {errors.map((error) => (
              <li key={`${error.field}-${error.code}`}>
                <span aria-hidden="true">• </span>
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasWarnings ? (
        <div
          role="status"
          className="rounded-lg border border-warning-200 bg-warning-50 p-4"
        >
          <p className="text-sm font-semibold text-warning-700">
            Heads up — {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-warning-700">
            {warnings.map((warning) => (
              <li key={`${warning.field}-${warning.code}`}>
                <span aria-hidden="true">• </span>
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
