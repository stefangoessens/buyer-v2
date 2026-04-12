"use client";

import { type ReactNode } from "react";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { convex } from "@/lib/convex";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { AccessDeniedCard } from "./AccessDeniedCard";
import { ShellLoadingState } from "./ShellLoadingState";
import { ShellUnavailableCard } from "./ShellUnavailableCard";
import type { NavItem, NavSection } from "@/lib/admin/nav";
import type { InternalConsoleRole } from "@/lib/admin/roles";

export interface AdminShellSession {
  user: {
    _id: string;
    name: string;
    email: string;
    role: InternalConsoleRole;
  };
  navItems: NavItem[];
  snapshot: {
    openReviewItems: number;
    urgentReviewItems: number;
    latestKpiComputedAt: string | null;
    pendingOverrideCount: number;
  };
}

/**
 * Wrap every admin page in this component. It resolves the current
 * internal-console session from Convex and renders three states:
 *
 *   1. loading — the Convex query is in flight
 *   2. denied — the user is logged out or not broker/admin
 *   3. authorized — sidebar + topbar + page content
 *
 * The server-side `adminShell.getCurrentSession` query enforces the role
 * boundary. This component only reflects its answer; it does not make
 * authorization decisions itself.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  // When `NEXT_PUBLIC_CONVEX_URL` is not configured the root Providers
  // tree omits ConvexProvider entirely, so `useQuery` would throw. Render
  // a friendly unavailable state so the shell still loads in a broken
  // deploy instead of a raw React error screen.
  if (!convex) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
        <ShellUnavailableCard />
      </div>
    );
  }

  return <AdminShellLive>{children}</AdminShellLive>;
}

function AdminShellLive({ children }: { children: ReactNode }) {
  const session = useQuery(api.adminShell.getCurrentSession) as
    | AdminShellSession
    | null
    | undefined;
  const pathname = usePathname();

  if (session === undefined) {
    return <ShellLoadingState />;
  }

  if (session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
        <AccessDeniedCard />
      </div>
    );
  }

  // Cast nav items — Convex returns them with literal union types
  // matching `NavItem`. We avoid `as` at the call site by tagging here.
  const navItems = session.navItems as unknown as NavItem[];

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <AdminSidebar
        navItems={navItems}
        pathname={pathname}
        role={session.user.role}
        openReviewItems={session.snapshot.openReviewItems}
        urgentReviewItems={session.snapshot.urgentReviewItems}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          user={session.user}
          snapshot={session.snapshot}
        />
        <main
          id="admin-main"
          className="flex-1 min-w-0 px-8 py-8"
          role="main"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

// Re-export nav types so pages can import them without reaching across layers.
export type { NavItem, NavSection };
