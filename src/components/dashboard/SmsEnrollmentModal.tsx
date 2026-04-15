"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SmsEnrollmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhone?: string;
}

type Step = "phone" | "code" | "success";

export function SmsEnrollmentModal({
  open,
  onOpenChange,
  initialPhone,
}: SmsEnrollmentModalProps) {
  const startEnrollment = useAction(api.sms.twilioVerify.startEnrollment);
  const checkEnrollment = useAction(api.sms.twilioVerify.checkEnrollment);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [verificationPhone, setVerificationPhone] = useState("");
  const [code, setCode] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [policyVersion, setPolicyVersion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("phone");
      setCode("");
      setVerificationPhone("");
      setSenderNumber("");
      setPolicyVersion("");
      setIsSubmitting(false);
      return;
    }
    setPhone(initialPhone ?? "");
  }, [initialPhone, open]);

  async function handleSendCode() {
    setIsSubmitting(true);
    try {
      const result = await startEnrollment({
        phone,
        consentSource: "dashboard_banner",
      });
      setVerificationPhone(result.phone);
      setStep("code");
      toast.success("Verification code sent");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send verification code",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode() {
    setIsSubmitting(true);
    try {
      const result = await checkEnrollment({
        phone: verificationPhone || phone,
        code,
        consentSource: "dashboard_banner",
      });
      if (!result.approved) {
        toast.error("That code did not match. Please try again.");
        return;
      }
      setSenderNumber(result.senderNumber);
      setPolicyVersion(result.policyVersion);
      setStep("success");
      toast.success("SMS is now enabled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not verify the code",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Turn on SMS updates</DialogTitle>
          <DialogDescription>
            Verify one phone number to unlock transactional texts and the
            SMS-to-deal-room intake flow.
          </DialogDescription>
        </DialogHeader>

        {step === "phone" ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              We only text for deal-critical updates and listing intake. Reply
              STOP anytime to opt out.
            </div>
            <div className="space-y-2">
              <Label htmlFor="sms-enrollment-phone">Phone number</Label>
              <Input
                id="sms-enrollment-phone"
                type="tel"
                autoComplete="tel"
                placeholder="(305) 555-0123"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {step === "code" ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              Enter the code we texted to <span className="font-medium text-foreground">{verificationPhone}</span>.
            </div>
            <div className="space-y-2">
              <Label htmlFor="sms-enrollment-code">Verification code</Label>
              <Input
                id="sms-enrollment-code"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {step === "success" ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Your phone is verified. SMS alerts are now enabled for
              transactional updates.
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                Sender number: <span className="font-medium text-foreground">{senderNumber || "Configured Twilio sender"}</span>
              </p>
              <p>
                Consent policy version: <span className="font-medium text-foreground">{policyVersion}</span>
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {step === "phone" ? (
            <Button onClick={handleSendCode} disabled={isSubmitting || phone.trim().length === 0}>
              {isSubmitting ? "Sending…" : "Send code"}
            </Button>
          ) : null}
          {step === "code" ? (
            <Button onClick={handleVerifyCode} disabled={isSubmitting || code.trim().length < 4}>
              {isSubmitting ? "Verifying…" : "Verify phone"}
            </Button>
          ) : null}
          {step === "success" ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
