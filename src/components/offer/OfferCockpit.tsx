"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OfferOutput } from "@/lib/ai/engines/types";
import type { BrokerageCallState } from "@/lib/dealroom/offer-cockpit-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOfferCockpit } from "@/lib/dealroom/use-offer-cockpit";
import type { Id } from "../../../convex/_generated/dataModel";
import { BrokerReviewBadge } from "./BrokerReviewBadge";
import { EligibilityGate } from "./EligibilityGate";
import { OfferNegotiationStep } from "./OfferNegotiationStep";
import { OfferSubmitStep } from "./OfferSubmitStep";
import { OfferTermsEditor } from "./OfferTermsEditor";
import { OfferValidationSummary } from "./OfferValidationSummary";
import {
  OfferWizardStepper,
  type WizardStep,
} from "./OfferWizardStepper";
import { ScenarioComparison } from "./ScenarioComparison";
import { UnsavedChangesBanner } from "./UnsavedChangesBanner";
import { trackOfferGateEvent } from "@/lib/analytics/offer-gate-events";

interface OfferCockpitProps {
  dealRoomId: Id<"dealRooms">;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const STEP_ORDER: readonly WizardStep[] = [
  "strategy",
  "details",
  "sign",
  "negotiation",
];

function stepLabel(step: WizardStep): string {
  switch (step) {
    case "strategy":
      return "Offer Strategy";
    case "details":
      return "Offer Details";
    case "sign":
      return "Sign & Submit";
    case "negotiation":
      return "Offer Negotiation";
  }
}

export function OfferCockpit({ dealRoomId }: OfferCockpitProps) {
  const cockpit = useOfferCockpit(dealRoomId);
  const [activeStep, setActiveStep] = useState<WizardStep>("strategy");

  if (cockpit.loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading offer cockpit…
        </CardContent>
      </Card>
    );
  }

  if (!cockpit.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          This deal room is not available.
        </CardContent>
      </Card>
    );
  }

  const { data } = cockpit;
  const scenarios = data.scenarios?.output;
  const disabled = !cockpit.canEdit;
  const brokerageCallState: BrokerageCallState =
    cockpit.brokerageCallState ?? {
      requestedAt: null,
      phone: null,
      completedAt: null,
      completedBy: null,
      stage: "none",
    };
  const brokerageStage = brokerageCallState.stage;

  return (
    <EligibilityGate
      brokerageStage={brokerageStage}
      viewerRole={data.viewerRole}
      dealRoomId={data.dealRoom._id as Id<"dealRooms">}
      propertyId={data.propertyId}
      listPrice={data.listPrice}
    >
      <OfferCockpitBody
        cockpit={cockpit}
        activeStep={activeStep}
        setActiveStep={setActiveStep}
        scenarios={scenarios}
        disabled={disabled}
        brokerageCallState={brokerageCallState}
        dealRoomId={String(data.dealRoom._id)}
      />
    </EligibilityGate>
  );
}

interface OfferCockpitBodyProps {
  cockpit: ReturnType<typeof useOfferCockpit>;
  activeStep: WizardStep;
  setActiveStep: (step: WizardStep) => void;
  scenarios: OfferOutput | null | undefined;
  disabled: boolean;
  brokerageCallState: BrokerageCallState;
  dealRoomId: string;
}

function OfferCockpitBody({
  cockpit,
  activeStep,
  setActiveStep,
  scenarios,
  disabled,
  brokerageCallState,
  dealRoomId,
}: OfferCockpitBodyProps) {
  const { data } = cockpit;
  const propertyIdForEvents = data?.propertyId;

  const completedSteps = useMemo(() => {
    const done = new Set<WizardStep>();
    if (cockpit.selectedScenarioName) done.add("strategy");
    if (cockpit.validation.ok && cockpit.terms.offerPrice > 0) {
      done.add("details");
    }
    if (
      cockpit.status === "pending_review" ||
      cockpit.status === "approved" ||
      cockpit.status === "submitted"
    ) {
      done.add("sign");
    }
    return done;
  }, [
    cockpit.selectedScenarioName,
    cockpit.validation.ok,
    cockpit.terms.offerPrice,
    cockpit.status,
  ]);

  // Fire WIZARD_UNLOCKED once per mount when the gate is already cleared.
  const unlockedFiredRef = useRef(false);
  useEffect(() => {
    if (
      brokerageCallState.stage !== "none" &&
      !unlockedFiredRef.current &&
      propertyIdForEvents
    ) {
      unlockedFiredRef.current = true;
      trackOfferGateEvent("WIZARD_UNLOCKED", {
        dealRoomId,
        propertyId: propertyIdForEvents,
      });
    }
  }, [brokerageCallState.stage, dealRoomId, propertyIdForEvents]);

  if (!data) return null;

  const handleStepClick = (step: WizardStep) => {
    setActiveStep(step);
    trackOfferGateEvent("WIZARD_STEP_CHANGED", { dealRoomId, step });
  };

  const activeIdx = STEP_ORDER.indexOf(activeStep);
  const prevStep: WizardStep | null =
    activeIdx > 0 ? STEP_ORDER[activeIdx - 1] : null;
  const nextStep: WizardStep | null =
    activeIdx < STEP_ORDER.length - 1 ? STEP_ORDER[activeIdx + 1] : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Offer cockpit
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground">
            {data.propertyAddress}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
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

      <OfferWizardStepper
        activeStep={activeStep}
        completedSteps={completedSteps}
        onStepClick={handleStepClick}
      />

      {activeStep === "strategy" && (
        <section className="flex flex-col gap-6">
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
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Offer scenarios have not been generated yet. Your broker will
                run the offer engine shortly.
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {activeStep === "details" && (
        <section className="flex flex-col gap-6">
          <OfferTermsEditor
            terms={cockpit.terms}
            listPrice={data.listPrice}
            buyerMaxBudget={data.buyerProfile.budgetMax}
            disabled={disabled}
            validation={cockpit.validation}
            onChange={cockpit.setTerms}
          />

          <OfferValidationSummary validation={cockpit.validation} />

          {(cockpit.saveError || cockpit.submitError) && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {cockpit.saveError ?? cockpit.submitError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 rounded-3xl border border-border bg-card p-4">
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
          </div>
        </section>
      )}

      {activeStep === "sign" && (
        <OfferSubmitStep
          brokerageCallState={brokerageCallState}
          eligibility={data.eligibility}
          draftStatus={cockpit.status}
          canSubmit={cockpit.canSubmit}
          submitting={cockpit.submitting}
          submitError={cockpit.submitError}
          onSubmit={() => void cockpit.submit()}
          dealRoomId={dealRoomId}
        />
      )}

      {activeStep === "negotiation" && <OfferNegotiationStep />}

      {activeStep !== "negotiation" && (
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => prevStep && handleStepClick(prevStep)}
            disabled={!prevStep}
          >
            {prevStep ? `Back: ${stepLabel(prevStep)}` : "Back"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => nextStep && handleStepClick(nextStep)}
            disabled={!nextStep}
          >
            {nextStep ? `Next: ${stepLabel(nextStep)}` : "Next"}
          </Button>
        </nav>
      )}
    </div>
  );
}
