import Image from "next/image";
import { fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FavouriteButton } from "@/components/property/FavouriteButton";

const PRICE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

interface PropertyWizardHeaderProps {
  propertyId: string;
}

function formatBaths(full?: number, half?: number): string | null {
  if (full == null && half == null) return null;
  const total = (full ?? 0) + (half ?? 0) * 0.5;
  if (total === 0) return null;
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}

function formatAddress(address: {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  formatted?: string;
}): { line1: string; line2: string } {
  if (address.formatted) {
    const [first, ...rest] = address.formatted.split(",");
    return {
      line1: first?.trim() ?? address.street,
      line2:
        rest.join(",").trim() ||
        `${address.city}, ${address.state} ${address.zip}`,
    };
  }
  return {
    line1: address.unit
      ? `${address.street}, ${address.unit}`
      : address.street,
    line2: `${address.city}, ${address.state} ${address.zip}`,
  };
}

export async function PropertyWizardHeader({
  propertyId,
}: PropertyWizardHeaderProps) {
  let property: Awaited<ReturnType<typeof fetchQuery<typeof api.properties.getPublic>>> | null = null;
  try {
    property = await fetchQuery(api.properties.getPublic, {
      propertyId: propertyId as Id<"properties">,
    });
  } catch {
    property = null;
  }

  const token = await convexAuthNextjsToken();
  const isAuthenticated = !!token;

  if (!property) {
    return (
      <header className="rounded-3xl border border-border bg-white p-6">
        <p className="text-sm font-medium text-muted-foreground">
          Property not found
        </p>
      </header>
    );
  }

  const { line1, line2 } = formatAddress(property.address);
  const priceDisplay = property.listPrice
    ? PRICE_FORMATTER.format(property.listPrice)
    : null;
  const bathsDisplay = formatBaths(property.bathsFull, property.bathsHalf);
  const primaryPhoto = property.photoUrls?.[0];

  const stats: Array<{ label: string; value: string }> = [];
  if (property.beds != null) {
    stats.push({ label: "Beds", value: String(property.beds) });
  }
  if (bathsDisplay) {
    stats.push({ label: "Baths", value: bathsDisplay });
  }
  if (property.sqftLiving != null) {
    stats.push({
      label: "Sqft",
      value: NUMBER_FORMATTER.format(property.sqftLiving),
    });
  }

  return (
    <header className="flex flex-col gap-6 rounded-3xl border border-border bg-white p-6 lg:flex-row lg:items-center lg:gap-8">
      {primaryPhoto ? (
        <div className="relative h-48 w-full overflow-hidden rounded-2xl bg-muted lg:h-40 lg:w-64 lg:flex-shrink-0">
          <Image
            src={primaryPhoto}
            alt={line1}
            fill
            sizes="(min-width: 1024px) 16rem, 100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="h-48 w-full rounded-2xl bg-muted lg:h-40 lg:w-64 lg:flex-shrink-0"
        />
      )}

      <div className="flex flex-1 flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
            {line1}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{line2}</p>
        </div>

        {stats.length > 0 && (
          <ul className="flex flex-wrap items-center gap-2">
            {stats.map((stat) => (
              <li
                key={stat.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-neutral-700"
              >
                <span className="font-semibold text-foreground">
                  {stat.value}
                </span>
                <span className="text-muted-foreground">{stat.label}</span>
              </li>
            ))}
          </ul>
        )}

        {priceDisplay && (
          <p className="text-3xl font-semibold text-primary-700 lg:text-4xl">
            {priceDisplay}
          </p>
        )}
      </div>

      <div className="flex flex-row gap-2 lg:flex-col lg:items-end">
        <FavouriteButton
          propertyId={property._id}
          isAuthenticated={isAuthenticated}
        />
        <Button variant="outline" size="sm">
          Share
        </Button>
        <Button variant="outline" size="sm">
          Schedule tour
        </Button>
      </div>
    </header>
  );
}
