import { HugeiconsIcon } from "@hugeicons/react";
import {
  LicenseIcon,
  UserCheck01Icon,
  Certificate01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TRUST_BADGES = [
  {
    icon: LicenseIcon,
    pill: "FL DBPR · License #BK-3000000",
    title: "Florida-licensed brokerage",
    description:
      "Every transaction runs through a registered Florida real estate brokerage in good standing with the Department of Business and Professional Regulation.",
  },
  {
    icon: UserCheck01Icon,
    pill: "Broker oversight",
    title: "A human broker signs every move",
    description:
      "Buyer representation agreements, compensation disclosures, and contract terms are reviewed and signed off by a licensed Florida broker — never the AI alone.",
  },
  {
    icon: Certificate01Icon,
    pill: "Auditable AI",
    title: "Citations on every recommendation",
    description:
      "Pricing, comps, and negotiation guidance ship with confidence scores and source citations so you can audit how each conclusion was reached.",
  },
] as const;

export function HowItWorksTrustSection() {
  return (
    <section className="mx-auto w-full max-w-[1248px] px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Trust &amp; compliance
        </p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Florida-licensed brokerage. Every recommendation auditable.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          AI does the heavy lifting. A licensed broker signs the work. You see
          the receipts on every step.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
        {TRUST_BADGES.map((badge) => (
          <Card key={badge.title} className="h-full">
            <CardHeader>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <HugeiconsIcon
                  icon={badge.icon}
                  strokeWidth={1.75}
                  className="size-6"
                />
              </div>
              <span className="mt-4 inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {badge.pill}
              </span>
              <CardTitle className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                {badge.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                {badge.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
