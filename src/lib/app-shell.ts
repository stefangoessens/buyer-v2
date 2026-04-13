import type { Metadata } from "next";
import { env } from "@/lib/env";

type SurfaceAccess = "public" | "gated" | "authenticated" | "internal";
type SurfaceRuntime = "edge" | "nodejs";

interface SurfaceDefinition {
  readonly routeGroup: "(marketing)" | "(dealroom)" | "(app)" | "(admin)";
  readonly rootPaths: readonly string[];
  readonly access: SurfaceAccess;
  readonly runtime: SurfaceRuntime;
  readonly dynamic: "auto" | "force-static" | "force-dynamic";
  readonly metadata: Metadata;
}

const appOrigin = new URL(env.NEXT_PUBLIC_APP_URL);

export const appSurfaceDefinitions = {
  marketing: {
    routeGroup: "(marketing)",
    rootPaths: ["/", "/pricing", "/savings", "/faq", "/blog", "/legal"],
    access: "public",
    runtime: "nodejs",
    dynamic: "force-static",
    metadata: {
      metadataBase: appOrigin,
      title: {
        default: "buyer-v2",
        template: "%s | buyer-v2",
      },
      description: "AI-native Florida buyer brokerage.",
    },
  },
  dealRoom: {
    routeGroup: "(dealroom)",
    rootPaths: ["/property"],
    access: "gated",
    runtime: "nodejs",
    dynamic: "force-dynamic",
    metadata: {
      title: {
        default: "Deal Room | buyer-v2",
        template: "%s | buyer-v2 Deal Room",
      },
      description: "Gated property analysis, pricing context, and negotiation workflows.",
      robots: {
        index: false,
        follow: false,
      },
    },
  },
  buyerApp: {
    routeGroup: "(app)",
    rootPaths: ["/dashboard", "/compare", "/favourites", "/profile", "/reports"],
    access: "authenticated",
    runtime: "nodejs",
    dynamic: "force-dynamic",
    metadata: {
      title: {
        default: "Buyer App | buyer-v2",
        template: "%s | buyer-v2",
      },
      description: "Authenticated buyer workspace for deals, tours, and reports.",
      robots: {
        index: false,
        follow: false,
      },
    },
  },
  internalConsole: {
    routeGroup: "(admin)",
    rootPaths: ["/console", "/metrics", "/notes", "/overrides", "/queues", "/settings"],
    access: "internal",
    runtime: "nodejs",
    dynamic: "force-dynamic",
    metadata: {
      title: {
        default: "Internal Console | Kindservices",
        template: "%s | Kindservices Console",
      },
      description: "Internal broker and operations console.",
      robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
          index: false,
          follow: false,
        },
      },
    },
  },
} as const satisfies Record<string, SurfaceDefinition>;
