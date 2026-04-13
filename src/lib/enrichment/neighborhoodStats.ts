import type {
  GeoKind,
  MarketTrajectory,
  NeighborhoodContext,
  NeighborhoodSale,
} from "./types";

export interface NeighborhoodComputeInput {
  geoKey: string;
  geoKind: GeoKind;
  windowDays: number;
  sales: NeighborhoodSale[];
  fetchedAt: string;
  sourceLabel: string;
}

export function computeNeighborhoodContext(
  input: NeighborhoodComputeInput,
): NeighborhoodContext {
  const { sales } = input;
  const soldSales = sales.filter((s) => s.status === "sold");
  const activeSales = sales.filter((s) => s.status === "active");
  const pendingSales = sales.filter((s) => s.status === "pending");

  const doms = soldSales
    .map((s) => s.dom)
    .filter((d): d is number => typeof d === "number");
  const psfs = soldSales
    .filter((s) => typeof s.sqft === "number" && (s.sqft as number) > 0)
    .map((s) => s.soldPrice / (s.sqft as number));
  const listPrices = activeSales
    .map((s) => s.listPrice)
    .filter((v): v is number => typeof v === "number");

  const medianDom = median(doms) ?? undefined;
  const medianPricePerSqft = median(psfs) ?? undefined;
  const medianListPrice = median(listPrices) ?? undefined;

  return {
    geoKey: input.geoKey,
    geoKind: input.geoKind,
    windowDays: input.windowDays,
    medianDom,
    medianPricePerSqft,
    medianListPrice,
    inventoryCount: activeSales.length,
    pendingCount: pendingSales.length,
    salesVelocity: computeSalesVelocity(sales, input.windowDays),
    trajectory: computeTrajectory(sales) ?? undefined,
    provenance: { source: input.sourceLabel, fetchedAt: input.fetchedAt },
    lastRefreshedAt: input.fetchedAt,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function computeTrajectory(
  sales: NeighborhoodSale[],
): MarketTrajectory | null {
  const sold = sales
    .filter(
      (s) =>
        s.status === "sold" &&
        typeof s.sqft === "number" &&
        (s.sqft as number) > 0,
    )
    .map((s) => ({
      psf: s.soldPrice / (s.sqft as number),
      ts: Date.parse(s.soldDate),
    }))
    .filter((s) => !Number.isNaN(s.ts))
    .sort((a, b) => a.ts - b.ts);

  if (sold.length < 4) return null;

  const mid = Math.floor(sold.length / 2);
  const firstHalf = sold.slice(0, mid).map((s) => s.psf);
  const secondHalf = sold.slice(mid).map((s) => s.psf);

  const firstMedian = median(firstHalf);
  const secondMedian = median(secondHalf);
  if (firstMedian == null || secondMedian == null || firstMedian === 0) {
    return null;
  }

  const delta = (secondMedian - firstMedian) / firstMedian;
  if (delta > 0.03) return "rising";
  if (delta < -0.03) return "falling";
  return "flat";
}

export function computeSalesVelocity(
  sales: NeighborhoodSale[],
  windowDays: number,
): number {
  if (windowDays <= 0) return 0;
  const soldCount = sales.filter((s) => s.status === "sold").length;
  return soldCount / windowDays;
}
