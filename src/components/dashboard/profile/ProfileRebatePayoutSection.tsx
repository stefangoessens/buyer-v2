"use client";

import { useEffect, useState, useTransition } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type RebatePayoutMethod = "bank" | "check" | "cashapp" | "none";

type RebatePayout = {
  method: RebatePayoutMethod;
  accountLast4?: string;
  payoutAddress?: string;
  updatedAt: string;
};

type ProfileWithRebate = {
  rebatePayoutMethod?: RebatePayout;
};

const METHOD_LABELS: Record<RebatePayoutMethod, string> = {
  bank: "Bank transfer",
  check: "Paper check",
  cashapp: "CashApp",
  none: "Choose later",
};

const SECURE_NOTE =
  "We'll collect this securely at first payout time. No bank, routing, or SSN details are stored here.";

export function ProfileRebatePayoutSection() {
  const profile = useQuery(api.buyerProfiles.getMyProfile, {}) as
    | (ProfileWithRebate & Record<string, unknown>)
    | null
    | undefined;
  const updateRebatePayoutMethod = useMutation(
    api.buyerProfiles.updateRebatePayoutMethod,
  );

  const [method, setMethod] = useState<RebatePayoutMethod>("none");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [cashtag, setCashtag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!profile?.rebatePayoutMethod) return;
    setMethod(profile.rebatePayoutMethod.method);
    setPayoutAddress(profile.rebatePayoutMethod.payoutAddress ?? "");
    if (profile.rebatePayoutMethod.method === "cashapp") {
      setCashtag(profile.rebatePayoutMethod.accountLast4 ?? "");
    }
    setSavedAt(profile.rebatePayoutMethod.updatedAt ?? null);
  }, [profile?.rebatePayoutMethod]);

  const isLoading = profile === undefined;
  const lastFour =
    method === "bank" ? profile?.rebatePayoutMethod?.accountLast4 : undefined;

  const handleSave = () => {
    setError(null);
    if (method === "check" && !payoutAddress.trim()) {
      setError("Add an address for paper check delivery.");
      return;
    }
    if (method === "cashapp") {
      const trimmed = cashtag.trim();
      if (!trimmed) {
        setError("Add your $cashtag.");
        return;
      }
      if (!/^\$?[A-Za-z][A-Za-z0-9_]{0,19}$/.test(trimmed)) {
        setError("Cashtag must start with a letter and use up to 20 chars.");
        return;
      }
    }

    startTransition(async () => {
      try {
        await updateRebatePayoutMethod({
          method,
          ...(method === "check"
            ? { payoutAddress: payoutAddress.trim() }
            : {}),
          ...(method === "cashapp"
            ? { accountLast4: cashtag.trim().replace(/^\$/, "") }
            : {}),
        });
        setSavedAt(new Date().toISOString());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save method.");
      }
    });
  };

  return (
    <Card id="rebate-payout">
      <CardHeader>
        <CardTitle>Rebate payout</CardTitle>
        <CardDescription>
          Pick how you'd like to receive your buyer rebate at closing.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isLoading ? (
          <div className="rounded-3xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            Loading payout method…
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="rebate-method">Payout method</Label>
              <Select
                value={method}
                onValueChange={(value) =>
                  setMethod(value as RebatePayoutMethod)
                }
              >
                <SelectTrigger id="rebate-method" className="w-full sm:max-w-xs">
                  <SelectValue placeholder="Choose a method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">
                    {METHOD_LABELS.bank}
                  </SelectItem>
                  <SelectItem value="check">
                    {METHOD_LABELS.check}
                  </SelectItem>
                  <SelectItem value="cashapp">
                    {METHOD_LABELS.cashapp}
                  </SelectItem>
                  <SelectItem value="none">
                    {METHOD_LABELS.none}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {method === "bank" ? (
              <div className="rounded-3xl bg-muted/40 p-4">
                <p className="text-sm font-medium text-foreground">
                  {lastFour
                    ? `Account ending in ••${lastFour}`
                    : "No bank account on file"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {SECURE_NOTE}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled
                >
                  Set up via secure portal
                </Button>
              </div>
            ) : null}

            {method === "check" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="rebate-address">Payout address</Label>
                <Textarea
                  id="rebate-address"
                  placeholder="123 Ocean Dr, Miami, FL 33139"
                  value={payoutAddress}
                  onChange={(e) => setPayoutAddress(e.target.value)}
                  rows={3}
                  autoComplete="street-address"
                />
                <p className="text-xs text-muted-foreground">
                  We'll mail your check here within 10 business days of close.
                </p>
              </div>
            ) : null}

            {method === "cashapp" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="rebate-cashtag">$cashtag</Label>
                <Input
                  id="rebate-cashtag"
                  placeholder="$yourname"
                  value={cashtag}
                  onChange={(e) => setCashtag(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{SECURE_NOTE}</p>
              </div>
            ) : null}

            {method === "none" ? (
              <p className="text-sm text-muted-foreground">
                You can pick a method later — we'll prompt you when an offer
                goes out.
              </p>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {savedAt
                  ? `Saved ${new Date(savedAt).toLocaleDateString()}`
                  : "Not saved yet"}
              </p>
              <Button onClick={handleSave} disabled={isPending}>
                {isPending ? "Saving…" : "Save method"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
