"use client";

import { ConvexProvider } from "convex/react";
import { type ReactNode, useEffect } from "react";
import { convex } from "@/lib/convex";
import { initPostHog } from "@/lib/posthog";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
