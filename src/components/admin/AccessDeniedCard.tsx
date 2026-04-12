import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Rendered in place of the shell when the current user is not authorized
 * for the internal console — unauthenticated, buyer, or unknown session.
 * No data from any other surface is rendered here; this is the only thing
 * the caller sees.
 */
export function AccessDeniedCard() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Internal console access required</CardTitle>
        <CardDescription>
          This area is restricted to Kindservices staff. If you landed here by
          mistake, head back to your dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button asChild>
          <Link href="/">Back to homepage</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to buyer dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
