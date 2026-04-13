"use client";

import { ConvexReactClient } from "convex/react";

// Static access so Next.js can inline the value at build time.
// Dynamic lookup via `readPublicEnv(process.env)` returns "" in the
// client bundle because Next can only replace literal `process.env.X`
// references — not `source[key]` destructuring through helpers.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export const convex = convexUrl
  ? new ConvexReactClient(convexUrl)
  : null;
