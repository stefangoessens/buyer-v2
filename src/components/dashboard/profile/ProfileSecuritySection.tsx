"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type SecurityRow = {
  title: string;
  description: string;
  control: "button" | "switch";
};

const ROWS: SecurityRow[] = [
  {
    title: "Password",
    description: "Update the password you use to sign in.",
    control: "button",
  },
  {
    title: "Active sessions",
    description: "See where you're signed in and revoke devices.",
    control: "button",
  },
  {
    title: "Two-factor auth",
    description: "Add a second sign-in step using an authenticator app.",
    control: "switch",
  },
];

export function ProfileSecuritySection() {
  return (
    <Card id="security">
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>
          Account safety controls. We&apos;re rolling these out — check back soon.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border/60">
        {ROWS.map((row) => (
          <div
            key={row.title}
            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {row.title}
                </p>
                <Badge className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
                  Coming soon
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.description}
              </p>
            </div>
            <div className="shrink-0">
              {row.control === "button" ? (
                <Button size="sm" variant="outline" disabled>
                  Manage
                </Button>
              ) : (
                <Switch checked={false} disabled aria-label={row.title} />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
