"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Route-scoped analytics hook for `/our-process`. Mounted once by
 * the page component so the server component can stay static while
 * still emitting a client-side page-view event (KIN-1090).
 */
export function PageViewTracker() {
  useEffect(() => {
    track("our_process_page_viewed", {});
  }, []);
  return null;
}
