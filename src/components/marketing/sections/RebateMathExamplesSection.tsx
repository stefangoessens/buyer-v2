import { Card, CardContent } from "@/components/ui/card";

type RebateExample = {
  listPrice: number;
  buyerAgentCommission: number;
  rebate: number;
};

const EXAMPLES: RebateExample[] = [
  { listPrice: 350_000, buyerAgentCommission: 8_750, rebate: 4_375 },
  { listPrice: 600_000, buyerAgentCommission: 15_000, rebate: 7_500 },
  { listPrice: 1_200_000, buyerAgentCommission: 30_000, rebate: 15_000 },
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function RebateMathExamplesSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          See the math
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Three worked examples at common Florida price points. You keep roughly
          1.25% of the purchase price as a credit at closing.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
        {EXAMPLES.map((example) => (
          <Card
            key={example.listPrice}
            className="flex flex-col gap-5 p-8 transition-transform duration-300 hover:-translate-y-1"
          >
            <CardContent className="flex flex-col gap-5 p-0">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  List price
                </p>
                <p className="mt-2 font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  {currency.format(example.listPrice)}
                </p>
              </div>

              <div className="border-t border-border/60 pt-4">
                <p className="text-sm text-muted-foreground">
                  Buyer agent commission:{" "}
                  <span className="font-medium text-foreground">
                    {currency.format(example.buyerAgentCommission)}
                  </span>{" "}
                  (2.5%)
                </p>
              </div>

              <div className="rounded-2xl bg-primary/10 px-5 py-4 ring-1 ring-primary/20">
                <p className="text-xs font-medium uppercase tracking-wider text-primary">
                  You keep
                </p>
                <p className="mt-1 font-heading text-3xl font-semibold tracking-tight text-primary">
                  {currency.format(example.rebate)}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                After credit at closing
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
