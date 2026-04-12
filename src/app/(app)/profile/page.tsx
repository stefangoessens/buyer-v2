import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Profile | buyer-v2",
  description: "Account, notifications, and buyer preferences.",
};

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Profile
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Account &amp; preferences
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage your account, notifications, and buyer preferences.
        </p>
      </header>
      <Card>
        <CardContent className="py-16 text-center text-sm text-neutral-500">
          Preference editing rolls out alongside onboarding.
        </CardContent>
      </Card>
    </div>
  );
}
