import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Rendered when `NEXT_PUBLIC_CONVEX_URL` is not configured. The admin
 * shell depends on live Convex queries, so without a backend URL there
 * is nothing to render — we explain the state instead of crashing.
 */
export function ShellUnavailableCard() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Console backend unavailable</CardTitle>
        <CardDescription>
          The internal console could not reach the Convex backend. Check that
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_CONVEX_URL
          </code>
          is set for this deployment.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        If you are a Kindservices broker or admin, ask the engineering team to
        re-run the platform bootstrap and retry.
      </CardContent>
    </Card>
  );
}
