import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "./ScoreBadge";
import { StatusBadge } from "./StatusBadge";

interface PropertyCardProps {
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  score?: number;
  imageUrl?: string;
  status?: "active" | "pending" | "closed" | "urgent" | "draft";
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function PropertyCard({
  address,
  city,
  price,
  beds,
  baths,
  sqft,
  score,
  imageUrl,
  status,
}: PropertyCardProps) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="relative aspect-video">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={address}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-neutral-200" />
        )}
        {score != null && (
          <div className="absolute top-3 right-3">
            <ScoreBadge score={score} size="sm" />
          </div>
        )}
      </div>
      <CardContent className="space-y-2 p-4">
        <div>
          <p className="truncate font-semibold text-foreground">{address}</p>
          <p className="text-sm text-muted-foreground">{city}</p>
        </div>
        <p className="text-xl font-bold text-primary-700">
          {formatPrice(price)}
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{beds} bd</span>
          <span className="text-neutral-300">|</span>
          <span>{baths} ba</span>
          <span className="text-neutral-300">|</span>
          <span>{formatNumber(sqft)} sqft</span>
        </div>
        {status && (
          <div className="pt-1">
            <StatusBadge status={status} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
