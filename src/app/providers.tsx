"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { type ReactNode } from "react";
import { convex } from "@/lib/convex";
import { PostHogProvider, PostHogPageView } from "@/lib/posthog";

export function Providers({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <PostHogProvider>
        <PostHogPageView />
        {children}
      </PostHogProvider>
    );
  }

  return (
    <PostHogProvider>
      <PostHogPageView />
      <ConvexAuthNextjsProvider client={convex}>
        {children}
      </ConvexAuthNextjsProvider>
    </PostHogProvider>
  );
}
