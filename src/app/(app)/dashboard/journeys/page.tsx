import type { Metadata } from "next";

import { JourneysPage } from "@/components/dashboard/journeys/JourneysPage";

export const metadata: Metadata = {
  title: "Journeys",
  description: "Every property you're working on, with next steps.",
};

export default function DashboardJourneysPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          My Journeys
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Your properties
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every property you&apos;re working on, with what to do next.
        </p>
      </header>
      <JourneysPage />
    </div>
  );
}
