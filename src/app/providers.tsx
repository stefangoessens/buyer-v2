"use client";

import { ConvexProvider } from "convex/react";
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
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </PostHogProvider>
  );
}
