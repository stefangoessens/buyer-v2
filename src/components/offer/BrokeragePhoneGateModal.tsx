// 2-stage phone gate modal/drawer enforcing the brokerage activation gate (KIN-1077).
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trackOfferGateEvent } from "@/lib/analytics/offer-gate-events";

interface BrokeragePhoneGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealRoomId: Id<"dealRooms">;
  propertyId: string;
  listPrice: number;
  onSuccess?: () => void;
}

type Stage = "stage1" | "stage2" | "success";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const STAGE1_HEADER_ID = "offer-gate-stage1-title";
const STAGE2_HEADER_ID = "offer-gate-stage2-title";
const SUCCESS_HEADER_ID = "offer-gate-success-title";

const DEFAULT_FEE_PCT = 1.0;
const DEFAULT_SLA_COPY = "We'll call you within 1 business hour";
const DEFAULT_LICENSE_PLACEHOLDER = "[Brokerage License #]";
const SELLER_FUNDS_PCT = 0.03;

function formatPhoneMask(raw: string): string {
  const digits = raw.replace(/\D+/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function countDigits(raw: string): number {
  return raw.replace(/\D+/g, "").length;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (ev: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(ev.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export function BrokeragePhoneGateModal({
  open,
  onOpenChange,
  dealRoomId,
  propertyId,
  listPrice,
  onSuccess,
}: BrokeragePhoneGateModalProps) {
  const isDesktop = useIsDesktop();
  const [stage, setStage] = useState<Stage>("stage1");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestCallback = useMutation(
    api.offerCockpit.requestBrokerageCallback,
  );

  // The settings catalog reads are ops-gated (broker/admin) in the current
  // convex layer. The buyer-facing modal uses the spec defaults verbatim —
  // matching the catalog defaults seeded in `fee.offer_gate_flat_fee_pct`,
  // `broker.callback_sla_copy`, and `broker.fl_license_number`. When a
  // buyer-safe settings read lands, this is the one place to re-wire.
  const feePct = DEFAULT_FEE_PCT;
  const slaCopy = DEFAULT_SLA_COPY;
  const licenseNumber = DEFAULT_LICENSE_PLACEHOLDER;

  const math = useMemo(() => {
    const safeListPrice = Math.max(0, listPrice);
    const sellerFunds = Math.round(safeListPrice * SELLER_FUNDS_PCT);
    const ourFee = Math.round(safeListPrice * (feePct / 100));
    const credit = Math.max(0, sellerFunds - ourFee);
    return { sellerFunds, ourFee, credit };
  }, [listPrice, feePct]);

  // Reset modal state when it closes.
  useEffect(() => {
    if (!open) {
      setStage("stage1");
      setPhone("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const stage1ShownRef = useRef(false);
  const stage2ShownRef = useRef(false);
  useEffect(() => {
    if (!open) {
      stage1ShownRef.current = false;
      stage2ShownRef.current = false;
      return;
    }
    if (stage === "stage1" && !stage1ShownRef.current) {
      stage1ShownRef.current = true;
      trackOfferGateEvent("MODAL_SHOWN", {
        dealRoomId,
        propertyId,
        listingPrice: listPrice,
      });
    }
    if (stage === "stage2" && !stage2ShownRef.current) {
      stage2ShownRef.current = true;
      trackOfferGateEvent("STAGE2_SHOWN", {
        dealRoomId,
        propertyId,
        listingPrice: listPrice,
        estimatedCreditCents: math.credit * 100,
      });
    }
  }, [
    open,
    stage,
    dealRoomId,
    propertyId,
    listPrice,
    math.credit,
  ]);

  const handleStage1Cta = useCallback(() => {
    trackOfferGateEvent("STAGE1_CTA_CLICKED", {
      dealRoomId,
      propertyId,
      listingPrice: listPrice,
    });
    setStage("stage2");
  }, [dealRoomId, propertyId, listPrice]);

  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPhone(formatPhoneMask(e.target.value));
      setError(null);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      const digits = countDigits(phone);
      if (digits !== 10) {
        const msg = "Please enter a valid US phone number";
        setError(msg);
        trackOfferGateEvent("PHONE_SUBMIT_ERROR", {
          dealRoomId,
          propertyId,
          kind: "invalid_phone",
        });
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await requestCallback({ dealRoomId, phone });
        trackOfferGateEvent("PHONE_SUBMITTED", {
          dealRoomId,
          propertyId,
          listingPrice: listPrice,
          estimatedCreditCents: math.credit * 100,
        });
        setStage("success");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to submit right now";
        setError(message);
        trackOfferGateEvent("PHONE_SUBMIT_ERROR", {
          dealRoomId,
          propertyId,
          kind: "mutation_error",
          message,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      phone,
      requestCallback,
      dealRoomId,
      propertyId,
      listPrice,
      math.credit,
    ],
  );

  const handleSuccessClose = useCallback(() => {
    onOpenChange(false);
    onSuccess?.();
  }, [onOpenChange, onSuccess]);

  const titleId =
    stage === "stage1"
      ? STAGE1_HEADER_ID
      : stage === "stage2"
        ? STAGE2_HEADER_ID
        : SUCCESS_HEADER_ID;

  const body = (
    <ModalBody
      stage={stage}
      phone={phone}
      error={error}
      submitting={submitting}
      sellerFunds={math.sellerFunds}
      ourFee={math.ourFee}
      credit={math.credit}
      feePct={feePct}
      slaCopy={slaCopy}
      licenseNumber={licenseNumber}
      onStage1Cta={handleStage1Cta}
      onPhoneChange={handlePhoneChange}
      onSubmit={handleSubmit}
      onSuccessClose={handleSuccessClose}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-xl sm:max-w-xl"
          showCloseButton={false}
          aria-labelledby={titleId}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Activate your brokerage</DialogTitle>
            <DialogDescription>
              Complete a quick two-step gate to unlock your offer flow.
            </DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] max-h-[100dvh] overflow-y-auto rounded-t-3xl p-0"
        showCloseButton={false}
        aria-labelledby={titleId}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Activate your brokerage</SheetTitle>
          <SheetDescription>
            Complete a quick two-step gate to unlock your offer flow.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 py-8">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

interface ModalBodyProps {
  stage: Stage;
  phone: string;
  error: string | null;
  submitting: boolean;
  sellerFunds: number;
  ourFee: number;
  credit: number;
  feePct: number;
  slaCopy: string;
  licenseNumber: string;
  onStage1Cta: () => void;
  onPhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onSuccessClose: () => void;
}

function ModalBody({
  stage,
  phone,
  error,
  submitting,
  sellerFunds,
  ourFee,
  credit,
  slaCopy,
  licenseNumber,
  onStage1Cta,
  onPhoneChange,
  onSubmit,
  onSuccessClose,
}: ModalBodyProps) {
  if (stage === "stage1") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Before you submit
          </p>
          <h2
            id={STAGE1_HEADER_ID}
            className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
          >
            Wait — Submitting This Offer Could Cost You
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Submitting an offer without a buyer&apos;s agent signals that
            you&apos;re unrepresented — allowing the seller&apos;s agent to
            claim the entire buyer&apos;s commission. By choosing buyer-v2 as
            your buyer&apos;s broker, we can collect the buyer&apos;s agent
            commission and credit it back to you at closing.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            onClick={onStage1Cta}
          >
            See How Much You Could Save
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "success") {
    // slaCopy is typically "We'll call you within 1 business hour" — we
    // want to extract the tail ("within 1 business hour") to compose the
    // headline "A buyer-v2 broker will call you within 1 business hour".
    // If the copy doesn't start with the expected prefix, use it as-is.
    const slaPrefixMatch = slaCopy.match(/^we'll call you (.+)$/i);
    const slaTail = slaPrefixMatch ? slaPrefixMatch[1] : slaCopy;
    return (
      <div className="flex flex-col items-center gap-6 py-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={40}
            strokeWidth={2}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h2
            id={SUCCESS_HEADER_ID}
            className="font-heading text-2xl font-semibold text-foreground"
          >
            Thanks! A buyer-v2 broker will call you {slaTail}
          </h2>
          <p className="text-sm text-muted-foreground">
            Thanks! A buyer-v2 broker will call you {slaTail} to confirm
            details and activate your credit.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          onClick={onSuccessClose}
        >
          Continue to your offer
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Estimated
        </p>
        <h2
          id={STAGE2_HEADER_ID}
          className="font-heading text-2xl font-semibold text-foreground sm:text-3xl"
        >
          Estimated Closing Credit
        </h2>
      </div>

      <div className="rounded-3xl border border-border bg-muted/40 p-5">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Assumed Seller Funds</dt>
            <dd className="font-mono text-base font-semibold text-foreground">
              {currencyFormatter.format(sellerFunds)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">
              Our Fee (only if you close)
            </dt>
            <dd className="font-mono text-base font-semibold text-foreground">
              −{currencyFormatter.format(ourFee)}
            </dd>
          </div>
          <div className="mt-1 h-px bg-border" aria-hidden="true" />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-base font-semibold text-foreground">
              Estimated Credit at Closing
            </dt>
            <dd className="font-mono text-xl font-semibold text-primary">
              {currencyFormatter.format(credit)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          Estimated credit assumes the seller agrees to the customary 3% buyer-side
          commission. Actual credit may vary based on the final negotiated
          commission. Subject to closing. buyer-v2 is a licensed Florida real
          estate brokerage, {licenseNumber}.
        </p>
      </div>

      <ul className="flex flex-col gap-3 text-sm text-foreground">
        {[
          "We represent you",
          "Handle all seller-side communication",
          "Help draft your offer and review the contract",
          "Help coordinate lender, title, inspections, and closing",
        ].map((bullet) => (
          <li key={bullet} className="flex items-start gap-3">
            <span
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={14}
                strokeWidth={2.5}
              />
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="offer-gate-phone"
          className="text-sm font-medium text-foreground"
        >
          Your phone number
        </label>
        <Input
          id="offer-gate-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-5555"
          value={phone}
          onChange={onPhoneChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "offer-gate-phone-error" : undefined}
          className={cn(
            "h-12 text-base",
            error && "border-destructive focus-visible:ring-destructive/30",
          )}
        />
        {error && (
          <p
            id="offer-gate-phone-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? "Submitting…" : "Get Started"}
      </Button>
    </form>
  );
}
