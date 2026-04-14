import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type AgreementsEmptyStateProps = {
  className?: string;
};

export function AgreementsEmptyState({ className }: AgreementsEmptyStateProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>No agreements yet</CardTitle>
        <CardDescription>
          Buyer broker agreements you sign in a deal room will appear here. Tour
          passes and full representation agreements show up grouped by property,
          with their full supersession history.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-3xl bg-muted/40 px-4 py-6 text-sm text-muted-foreground ring-1 ring-inset ring-border/40">
          <p className="font-medium text-foreground">
            How agreements get here
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs">
            <li>
              1. Open a deal room and ask your broker to start an agreement.
            </li>
            <li>2. Review and sign the agreement inside the deal room.</li>
            <li>
              3. Signed copies appear here automatically, grouped by property.
            </li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/deals">Browse deal rooms</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
