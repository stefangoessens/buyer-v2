export interface AgentListingSample {
  listPrice: number;
  soldPrice?: number;
  dom?: number;
  priceCutCount?: number;
  status: "active" | "pending" | "sold" | "withdrawn";
}

export function computeMedianListToSellRatio(
  samples: AgentListingSample[],
): number | null {
  const ratios: number[] = [];
  for (const s of samples) {
    if (s.status !== "sold") continue;
    if (s.soldPrice == null || s.listPrice <= 0) continue;
    ratios.push(s.soldPrice / s.listPrice);
  }
  if (ratios.length === 0) return null;
  return medianNumber(ratios);
}

export function computeAvgDaysOnMarket(
  samples: AgentListingSample[],
): number | null {
  const doms: number[] = [];
  for (const s of samples) {
    if (s.status !== "sold") continue;
    if (typeof s.dom === "number") doms.push(s.dom);
  }
  if (doms.length === 0) return null;
  const sum = doms.reduce((a, b) => a + b, 0);
  return sum / doms.length;
}

export function computePriceCutFrequency(
  samples: AgentListingSample[],
): number {
  if (samples.length === 0) return 0;
  const cut = samples.filter((s) => (s.priceCutCount ?? 0) > 0).length;
  return cut / samples.length;
}

export function countActive(samples: AgentListingSample[]): number {
  return samples.filter((s) => s.status === "active").length;
}

export function countSold(samples: AgentListingSample[]): number {
  return samples.filter((s) => s.status === "sold").length;
}

export function canonicalizeAgentId(args: {
  name: string;
  brokerage?: string;
}): string {
  const nameSlug = slugify(args.name);
  const brokerageSlug = args.brokerage ? args.brokerage.trim().toLowerCase() : "";
  return `${nameSlug}::${brokerageSlug}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
