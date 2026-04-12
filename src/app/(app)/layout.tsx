import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/app/dashboard-shell";
import { BUYER_SESSION_COOKIE } from "@/lib/onboarding/types";
import { parseBuyerSessionCookie } from "@/lib/onboarding/storage";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const session = parseBuyerSessionCookie(
    cookieStore.get(BUYER_SESSION_COOKIE)?.value
  );

  if (!session) {
    redirect("/onboarding");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
