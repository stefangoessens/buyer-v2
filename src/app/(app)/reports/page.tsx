import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Reports | buyer-v2",
  description: "All your deal-room reports and analyses.",
};

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Reports
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Deal room reports
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every analysis you&apos;ve opened, with pricing and leverage output.
        </p>
      </header>
      <Card>
        <CardContent className="py-16 text-center text-sm text-neutral-500">
          Reports list rolls out next — head to your Dashboard for now.
        </CardContent>
      </Card>
    </div>
  );
}
