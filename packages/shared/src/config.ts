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
type RuntimeMode = "development" | "test" | "production";
type EnvVisibility = "public" | "server";

interface EnvVariable {
  readonly defaultValue: string;
  readonly description: string;
  readonly visibility: EnvVisibility;
  readonly required?: boolean;
  readonly format?: "url";
}

type EnvSpec = Record<string, EnvVariable>;
type EnvKey<TSpec extends EnvSpec> = Extract<keyof TSpec, string>;

export interface EnvIssue<TKey extends string = string> {
  readonly key: TKey;
  readonly message: string;
}

export const webPublicEnvSpec = {
  NEXT_PUBLIC_CONVEX_URL: {
    defaultValue: "",
    description: "Convex deployment URL exposed to the browser.",
    visibility: "public",
    format: "url",
  },
  NEXT_PUBLIC_AUTH_PROVIDER: {
    defaultValue: "clerk",
    description: "Primary web auth provider. Clerk is primary; Auth0 is the fallback.",
    visibility: "public",
  },
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: {
    defaultValue: "",
    description: "Clerk publishable key for web session bootstrapping.",
    visibility: "public",
  },
  NEXT_PUBLIC_AUTH0_DOMAIN: {
    defaultValue: "",
    description: "Fallback Auth0 tenant domain for browser auth flows.",
    visibility: "public",
  },
  NEXT_PUBLIC_AUTH0_CLIENT_ID: {
    defaultValue: "",
    description: "Fallback Auth0 client ID for browser auth flows.",
    visibility: "public",
  },
  NEXT_PUBLIC_POSTHOG_KEY: {
    defaultValue: "",
    description: "PostHog project API key.",
    visibility: "public",
  },
  NEXT_PUBLIC_POSTHOG_HOST: {
    defaultValue: "https://us.i.posthog.com",
    description: "PostHog ingestion host.",
    visibility: "public",
    format: "url",
  },
  NEXT_PUBLIC_SENTRY_DSN: {
    defaultValue: "",
    description: "Browser Sentry DSN.",
    visibility: "public",
    format: "url",
  },
  NEXT_PUBLIC_APP_URL: {
    defaultValue: "http://localhost:3000",
    description: "Canonical app URL used by the web surface.",
    visibility: "public",
    required: true,
    format: "url",
  },
} as const satisfies EnvSpec;

