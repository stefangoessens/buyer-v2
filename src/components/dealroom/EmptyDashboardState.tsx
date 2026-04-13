import { Card, CardContent } from "@/components/ui/card";

export function EmptyDashboardState() {
  return (
    <Card className="border border-dashed border-neutral-300 bg-neutral-50/60">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.027a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757"
            />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-neutral-900">
            Paste a listing to get started
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Your first deal room will appear here as soon as you drop a
            Zillow, Redfin, or Realtor.com link above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
