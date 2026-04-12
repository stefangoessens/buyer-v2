"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";
import { OnboardingStepIndicator } from "@/components/onboarding/OnboardingStepIndicator";
import { ScoreBadge } from "@/components/product/ScoreBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  clearOnboardingState,
  createBuyerSessionFromDraft,
  createEmptyOnboardingState,
  readBuyerSession,
  readOnboardingState,
  writeBuyerSession,
  writeOnboardingState,
} from "@/lib/onboarding/storage";
import {
  onboardingSteps,
  type BuyerOnboardingState,
  type OnboardingStep,
  type StepValidationResult,
} from "@/lib/onboarding/types";
import {
  buildLinkedSearch,
  validateAccountStep,
  validateBuyerBasicsStep,
  validatePropertyLinkageStep,
} from "@/lib/onboarding/validation";

function formatCurrency(value: number | null) {
  if (value == null) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function validationByField(result: StepValidationResult) {
  if (result.ok) return {};

  return result.issues.reduce<Record<string, string>>((accumulator, issue) => {
    accumulator[issue.field] = issue.message;
    return accumulator;
  }, {});
}

function getNextStep(step: OnboardingStep): OnboardingStep | null {
  const index = onboardingSteps.indexOf(step);
  return onboardingSteps[index + 1] ?? null;
}

export function OnboardingFlow() {
  const router = useRouter();
  const [draft, setDraft] = useState<BuyerOnboardingState | null>(null);
  const [validationState, setValidationState] = useState<StepValidationResult>({
    ok: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const activeSession = readBuyerSession();
    if (activeSession) {
      startTransition(() => {
        router.replace("/dashboard");
      });
      return;
    }

    setDraft(readOnboardingState() ?? createEmptyOnboardingState());
  }, [router]);

  useEffect(() => {
    if (!draft || draft.status !== "draft") return;
    writeOnboardingState(draft);
  }, [draft]);

  const errors = useMemo(
    () => validationByField(validationState),
    [validationState]
  );

  if (!draft) {
    return (
      <div className="animate-pulse rounded-[28px] border border-white/70 bg-white/80 p-10 shadow-lg shadow-primary-900/5 backdrop-blur">
        <div className="h-12 w-52 rounded-full bg-neutral-100" />
        <div className="mt-8 h-4 w-40 rounded-full bg-neutral-100" />
        <div className="mt-3 h-4 w-full rounded-full bg-neutral-100" />
        <div className="mt-12 h-44 rounded-[24px] bg-neutral-100" />
      </div>
    );
  }

  const currentDraft = draft;

  function patchDraft(
    recipe: (current: BuyerOnboardingState) => BuyerOnboardingState
  ) {
    setDraft((current) => {
      if (!current) return current;

      return {
        ...recipe(current),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function validateCurrentStep() {
    switch (currentDraft.currentStep) {
      case "account":
        return validateAccountStep(currentDraft.account);
      case "buyer_basics":
        return validateBuyerBasicsStep(currentDraft.buyerBasics);
      case "property_linkage":
        return validatePropertyLinkageStep(currentDraft.propertyLinkage);
    }
  }

  function handleContinue() {
    const result = validateCurrentStep();
    setValidationState(result);
    if (!result.ok) return;

    const nextStep = getNextStep(currentDraft.currentStep);
    if (!nextStep) {
      setIsSubmitting(true);
      const session = createBuyerSessionFromDraft(currentDraft);
      writeBuyerSession(session);
      clearOnboardingState();

      startTransition(() => {
        router.push("/dashboard");
      });
      return;
    }

    patchDraft((current) => ({
      ...current,
      currentStep: nextStep,
    }));
    setValidationState({ ok: true });
  }

  function handleBack() {
    const currentIndex = onboardingSteps.indexOf(currentDraft.currentStep);
    const previousStep = onboardingSteps[currentIndex - 1];
    if (!previousStep) return;

    patchDraft((current) => ({
      ...current,
      currentStep: previousStep,
    }));
    setValidationState({ ok: true });
  }

  function renderFieldError(field: string) {
    const message = errors[field];
    if (!message) return null;

    return <p className="mt-2 text-sm text-error-700">{message}</p>;
  }

  return (
    <Card className="overflow-hidden rounded-[36px] border border-white/80 bg-white/92 py-0 shadow-[0_30px_100px_rgba(5,45,91,0.14)] backdrop-blur-xl">
      <CardHeader className="border-b border-neutral-100/80 bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(255,255,255,0.92))] px-8 pb-7 pt-8 sm:px-10 sm:pt-10">
        <OnboardingStepIndicator currentStep={draft.currentStep} />
        <CardDescription className="max-w-2xl text-base leading-7 text-neutral-500">
          Save your buyer profile, keep your first deal room attached to it, and
          pick up exactly where you left off whenever you come back.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8 px-8 py-8 sm:px-10">
        <div className="space-y-6">
          {draft.currentStep === "account" ? (
            <div className="space-y-5 rounded-[28px] border border-neutral-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFD_100%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                  Account details
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Create the registered buyer identity that will follow every future search thread and deal-room unlock.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  Full name
                </label>
                <Input
                  value={draft.account.fullName}
                  onChange={(event) =>
                    patchDraft((current) => ({
                      ...current,
                      account: {
                        ...current.account,
                        fullName: event.target.value,
                      },
                    }))
                  }
                  placeholder="Avery Chen"
                  className="h-12 rounded-2xl border-neutral-200 bg-white px-4"
                />
                {renderFieldError("fullName")}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Email
                  </label>
                  <Input
                    value={draft.account.email}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        account: {
                          ...current.account,
                          email: event.target.value,
                        },
                      }))
                    }
                    placeholder="avery@buyerv2.com"
                    className="h-12 rounded-2xl border-neutral-200 bg-white px-4"
                  />
                  {renderFieldError("email")}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Phone
                  </label>
                  <Input
                    value={draft.account.phone}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        account: {
                          ...current.account,
                          phone: event.target.value,
                        },
                      }))
                    }
                    placeholder="(305) 555-0182"
                    className="h-12 rounded-2xl border-neutral-200 bg-white px-4"
                  />
                  {renderFieldError("phone")}
                </div>
              </div>
            </div>
          ) : null}

          {draft.currentStep === "buyer_basics" ? (
            <div className="space-y-5 rounded-[28px] border border-neutral-200 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFD_100%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                  Search preferences
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  We use this to shape the dashboard summary and keep the first-property context aligned with your search.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Budget minimum
                  </label>
                  <Input
                    type="number"
                    value={draft.buyerBasics.budgetMin ?? ""}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        buyerBasics: {
                          ...current.buyerBasics,
                          budgetMin:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        },
                      }))
                    }
                    className="h-12 rounded-2xl border-neutral-200 bg-white px-4"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Budget maximum
                  </label>
                  <Input
                    type="number"
                    value={draft.buyerBasics.budgetMax ?? ""}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        buyerBasics: {
                          ...current.buyerBasics,
                          budgetMax:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        },
                      }))
                    }
                    className="h-12 rounded-2xl border-neutral-200 bg-white px-4"
                  />
                </div>
              </div>
              {renderFieldError("budget")}

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Timeline
                  </label>
                  <select
                    value={draft.buyerBasics.timeline}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        buyerBasics: {
                          ...current.buyerBasics,
                          timeline:
                            event.target.value as BuyerOnboardingState["buyerBasics"]["timeline"],
                        },
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-700 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
                  >
                    <option value="asap">ASAP</option>
                    <option value="30_60_days">30 to 60 days</option>
                    <option value="90_plus_days">90+ days</option>
                    <option value="just_researching">Just researching</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">
                    Financing
                  </label>
                  <select
                    value={draft.buyerBasics.financing}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        buyerBasics: {
                          ...current.buyerBasics,
                          financing:
                            event.target.value as BuyerOnboardingState["buyerBasics"]["financing"],
                        },
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm text-neutral-700 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
                  >
                    <option value="conventional">Conventional</option>
                    <option value="cash">Cash</option>
                    <option value="fha_va">FHA / VA</option>
                    <option value="exploring">Still exploring</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  Preferred areas
                </label>
                <Input
                  value={draft.buyerBasics.preferredAreas}
                  onChange={(event) =>
                    patchDraft((current) => ({
                      ...current,
                      buyerBasics: {
                        ...current.buyerBasics,
                        preferredAreas: event.target.value,
                      },
                    }))
                  }
                  placeholder="Miami Beach, Coral Gables, Coconut Grove"
                  className="h-12 rounded-2xl border-neutral-200 bg-white px-4"
                />
                {renderFieldError("preferredAreas")}
              </div>
            </div>
          ) : null}

          {draft.currentStep === "property_linkage" ? (
            <div className="space-y-6">
              <div className="rounded-[28px] border border-primary-100 bg-[linear-gradient(135deg,rgba(229,241,255,0.92),rgba(255,255,255,0.96))] p-6">
                <CardTitle className="text-2xl text-neutral-900">
                  Paste your first listing
                </CardTitle>
                <CardDescription className="mt-2 text-base leading-7 text-neutral-500">
                  Use the same URL paste pattern as the public homepage hero. We
                  will carry that first deal-room context into your dashboard.
                </CardDescription>
                <div className="mt-6">
                  <PasteLinkInput
                    variant="compact"
                    placeholder="Paste a Zillow, Redfin, or Realtor.com link"
                    onSubmit={(url) => {
                      const linkedSearch = buildLinkedSearch(url);

                      patchDraft((current) => ({
                        ...current,
                        propertyLinkage: {
                          listingUrl: url,
                          linkedSearch,
                        },
                      }));

                      setValidationState(
                        linkedSearch
                          ? { ok: true }
                          : {
                              ok: false,
                              issues: [
                                {
                                  field: "listingUrl",
                                  code: "invalid_listing_url",
                                  message:
                                    "Use a Zillow, Redfin, or Realtor.com listing URL.",
                                },
                              ],
                            }
                      );
                    }}
                  />
                </div>
                {renderFieldError("listingUrl")}
                {renderFieldError("linkedSearch")}
              </div>

              {draft.propertyLinkage.linkedSearch ? (
                <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm">
                  <div className="relative aspect-[16/9] overflow-hidden bg-neutral-100">
                    <Image
                      src={draft.propertyLinkage.linkedSearch.imageUrl}
                      alt={draft.propertyLinkage.linkedSearch.address}
                      fill
                      sizes="(min-width: 1280px) 430px, 100vw"
                      className="object-cover"
                    />
                    <div className="absolute right-4 top-4">
                      <ScoreBadge
                        score={draft.propertyLinkage.linkedSearch.score}
                        size="sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 px-6 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-neutral-900">
                          {draft.propertyLinkage.linkedSearch.address}
                        </p>
                        <p className="text-sm text-neutral-500">
                          {draft.propertyLinkage.linkedSearch.city}
                        </p>
                      </div>
                      <div className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase text-primary-700">
                        {draft.propertyLinkage.linkedSearch.portal}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                      <span className="text-base font-semibold text-primary-700">
                        {formatCurrency(draft.propertyLinkage.linkedSearch.price)}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-neutral-300" />
                      <span>{draft.propertyLinkage.linkedSearch.lastActivity}</span>
                    </div>
                    <p className="text-sm leading-6 text-neutral-600">
                      {draft.propertyLinkage.linkedSearch.summary}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-neutral-100/80 pt-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-neutral-500">
              {draft.currentStep === "buyer_basics"
                ? `Saved range ${formatCurrency(draft.buyerBasics.budgetMin)} to ${formatCurrency(draft.buyerBasics.budgetMax)}`
                : null}
              {draft.currentStep === "property_linkage"
                ? "Your first pasted listing becomes the anchor for your dashboard."
                : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {draft.currentStep !== "account" ? (
                <Button
                  variant="outline"
                  className="h-11 rounded-xl border-neutral-200 px-5"
                  onClick={handleBack}
                >
                  Back
                </Button>
              ) : null}
              <Button
                className="h-11 rounded-xl bg-primary-700 px-5 text-white hover:bg-primary-700/90"
                onClick={handleContinue}
                disabled={isSubmitting}
              >
                {draft.currentStep === "property_linkage"
                  ? isSubmitting
                    ? "Opening dashboard..."
                    : "Complete setup"
                  : "Continue"}
              </Button>
            </div>
          </div>
        </div>

        <aside className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] xl:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.8fr))]">
          <div className="rounded-[28px] border border-primary-100 bg-[linear-gradient(180deg,rgba(245,248,255,0.92),rgba(255,255,255,0.96))] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
              Why this exists
            </p>
            <h3 className="mt-2 text-xl font-semibold text-neutral-900">
              Your deal room should be resumable
            </h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-neutral-500">
              <p>
                We keep your buyer profile, budget, and first property context tied
                together so you can move between teaser access, dashboard review,
                and broker follow-up without starting over.
              </p>
              <p>
                The same registration state also unlocks registered access on the
                deal-room route in this branch.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-primary-100/70 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-neutral-900">
              What you unlock
            </p>
            <ul className="mt-4 space-y-3 text-sm text-neutral-500">
              <li>Registered dashboard with persistent search cards</li>
              <li>Score-based review of pasted listings</li>
              <li>Continuity between onboarding and deal-room access</li>
            </ul>
          </div>

          <div className="rounded-[24px] border border-primary-100/70 bg-[radial-gradient(circle_at_top_left,rgba(15,111,222,0.08),transparent_55%),#ffffff] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
              Session model
            </p>
            <p className="mt-3 text-sm leading-6 text-neutral-500">
              Draft progress persists locally until completion. Once finished, the buyer session powers the dashboard and registered property access in the same browser.
            </p>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}
