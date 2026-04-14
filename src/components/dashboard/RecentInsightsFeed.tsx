"use client";

import { Card, CardContent } from "@/components/ui/card";

export function RecentInsightsFeed() {
  const placeholder = [
    {
      id: 1,
      address: "1234 Ocean Blvd, Miami",
      category: "Pricing",
      severity: "info" as const,
      summary: "Listed 3% above comp set median",
      time: "2h ago",
    },
    {
      id: 2,
      address: "567 Palm Ave, Tampa",
      category: "Climate risk",
      severity: "warning" as const,
      summary: "FEMA flood zone AE — review insurance carefully",
      time: "1 day ago",
    },
  ];

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Recent AI insights
      </h2>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {placeholder.map((insight) => (
            <div key={insight.id} className="flex items-start gap-3 p-4">
              <div
                className={`mt-2 size-2 shrink-0 rounded-full ${
                  insight.severity === "warning"
                    ? "bg-warning-500"
                    : "bg-primary-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {insight.address}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {insight.time}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {insight.category} — {insight.summary}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
