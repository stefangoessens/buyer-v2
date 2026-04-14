"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const STEP_LABEL: Record<PortfolioDeal["currentStep"], string> = {
  details: "Details",
  price: "Pricing",
  disclosures: "Disclosures",
  offer: "Offer",
  close: "Closing",
};

const SEVERITY_PILL_CLASSES: Record<
  PortfolioDeal["nextAction"]["severity"],
  string
> = {
  info: "bg-primary/10 text-primary ring-primary/20",
  warning:
    "bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  error: "bg-destructive/10 text-destructive ring-destructive/20",
};

type PortfolioDeal = {
  dealRoomId: string;
  propertyId: string;
  address: string;
  city: string;
  listPrice: number;
  photoUrl: string | null;
  currentStep: "details" | "price" | "disclosures" | "offer" | "close";
  nextAction: {
    label: string;
    href: string;
    severity: "info" | "warning" | "error";
  };
};

export function ActiveDealsGrid() {
  const portfolio = useQuery(api.dashboardPortfolio.getPortfolio, {});

  if (portfolio === undefined) {
    return (
      <Card className="py-16 text-center text-sm text-muted-foreground">
        Loading deals…
      </Card>
    );
  }

  if (portfolio.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Active deals
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {portfolio.map((deal) => (
          <DealCard key={deal.dealRoomId} deal={deal} />
        ))}
      </div>
    </section>
  );
}

function DealCard({ deal }: { deal: PortfolioDeal }) {
  return (
    <Link
      href={deal.nextAction.href}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-4xl"
    >
      <Card className="h-full overflow-hidden p-0 transition-all hover:ring-2 hover:ring-primary/40 hover:shadow-md">
        <div className="relative aspect-video bg-muted">
          {deal.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={deal.photoUrl}
              alt={deal.address}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Photo unavailable
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-foreground ring-1 ring-inset ring-foreground/10 backdrop-blur">
            {STEP_LABEL[deal.currentStep]}
          </span>
        </div>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {deal.address}
          </p>
          {deal.city && (
            <p className="text-xs text-muted-foreground">{deal.city}</p>
          )}
          <p className="text-lg font-bold text-primary">
            {deal.listPrice > 0
              ? currencyFormatter.format(deal.listPrice)
              : "Price pending"}
          </p>
          <span
            className={`mt-2 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${SEVERITY_PILL_CLASSES[deal.nextAction.severity]}`}
          >
            {deal.nextAction.label}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
