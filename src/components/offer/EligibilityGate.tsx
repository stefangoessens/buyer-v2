// Gate that blocks offer cockpit access when the buyer is not eligible and surfaces the resolution step.
import type { OfferEligibilitySnapshot } from "@/lib/dealroom/offer-cockpit-types";
import { Button } from "@/components/ui/button";

interface EligibilityGateProps {
  eligibility: OfferEligibilitySnapshot;
  children: React.ReactNode;
  agreementHref?: string;
}

export function EligibilityGate({
  eligibility,
  children,
  agreementHref,
}: EligibilityGateProps) {
  if (eligibility.isEligible) {
    return <>{children}</>;
  }

  const blockingMessage =
    eligibility.blockingReasonMessage ??
    "Complete the required steps before you can make an offer on this property.";

  const requiredAction = eligibility.requiredAction?.toLowerCase() ?? "";
  const mentionsAgreement = requiredAction.includes("agreement");
  const showAgreementAction = mentionsAgreement && Boolean(agreementHref);

  return (
    <div className="rounded-xl border border-warning-200 bg-warning-50 p-8 text-center">
      <h2 className="text-xl font-semibold text-warning-800">Offer entry is locked</h2>
      <p className="mt-2 text-sm text-warning-700">{blockingMessage}</p>
      <div className="mt-5 flex justify-center">
        {showAgreementAction ? (
          <Button asChild variant="default">
            <a href={agreementHref}>Review buyer agreement</a>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <a href="/dashboard">Back to dashboard</a>
          </Button>
        )}
      </div>
    </div>
  );
}
