"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OfferOutput, OfferScenario } from "@/lib/ai/engines/types";
import {
  emptyTerms,
  scenarioToTerms,
  type BrokerageCallStage,
  type BrokerageCallState,
  type BrokerReviewState,
  type OfferCockpitStatus,
  type OfferCockpitValidation,
  type OfferEligibilitySnapshot,
  type OfferTerms,
} from "./offer-cockpit-types";
import {
  termsChanged,
  validateOfferTerms,
} from "./offer-cockpit-validation";

type CockpitServerPayload = {
  dealRoom: { _id: string; buyerId: string; status: string };
  propertyId: string;
  listPrice: number;
  propertyAddress: string;
  buyerProfile: {
    budgetMax?: number;
    financingType?: "cash" | "conventional" | "fha" | "va" | "other";
    preApproved: boolean;
    preApprovalAmount?: number;
    preApprovalExpiry?: string;
    lenderName?: string;
  };
  draft: {
    _id: Id<"offerCockpitDrafts">;
    status: OfferCockpitStatus;
    brokerReviewState: BrokerReviewState;
    brokerNote?: string | null;
    selectedScenarioName?: string | null;
    offerPrice: number;
    earnestMoney: number;
    closingDays: number;
    contingencies: string[];
    buyerCredits: number;
    sellerCredits: number;
    version: number;
    lastSavedAt: string;
  } | null;
  scenarios: {
    output: OfferOutput;
    confidence: number;
    generatedAt: string;
    modelId: string;
  } | null;
  eligibility: OfferEligibilitySnapshot;
  canEdit: boolean;
  viewerRole: "buyer" | "broker" | "admin";
  brokerageCallState: BrokerageCallState;
} | null;

export interface OfferCockpitState {
  loading: boolean;
  data: CockpitServerPayload;
  terms: OfferTerms;
  pristineTerms: OfferTerms;
  selectedScenarioName: string | null;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  submitError: string | null;
  submitting: boolean;
  validation: OfferCockpitValidation;
  brokerReviewState: BrokerReviewState;
  brokerNote: string | null;
  status: OfferCockpitStatus;
  canEdit: boolean;
  canSubmit: boolean;
  brokerageCallState: BrokerageCallState | null;
  brokerageStage: BrokerageCallStage;
  setTerms: (next: OfferTerms) => void;
  selectScenario: (scenario: OfferScenario) => void;
  save: () => Promise<void>;
  submit: () => Promise<void>;
  discard: () => Promise<void>;
  reset: () => void;
}

function toTerms(
  draft: NonNullable<CockpitServerPayload>["draft"],
  fallback: OfferTerms,
): OfferTerms {
  if (!draft) return fallback;
  return {
    offerPrice: draft.offerPrice,
    earnestMoney: draft.earnestMoney,
    closingDays: draft.closingDays,
    contingencies: [...draft.contingencies],
    buyerCredits: draft.buyerCredits,
    sellerCredits: draft.sellerCredits,
  };
}

