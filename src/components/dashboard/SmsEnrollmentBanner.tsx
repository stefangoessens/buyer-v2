"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SmsEnrollmentModal } from "./SmsEnrollmentModal";

export function SmsEnrollmentBanner() {
  const profile = useQuery(api.buyerProfiles.getMyProfile, {});
  const [open, setOpen] = useState(false);

  if (!profile || profile.sms.phoneVerifiedAt) {
    return null;
  }

  return (
    <>
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary-50 via-white to-accent-50 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-700">
              SMS Enrollment
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              Verify one phone number to unlock texts from buyer-v2.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;ll use it for callback confirmations, tour reminders, offer
              alerts, and texting listing links straight into your dashboard.
            </p>
            {profile.identity.phone ? (
              <p className="mt-3 text-sm text-foreground">
                Current number on file: <span className="font-medium">{profile.identity.phone}</span>
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Button onClick={() => setOpen(true)}>Enable SMS</Button>
          </div>
        </div>
      </Card>

      <SmsEnrollmentModal
        open={open}
        onOpenChange={setOpen}
        initialPhone={profile.identity.phone}
      />
    </>
  );
}
