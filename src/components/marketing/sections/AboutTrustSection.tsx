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
import type { AboutTrustContent } from "@/content/about";

const ICON_BY_BADGE: Record<string, typeof LicenseIcon> = {
  "florida-licensed": LicenseIcon,
  "broker-oversight": UserCheck01Icon,
  "auditable-ai": Certificate01Icon,
};

export function AboutTrustSection({ trust }: { trust: AboutTrustContent }) {
  return (
    <section className="mx-auto w-full max-w-[1248px] px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {trust.eyebrow}
        </p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {trust.title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {trust.description}
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
        {trust.badges.map((badge) => {
          const icon = ICON_BY_BADGE[badge.id] ?? LicenseIcon;
          return (
            <Card key={badge.id} className="h-full">
              <CardHeader>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <HugeiconsIcon
                    icon={icon}
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
          );
        })}
      </div>
    </section>
  );
}
