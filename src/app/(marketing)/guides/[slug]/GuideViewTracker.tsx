"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Route-scoped analytics hook for `/guides/[slug]`. Mounted once by
 * the page component so the server component can stay static while
 * still emitting the client-side `guide_page_viewed` event (KIN-1090).
 */
export function GuideViewTracker({
  guideSlug,
  guideCategory,
}: {
  guideSlug: string;
  guideCategory: string;
}) {
  useEffect(() => {
    track("guide_page_viewed", { guideSlug, guideCategory });
  }, [guideSlug, guideCategory]);
  return null;
}
