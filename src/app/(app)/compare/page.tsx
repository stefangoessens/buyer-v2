import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Compare | buyer-v2",
  description: "Compare your shortlisted properties side-by-side.",
};

export default function ComparePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Compare
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Compare properties
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Side-by-side view of your shortlisted deal rooms.
        </p>
      </header>
      <Card>
        <CardContent className="py-16 text-center text-sm text-neutral-500">
          Add properties to your comparison from any deal room.
        </CardContent>
      </Card>
    </div>
  );
}
