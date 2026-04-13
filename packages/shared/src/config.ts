import { hasValue } from "./utils";

export type SurfaceLanguage = "typescript" | "swift" | "python";

export interface WorkspaceSurface {
  path: string;
  language: SurfaceLanguage;
  boundary: string;
  localCommands: readonly string[];
}

export const workspaceSurfaces = {
  web: {
    path: ".",
    language: "typescript",
    boundary:
      "Owns the Next.js App Router surface and may import from @buyer-v2/shared plus its local src tree.",
    localCommands: ["pnpm dev:web", "pnpm build:web", "pnpm typecheck:web"],
  },
  backend: {
    path: "convex",
    language: "typescript",
    boundary:
      "Owns the Convex schema/functions surface and may import from @buyer-v2/shared, but never from web-only src modules.",
    localCommands: ["pnpm dev:backend", "pnpm build:backend", "pnpm typecheck:backend"],
  },
  mobile: {
    path: "ios/BuyerV2",
    language: "swift",
    boundary:
      "Owns the SwiftUI app package and consumes backend contracts over network boundaries rather than importing JS or Python code.",
    localCommands: ["pnpm ios:open", "pnpm build:ios", "pnpm ios:test"],
  },
  workers: {
    path: "python-workers",
    language: "python",
    boundary:
      "Owns reusable Python worker primitives; it stays independent from JS and Swift build graphs.",
    localCommands: ["pnpm workers:lib:test"],
  },
  extractionService: {
    path: "services/extraction",
    language: "python",
    boundary:
      "Owns the deployable FastAPI extraction service that wraps worker logic for Railway/runtime use.",
    localCommands: ["pnpm workers:service:dev", "pnpm workers:service:test"],
  },
} as const satisfies Record<string, WorkspaceSurface>;

type EnvSource = Record<string, string | undefined>;

interface EnvVariable {
  defaultValue: string;
  description: string;
}

type EnvSpec = Record<string, EnvVariable>;

export const webPublicEnvSpec = {
  NEXT_PUBLIC_CONVEX_URL: {
    defaultValue: "",
    description: "Convex deployment URL exposed to the browser.",
  },
  NEXT_PUBLIC_AUTH_PROVIDER: {
    defaultValue: "clerk",
    description: "Primary web auth provider. Clerk is primary; Auth0 is the fallback.",
  },
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: {
    defaultValue: "",
    description: "Clerk publishable key for web session bootstrapping.",
  },
  NEXT_PUBLIC_AUTH0_DOMAIN: {
    defaultValue: "",
    description: "Fallback Auth0 tenant domain for browser auth flows.",
  },
  NEXT_PUBLIC_AUTH0_CLIENT_ID: {
    defaultValue: "",
    description: "Fallback Auth0 client ID for browser auth flows.",
  },
  NEXT_PUBLIC_POSTHOG_KEY: {
    defaultValue: "",
    description: "PostHog project API key.",
  },
  NEXT_PUBLIC_POSTHOG_HOST: {
    defaultValue: "https://us.i.posthog.com",
    description: "PostHog ingestion host.",
  },
  NEXT_PUBLIC_SENTRY_DSN: {
    defaultValue: "",
    description: "Browser Sentry DSN.",
  },
  NEXT_PUBLIC_APP_URL: {
    defaultValue: "http://localhost:3000",
    description: "Canonical app URL used by the web surface.",
  },
} as const satisfies EnvSpec;

export const webServerEnvSpec = {
  CONVEX_DEPLOY_KEY: {
    defaultValue: "",
    description: "Convex deploy key for CI and deploy automation.",
  },
  CLERK_SECRET_KEY: {
    defaultValue: "",
    description: "Clerk server secret for Next.js server-side session validation.",
  },
  CLERK_JWT_ISSUER_DOMAIN: {
    defaultValue: "",
    description: "Issuer/domain for Clerk JWTs accepted by Convex.",
  },
  CONVEX_CLERK_APPLICATION_ID: {
    defaultValue: "convex",
    description: "Audience/application ID Convex should require for Clerk-issued tokens.",
  },
  AUTH0_ISSUER_BASE_URL: {
    defaultValue: "",
    description: "Fallback Auth0 issuer base URL accepted by Convex.",
  },
  AUTH0_API_AUDIENCE: {
    defaultValue: "",
    description: "Fallback Auth0 audience/application ID accepted by Convex.",
  },
  AUTH0_CLIENT_SECRET: {
    defaultValue: "",
    description: "Fallback Auth0 server secret for web session flows.",
  },
  ANTHROPIC_API_KEY: {
    defaultValue: "",
    description: "Anthropic provider key.",
  },
  OPENAI_API_KEY: {
    defaultValue: "",
    description: "OpenAI provider key.",
  },
  SENTRY_AUTH_TOKEN: {
    defaultValue: "",
    description: "Sentry auth token for release uploads.",
  },
  SENTRY_DSN: {
    defaultValue: "",
    description: "Server-side Sentry DSN.",
  },
  POSTHOG_PERSONAL_API_KEY: {
    defaultValue: "",
    description: "PostHog personal API key.",
  },
  NODE_ENV: {
    defaultValue: "development",
    description: "Node runtime environment.",
  },
} as const satisfies EnvSpec;

export const bootstrapEnvFiles = [
  { template: ".env.example", target: ".env.local" },
  { template: "python-workers/.env.example", target: "python-workers/.env" },
] as const;

export function readEnv<TSpec extends EnvSpec>(
  spec: TSpec,
  source: EnvSource = {},
): { readonly [Key in keyof TSpec]: string } {
  const entries = Object.entries(spec).map(([key, config]) => {
    const value = source[key];
    return [key, hasValue(value) ? value : config.defaultValue];
  });

  return Object.freeze(
    Object.fromEntries(entries) as { readonly [Key in keyof TSpec]: string },
  );
}
