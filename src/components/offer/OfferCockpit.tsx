"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOfferCockpit } from "@/lib/dealroom/use-offer-cockpit";
import type { Id } from "../../../convex/_generated/dataModel";
import { BrokerReviewBadge } from "./BrokerReviewBadge";
import { EligibilityGate } from "./EligibilityGate";
import { OfferTermsEditor } from "./OfferTermsEditor";
import { OfferValidationSummary } from "./OfferValidationSummary";
import { ScenarioComparison } from "./ScenarioComparison";
import { UnsavedChangesBanner } from "./UnsavedChangesBanner";

interface OfferCockpitProps {
  dealRoomId: Id<"dealRooms">;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function OfferCockpit({ dealRoomId }: OfferCockpitProps) {
  const cockpit = useOfferCockpit(dealRoomId);

  if (cockpit.loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-neutral-500">
          Loading offer cockpit…
        </CardContent>
      </Card>
    );
  }

  if (!cockpit.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-neutral-500">
          This deal room is not available.
        </CardContent>
      </Card>
    );
  }

  const { data } = cockpit;
  const scenarios = data.scenarios?.output;
  const disabled = !cockpit.canEdit;

  return (
    <EligibilityGate
      eligibility={data.eligibility}
      agreementHref={`/agreements?dealRoom=${data.dealRoom._id}`}
    >
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Offer cockpit
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
              {data.propertyAddress}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Listed at {currency.format(data.listPrice)}
            </p>
          </div>
          <BrokerReviewBadge
            state={cockpit.brokerReviewState}
            note={cockpit.brokerNote}
          />
        </header>

        <UnsavedChangesBanner
          dirty={cockpit.dirty}
          saving={cockpit.saving}
          lastSavedAt={data.draft?.lastSavedAt ?? null}
          onSave={() => void cockpit.save()}
          onDiscard={() => cockpit.reset()}
        />

        {scenarios ? (
          <ScenarioComparison
            scenarios={scenarios.scenarios}
            recommendedIndex={scenarios.recommendedIndex}
            listPrice={data.listPrice}
            selectedScenarioName={cockpit.selectedScenarioName}
            onSelectScenario={cockpit.selectScenario}
            inputSummary={scenarios.inputSummary}
            confidence={data.scenarios?.confidence}
            refreshedAt={data.scenarios?.generatedAt}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-neutral-500">
              Offer scenarios have not been generated yet. Your broker will run the
              offer engine shortly.
            </CardContent>
          </Card>
        )}

        <OfferTermsEditor
          terms={cockpit.terms}
          listPrice={data.listPrice}
          buyerMaxBudget={data.buyerProfile.budgetMax}
          disabled={disabled}
          validation={cockpit.validation}
          onChange={cockpit.setTerms}
        />

        <OfferValidationSummary validation={cockpit.validation} />

        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-neutral-500">
            {cockpit.status === "pending_review" &&
              "This draft is with your broker. You'll be notified once it's reviewed."}
            {cockpit.status === "approved" &&
              "Approved by your broker — ready to submit to the seller."}
            {cockpit.status === "rejected" &&
              "Your broker returned the draft with notes. Update and resubmit."}
            {cockpit.status === "draft" &&
              "Broker review is required before your offer reaches the seller."}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void cockpit.discard()}
              disabled={!cockpit.canEdit || cockpit.saving || cockpit.submitting}
            >
              Discard draft
            </Button>
            <Button
              variant="outline"
              onClick={() => void cockpit.save()}
              disabled={!cockpit.dirty || cockpit.saving || cockpit.submitting}
            >
              {cockpit.saving ? "Saving…" : "Save draft"}
            </Button>
            <Button
              onClick={() => void cockpit.submit()}
              disabled={!cockpit.canSubmit || cockpit.submitting || cockpit.saving}
            >
              {cockpit.submitting ? "Submitting…" : "Submit for broker review"}
            </Button>
          </div>
        </footer>

        {(cockpit.saveError || cockpit.submitError) && (
          <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700">
            {cockpit.saveError ?? cockpit.submitError}
          </div>
        )}
      </div>
    </EligibilityGate>
  );
}
