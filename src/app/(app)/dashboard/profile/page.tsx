import type { Metadata } from "next";

import { ProfileAgreementsHistorySection } from "@/components/dashboard/profile/ProfileAgreementsHistorySection";
import { ProfileContactPreferencesSection } from "@/components/dashboard/profile/ProfileContactPreferencesSection";
import { ProfileDangerZoneSection } from "@/components/dashboard/profile/ProfileDangerZoneSection";
import { ProfileIdentitySection } from "@/components/dashboard/profile/ProfileIdentitySection";
import { ProfileRebatePayoutSection } from "@/components/dashboard/profile/ProfileRebatePayoutSection";
import { ProfileSavedSearchesSection } from "@/components/dashboard/profile/ProfileSavedSearchesSection";
import { ProfileSearchCriteriaSection } from "@/components/dashboard/profile/ProfileSearchCriteriaSection";
import { ProfileSecuritySection } from "@/components/dashboard/profile/ProfileSecuritySection";
import { ProfileSidebarNav } from "@/components/dashboard/profile/ProfileSidebarNav";
import { metadataForStaticPage } from "@/lib/seo/pageDefinitions";

export const metadata: Metadata = metadataForStaticPage("dashboardProfile");

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Profile
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Account &amp; preferences
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, notifications, and buyer preferences.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <ProfileSidebarNav />
        <div className="flex min-w-0 flex-col gap-8">
          <ProfileIdentitySection />
          <ProfileContactPreferencesSection />
          <ProfileSecuritySection />
          <ProfileSearchCriteriaSection />
          <ProfileSavedSearchesSection />
          <ProfileRebatePayoutSection />
          <ProfileAgreementsHistorySection />
          <ProfileDangerZoneSection />
        </div>
      </div>
    </div>
  );
}
