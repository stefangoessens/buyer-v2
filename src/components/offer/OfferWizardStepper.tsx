// 4-step horizontal stepper for the offer wizard (KIN-1077).
"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export type WizardStep = "strategy" | "details" | "sign" | "negotiation";

interface OfferWizardStepperProps {
  activeStep: WizardStep;
  completedSteps: Set<WizardStep>;
  onStepClick: (step: WizardStep) => void;
}

interface StepDef {
  key: WizardStep;
  index: number;
  label: string;
}

const STEPS: readonly StepDef[] = [
  { key: "strategy", index: 1, label: "Offer Strategy" },
  { key: "details", index: 2, label: "Offer Details" },
  { key: "sign", index: 3, label: "Sign & Submit" },
  { key: "negotiation", index: 4, label: "Offer Negotiation" },
];

function nextAfter(step: WizardStep): WizardStep | null {
  const idx = STEPS.findIndex((s) => s.key === step);
  if (idx === -1 || idx === STEPS.length - 1) return null;
  return STEPS[idx + 1].key;
}

export function OfferWizardStepper({
  activeStep,
  completedSteps,
  onStepClick,
}: OfferWizardStepperProps) {
  const activeIdx = STEPS.findIndex((s) => s.key === activeStep);
  const immediateNext = nextAfter(activeStep);

  return (
    <nav
      aria-label="Offer wizard progress"
      className="rounded-3xl border border-border bg-card p-4"
    >
      <ol className="grid grid-cols-2 gap-4 md:flex md:items-center md:gap-2">
        {STEPS.map((step, index) => {
          const isActive = step.key === activeStep;
          const isCompleted = completedSteps.has(step.key);
          const isClickable =
            isCompleted ||
            step.key === immediateNext ||
            index < activeIdx;
          const showConnector = index < STEPS.length - 1;
          const nextIdx = index + 1;
          const connectorDone =
            isCompleted && completedSteps.has(STEPS[nextIdx].key);

          return (
            <li
              key={step.key}
              className="flex min-w-0 flex-1 items-center gap-2 md:gap-3"
            >
              <button
                type="button"
                onClick={() => {
                  if (!isClickable) return;
                  onStepClick(step.key);
                }}
                disabled={!isClickable}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors",
                  isClickable
                    ? "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    : "cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isActive &&
                      !isCompleted &&
                      "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20",
                    !isActive &&
                      !isCompleted &&
                      "border-border bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={2.5} />
                  ) : (
                    step.index
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                    Step {step.index}
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-semibold",
                      isActive || isCompleted
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              </button>
              {showConnector && (
                <div
                  className={cn(
                    "hidden h-px flex-1 md:block",
                    connectorDone ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
