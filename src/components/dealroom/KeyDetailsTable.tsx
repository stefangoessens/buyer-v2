"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface KeyDetailsTableProps {
  yearBuilt?: number;
  stories?: number;
  daysOnMarket?: number;
  pool?: boolean;
  lotSize?: number;
  hoaFee?: number;
  hoaFrequency?: string;
  associationName?: string;
}

export function KeyDetailsTable(props: KeyDetailsTableProps) {
  const rows: Array<[string, string]> = [];
  if (props.yearBuilt) rows.push(["Year built", String(props.yearBuilt)]);
  if (props.stories) rows.push(["Stories", String(props.stories)]);
  if (props.daysOnMarket != null)
    rows.push(["Days on market", `${props.daysOnMarket} days`]);
  if (props.pool != null) rows.push(["Pool", props.pool ? "Yes" : "No"]);
  if (props.lotSize)
    rows.push(["Lot size", `${props.lotSize.toLocaleString()} sqft`]);
  if (props.hoaFee)
    rows.push(["HOA fee", `$${props.hoaFee}/${props.hoaFrequency || "month"}`]);
  if (props.associationName)
    rows.push(["Association", props.associationName]);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between border-b border-neutral-100 pb-2 last:border-0"
            >
              <dt className="text-neutral-500">{k}</dt>
              <dd className="font-medium text-neutral-800">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