export function useOfferCockpit(
  dealRoomId: Id<"dealRooms">,
): OfferCockpitState {
  const data = useQuery(api.offerCockpit.getCockpit, {
    dealRoomId,
  }) as CockpitServerPayload | undefined;

  const upsertDraft = useMutation(api.offerCockpit.upsertDraft);
  const submitForReview = useMutation(api.offerCockpit.submitForReview);
  const discardDraft = useMutation(api.offerCockpit.discardDraft);

  const listPrice = data?.listPrice ?? 0;

  const initialTerms = useMemo<OfferTerms>(() => {
    if (data?.draft) return toTerms(data.draft, emptyTerms(listPrice));
    const scenarios = data?.scenarios?.output?.scenarios ?? [];
    const recommendedIdx = data?.scenarios?.output?.recommendedIndex ?? 1;
    const scenario = scenarios[recommendedIdx] ?? scenarios[0];
    if (scenario) return scenarioToTerms(scenario, listPrice);
    return emptyTerms(listPrice);
  }, [data, listPrice]);

  const initialScenarioName = useMemo<string | null>(() => {
    if (data?.draft?.selectedScenarioName) return data.draft.selectedScenarioName;
    const scenarios = data?.scenarios?.output?.scenarios ?? [];
    const recommendedIdx = data?.scenarios?.output?.recommendedIndex ?? 1;
    const scenario = scenarios[recommendedIdx] ?? scenarios[0];
    return scenario?.name ?? null;
  }, [data]);

  const [terms, setTermsState] = useState<OfferTerms>(initialTerms);
  const [pristineTerms, setPristineTerms] = useState<OfferTerms>(initialTerms);
  const [selectedScenarioName, setSelectedScenarioName] = useState<string | null>(
    initialScenarioName,
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const dirty = termsChanged(terms, pristineTerms);
    if (dirty) return;
    setTermsState(initialTerms);
    setPristineTerms(initialTerms);
    setSelectedScenarioName(initialScenarioName);
    // terms/pristineTerms intentionally omitted: we only rehydrate when
    // there are no unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.draft?.version, data?.scenarios?.generatedAt]);

  const dirty = useMemo(
    () => termsChanged(terms, pristineTerms),
    [terms, pristineTerms],
  );

  const validation = useMemo(
    () =>
      validateOfferTerms({
        terms,
        listPrice,
        buyerMaxBudget: data?.buyerProfile.budgetMax,
      }),
    [data?.buyerProfile.budgetMax, terms, listPrice],
  );

  const status: OfferCockpitStatus = data?.draft?.status ?? "draft";
  const brokerReviewState: BrokerReviewState =
    data?.draft?.brokerReviewState ?? "not_submitted";
  const brokerNote = data?.draft?.brokerNote ?? null;
  const canEdit =
    (data?.canEdit ?? false) && (status === "draft" || status === "rejected");
  const canSubmit = canEdit && validation.ok;
  const brokerageCallState = data?.brokerageCallState ?? null;
  const brokerageStage: BrokerageCallStage =
    brokerageCallState?.stage ?? "none";

  const setTerms = useCallback((next: OfferTerms) => {
    setTermsState(next);
    setSaveError(null);
  }, []);

  const selectScenario = useCallback(
    (scenario: OfferScenario) => {
      setSelectedScenarioName(scenario.name);
      setTermsState(scenarioToTerms(scenario, listPrice));
      setSaveError(null);
    },
    [listPrice],
  );

  const save = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    try {
      await upsertDraft({
        dealRoomId,
        offerPrice: terms.offerPrice,
        earnestMoney: terms.earnestMoney,
        closingDays: terms.closingDays,
        contingencies: terms.contingencies,
        buyerCredits: terms.buyerCredits,
        sellerCredits: terms.sellerCredits,
        selectedScenarioName: selectedScenarioName ?? undefined,
      });
      setPristineTerms(terms);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [data, upsertDraft, dealRoomId, terms, selectedScenarioName]);

  const submit = useCallback(async () => {
    if (!data) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (dirty) {
        await upsertDraft({
          dealRoomId,
          offerPrice: terms.offerPrice,
          earnestMoney: terms.earnestMoney,
          closingDays: terms.closingDays,
          contingencies: terms.contingencies,
          buyerCredits: terms.buyerCredits,
          sellerCredits: terms.sellerCredits,
          selectedScenarioName: selectedScenarioName ?? undefined,
        });
        setPristineTerms(terms);
      }
      await submitForReview({ dealRoomId });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }, [
    data,
    dirty,
    upsertDraft,
    submitForReview,
    dealRoomId,
    terms,
    selectedScenarioName,
  ]);

  const discard = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await discardDraft({ dealRoomId });
      setTermsState(initialTerms);
      setPristineTerms(initialTerms);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to discard");
    } finally {
      setSaving(false);
    }
  }, [discardDraft, dealRoomId, initialTerms]);

  const reset = useCallback(() => {
    setTermsState(pristineTerms);
    setSaveError(null);
  }, [pristineTerms]);

  return {
    loading: data === undefined,
    data: (data ?? null) as CockpitServerPayload,
    terms,
    pristineTerms,
    selectedScenarioName,
    dirty,
    saving,
    saveError,
    submitError,
    submitting,
    validation,
    brokerReviewState,
    brokerNote,
    status,
    canEdit,
    canSubmit,
    brokerageCallState,
    brokerageStage,
    setTerms,
    selectScenario,
    save,
    submit,
    discard,
    reset,
  };
}