export const webServerEnvSpec = {
  CONVEX_DEPLOY_KEY: {
    defaultValue: "",
    description: "Convex deploy key for CI and deploy automation.",
    visibility: "server",
  },
  CLERK_SECRET_KEY: {
    defaultValue: "",
    description: "Clerk server secret for Next.js server-side session validation.",
    visibility: "server",
  },
  CLERK_JWT_ISSUER_DOMAIN: {
    defaultValue: "",
    description: "Issuer/domain for Clerk JWTs accepted by Convex.",
    visibility: "server",
  },
  CONVEX_CLERK_APPLICATION_ID: {
    defaultValue: "convex",
    description: "Audience/application ID Convex should require for Clerk-issued tokens.",
    visibility: "server",
  },
  AUTH0_ISSUER_BASE_URL: {
    defaultValue: "",
    description: "Fallback Auth0 issuer base URL accepted by Convex.",
    visibility: "server",
  },
  AUTH0_API_AUDIENCE: {
    defaultValue: "",
    description: "Fallback Auth0 audience/application ID accepted by Convex.",
    visibility: "server",
  },
  AUTH0_CLIENT_SECRET: {
    defaultValue: "",
    description: "Fallback Auth0 server secret for web session flows.",
    visibility: "server",
  },
  ANTHROPIC_API_KEY: {
    defaultValue: "",
    description: "Anthropic provider key.",
    visibility: "server",
  },
  OPENAI_API_KEY: {
    defaultValue: "",
    description: "OpenAI provider key.",
    visibility: "server",
  },
  SENTRY_AUTH_TOKEN: {
    defaultValue: "",
    description: "Sentry auth token for release uploads.",
    visibility: "server",
  },
  SENTRY_DSN: {
    defaultValue: "",
    description: "Server-side Sentry DSN.",
    visibility: "server",
    format: "url",
  },
  SENTRY_ORG: {
    defaultValue: "kindservices",
    description: "Sentry organization used for release uploads.",
    visibility: "server",
    required: true,
  },
  SENTRY_PROJECT: {
    defaultValue: "buyer-v2-web",
    description: "Sentry project used for Next.js releases.",
    visibility: "server",
    required: true,
  },
  POSTHOG_PERSONAL_API_KEY: {
    defaultValue: "",
    description: "PostHog personal API key.",
    visibility: "server",
  },
  NODE_ENV: {
    defaultValue: "development",
    description: "Node runtime environment.",
    visibility: "server",
    required: true,
  },

  // ─── Extraction service (Python FastAPI @ services/extraction/) ────
  EXTRACTION_SERVICE_URL: {
    defaultValue: "http://localhost:8000",
    description:
      "Base URL of the FastAPI extraction service. Convex actions POST to ${EXTRACTION_SERVICE_URL}/extract to fetch + parse a listing URL.",
    visibility: "server",
    format: "url",
  },

  // ─── Bright Data Web Unlocker (primary fetch path) ────────────────
  BRIGHT_DATA_UNLOCKER_TOKEN: {
    defaultValue: "",
    description:
      "Bright Data Web Unlocker API token. Read by the Python fetch client; never logged or returned in responses.",
    visibility: "server",
  },
  BRIGHT_DATA_ZONE: {
    defaultValue: "",
    description:
      "Name of the Bright Data zone configured as a Web Unlocker product (e.g. 'web_unlocker1'). Required whenever BRIGHT_DATA_UNLOCKER_TOKEN is set.",
    visibility: "server",
  },
  BRIGHT_DATA_MAX_REQUESTS_PER_MIN: {
    defaultValue: "60",
    description: "Per-client Bright Data rate limit (requests/minute).",
    visibility: "server",
  },
  BRIGHT_DATA_MONTHLY_BUDGET_USD: {
    defaultValue: "500",
    description: "Monthly Bright Data spend cap (USD) enforced in-process.",
    visibility: "server",
  },

  // ─── Browser Use fallback (long-tail + parser drift recovery) ─────
  BROWSER_USE_MODE: {
    defaultValue: "off",
    description:
      "Browser Use fallback mode: 'cloud' (cloud.browser-use.com API), 'local' (OSS package), or 'off' (disabled).",
    visibility: "server",
  },
  BROWSER_USE_API_KEY: {
    defaultValue: "",
    description:
      "Browser Use Cloud API key (starts with bu_). Used when BROWSER_USE_MODE=cloud.",
    visibility: "server",
  },
  BROWSER_USE_API_BASE_URL: {
    defaultValue: "https://api.browser-use.com",
    description: "Browser Use Cloud API host (no /api/v3 suffix).",
    visibility: "server",
    format: "url",
  },
  BROWSER_USE_LLM_MODEL: {
    defaultValue: "claude-sonnet-4.6",
    description:
      "Model the Browser Use agent drives with. Cloud accepts 'gemini-3-flash', 'claude-sonnet-4.6', 'claude-opus-4.6'.",
    visibility: "server",
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

export function validateEnv<TSpec extends EnvSpec>(
  spec: TSpec,
  source: EnvSource = {},
): readonly EnvIssue<EnvKey<TSpec>>[] {
  const values = readEnv(spec, source);
  const mode = resolveRuntimeMode(source);
  const issues: Array<EnvIssue<EnvKey<TSpec>>> = [];

  for (const [key, config] of Object.entries(spec) as Array<[EnvKey<TSpec>, TSpec[EnvKey<TSpec>]]>) {
    const rawValue = source[key];
    const rawValueProvided = Object.prototype.hasOwnProperty.call(source, key);
    const missingRequiredValue =
      !hasValue(rawValue) &&
      (!hasValue(config.defaultValue) || rawValueProvided);

    if (config.required && missingRequiredValue) {
      issues.push({
        key,
        message: `${key} is required for ${mode} runtime.`,
      });
    }

    if (config.format === "url" && hasValue(values[key])) {
      try {
        new URL(values[key]);
      } catch {
        issues.push({
          key,
          message: `${key} must be a valid absolute URL.`,
        });
      }
    }

    if (config.visibility === "public" && !key.startsWith("NEXT_PUBLIC_")) {
      issues.push({
        key,
        message: `${key} is marked public but does not use the NEXT_PUBLIC_ prefix.`,
      });
    }

    if (config.visibility === "server" && key.startsWith("NEXT_PUBLIC_")) {
      issues.push({
        key,
        message: `${key} is marked server-only but uses the NEXT_PUBLIC_ prefix.`,
      });
    }
  }

  return issues;
}

export function requireEnvKeys<
  TSpec extends EnvSpec,
  const TKeys extends readonly EnvKey<TSpec>[],
>(
  spec: TSpec,
  keys: TKeys,
  source: EnvSource = {},
): Readonly<{ [Key in TKeys[number]]: string }> {
  const values = readEnv(spec, source);
  const missing = keys.filter((key) => !hasValue(values[key]));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, values[key]])) as {
      readonly [Key in TKeys[number]]: string;
    },
  );
}

function resolveRuntimeMode(source: EnvSource): RuntimeMode {
  const raw = source.NODE_ENV?.trim();

  if (raw === "production" || raw === "test") {
    return raw;
  }

  return "development";
}
