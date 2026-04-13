"use client";

import { ConvexReactClient } from "convex/react";
import { env } from "@/lib/env";

const convexUrl = env.NEXT_PUBLIC_CONVEX_URL;

export const convex = convexUrl
  ? new ConvexReactClient(convexUrl)
  : null;
