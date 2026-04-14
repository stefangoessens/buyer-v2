import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ComparisonRow = {
  feature: string;
  buyerV2: string | boolean;
  traditional: string | boolean;
};

const ROWS: ComparisonRow[] = [
  {
    feature: "Up-front cost to buyer",
    buyerV2: "$0",
    traditional: "$0",
  },
  {
    feature: "Buyer credit at closing",
    buyerV2: "~50% of buyer-agent commission",
    traditional: false,
  },
  {
    feature: "Time from offer to close (median)",
    buyerV2: "32 days",
    traditional: "45 days",
  },
  {
    feature: "Instant AI pricing & comps",
    buyerV2: true,
    traditional: false,
  },
  {
    feature: "Licensed Florida broker review",
    buyerV2: true,
    traditional: true,
  },
  {
    feature: "AI-assisted offer drafting",
    buyerV2: true,
    traditional: false,
  },
  {
    feature: "Showing agent dispatch",
    buyerV2: true,
    traditional: true,
  },
  {
    feature: "Auditable AI recommendations",
    buyerV2: true,
    traditional: false,
  },
  {
    feature: "Deal room with timeline & docs",
    buyerV2: true,
    traditional: false,
  },
  {
    feature: "Hidden tiers or upsells",
    buyerV2: false,
    traditional: "Varies",
  },
];

function Cell({ value, accent }: { value: string | boolean; accent?: boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center gap-2">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className={accent ? "size-5 text-primary" : "size-5 text-emerald-600"}
        />
        <span className="sr-only">Yes</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-2">
        <HugeiconsIcon
          icon={Cancel01Icon}
          strokeWidth={2}
          className="size-5 text-muted-foreground/60"
        />
        <span className="sr-only">No</span>
      </span>
    );
  }
  return (
    <span
      className={
        accent
          ? "text-sm font-medium text-foreground"
          : "text-sm text-muted-foreground"
      }
    >
      {value}
    </span>
  );
}

export function PricingComparisonTable() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          buyer-v2 vs a traditional buyer agent
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Same Florida license, same fiduciary duties, same closing table. The
          difference is the AI underneath and the credit you keep.
        </p>
      </div>

      <div className="mt-14 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <Table>
          <TableCaption className="sr-only">
            Side-by-side comparison of buyer-v2 versus a traditional Florida
            buyer agent.
          </TableCaption>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-1/2 py-5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Feature
              </TableHead>
              <TableHead className="w-1/4 py-5 text-sm font-semibold text-foreground">
                buyer-v2
              </TableHead>
              <TableHead className="w-1/4 py-5 text-sm font-medium text-muted-foreground">
                Traditional agent
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => (
              <TableRow key={row.feature} className="border-border/40">
                <TableCell className="py-5 text-sm font-medium text-foreground whitespace-normal">
                  {row.feature}
                </TableCell>
                <TableCell className="py-5 whitespace-normal">
                  <Cell value={row.buyerV2} accent />
                </TableCell>
                <TableCell className="py-5 whitespace-normal">
                  <Cell value={row.traditional} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Median time-to-close based on buyer-v2 transactions Q1 2026. Individual
        results vary by deal complexity and lender.
      </p>
    </section>
  );
}
