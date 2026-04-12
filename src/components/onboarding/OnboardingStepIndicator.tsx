import { onboardingSteps, type OnboardingStep } from "@/lib/onboarding/types";

const stepCopy: Record<OnboardingStep, { label: string; eyebrow: string }> = {
  account: { label: "Create your buyer account", eyebrow: "01" },
  buyer_basics: { label: "Calibrate your search", eyebrow: "02" },
  property_linkage: { label: "Link your first listing", eyebrow: "03" },
};

export function OnboardingStepIndicator({
  currentStep,
}: {
  currentStep: OnboardingStep;
}) {
  const currentIndex = onboardingSteps.indexOf(currentStep);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {onboardingSteps.map((step, index) => {
          const isActive = currentIndex === index;
          const isComplete = currentIndex > index;

          return (
            <div key={step} className="flex flex-1 items-center gap-3">
              <div
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  isComplete
                    ? "border-primary-700 bg-primary-700 text-white"
                    : isActive
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : "border-neutral-200 bg-white text-neutral-400",
                ].join(" ")}
              >
                {stepCopy[step].eyebrow}
              </div>
              {index < onboardingSteps.length - 1 ? (
                <div
                  className={[
                    "h-px flex-1",
                    currentIndex > index ? "bg-primary-200" : "bg-neutral-200",
                  ].join(" ")}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
          Step {currentIndex + 1} of {onboardingSteps.length}
        </p>
        <h2 className="mt-2 text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-neutral-900">
          {stepCopy[currentStep].label}
        </h2>
      </div>
    </div>
  );
}

