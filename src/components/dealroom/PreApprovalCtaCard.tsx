"use client";

import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PreApprovalCtaCard() {
  return (
    <Card className="border-primary-200 bg-primary-50/30">
      <CardHeader>
        <CardTitle>Get pre-approved</CardTitle>
        <CardDescription>
          Sellers take buyers with a pre-approval letter ~3x more seriously.
          Upload yours or request one through our partner lender network.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button asChild>
          <Link href="/dashboard/profile">Upload pre-approval</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-up?next=/dashboard/profile">
            Get one from a partner
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
