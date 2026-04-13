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

export const deploymentEnvironments = [
  "local",
  "preview",
  "staging",
  "production",
] as const;

export type DeploymentEnvironment = (typeof deploymentEnvironments)[number];

export interface DeploymentStage {
  promotionSource: DeploymentEnvironment | null;
  purpose: string;
  railwayEnvironment: boolean;
  domainStrategy: string;
}

export const deploymentStages = {
  local: {
    promotionSource: null,
    purpose:
      "Developer machine. Services run with copied .env files and localhost origins.",
    railwayEnvironment: false,
    domainStrategy: "localhost only",
  },
  preview: {
    promotionSource: "local",
    purpose:
      "Per-PR validation in Railway. Uses Railway-generated public domains to avoid DNS churn.",
    railwayEnvironment: true,
    domainStrategy: "Railway-generated preview domains",
  },
  staging: {
    promotionSource: "preview",
    purpose:
      "Shared lower environment for release-candidate smoke tests before production promotion.",
    railwayEnvironment: true,
    domainStrategy:
      "Railway-generated domains by default; optional custom staging DNS later.",
  },
  production: {
    promotionSource: "staging",
    purpose:
      "Customer-facing environment. Promotion only happens from a validated staging release.",
    railwayEnvironment: true,
    domainStrategy: "Custom buyer-v2 production domains",
  },
} as const satisfies Record<DeploymentEnvironment, DeploymentStage>;

export type DeployableService = "web" | "extractionService";

export interface RailwayRestartPolicy {
  type: "ON_FAILURE";
  maxRetries: number;
}

export interface RailwayServiceDefinition {
  serviceName: string;
  workspacePath: string;
  configPath: string;
  buildCommand: string;
  startCommand: string;
  healthcheckPath: string;
  healthcheckTimeoutSeconds: number;
  restartPolicy: RailwayRestartPolicy;
  rollback: string;
}

export const railwayServices = {
  web: {
    serviceName: "buyer-v2-web",
    workspacePath: ".",
    configPath: "railway.json",
    buildCommand: "pnpm install --frozen-lockfile && pnpm build:web",
    startCommand: "pnpm start",
    healthcheckPath: "/api/health",
    healthcheckTimeoutSeconds: 100,
    restartPolicy: {
      type: "ON_FAILURE",
      maxRetries: 3,
    },
    rollback:
      "Redeploy the previous Railway release for the web service only. No worker rollback is required unless the contract changed.",
  },
  extractionService: {
    serviceName: "buyer-v2-extraction",
    workspacePath: "services/extraction",
    configPath: "services/extraction/railway.json",
    buildCommand: "python -m pip install --upgrade pip && pip install -e .",
    startCommand:
      "python -m uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}",
    healthcheckPath: "/health",
    healthcheckTimeoutSeconds: 100,
    restartPolicy: {
      type: "ON_FAILURE",
      maxRetries: 3,
    },
    rollback:
      "Redeploy the previous Railway release for the extraction service only. Web stays pinned unless its own release failed.",
  },
} as const satisfies Record<DeployableService, RailwayServiceDefinition>;

type EnvSource = Record<string, string | undefined>;

export interface EnvVariable {
  defaultValue: string;
  description: string;
  requiredIn?: readonly DeploymentEnvironment[];
  services?: readonly DeployableService[];
}

export type EnvSpec = Record<string, EnvVariable>;

export const sharedRuntimeEnvSpec = {
  APP_ENV: {
    defaultValue: "local",
    description:
      "Promoted runtime environment: local | preview | staging | production.",
    requiredIn: deploymentEnvironments,
    services: ["web", "extractionService"],
  },
  LOG_LEVEL: {
    defaultValue: "debug",
    description: "Structured log level for deployable services.",
    requiredIn: deploymentEnvironments,
    services: ["web", "extractionService"],
  },
  SERVICE_VERSION: {
    defaultValue: "0.0.0",
    description:
      "Release identifier surfaced in health responses and release audits.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web", "extractionService"],
  },
} as const satisfies EnvSpec;

export const webPublicEnvSpec = {
  NEXT_PUBLIC_APP_ENV: {
    defaultValue: "local",
    description:
      "Public mirror of APP_ENV so client analytics and UI can distinguish preview/staging from production.",
    requiredIn: deploymentEnvironments,
    services: ["web"],
  },
  NEXT_PUBLIC_CONVEX_URL: {
    defaultValue: "",
    description: "Convex deployment URL exposed to the browser.",
    requiredIn: deploymentEnvironments,
    services: ["web"],
  },
  NEXT_PUBLIC_POSTHOG_KEY: {
    defaultValue: "",
    description: "PostHog project API key.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  NEXT_PUBLIC_POSTHOG_HOST: {
    defaultValue: "https://us.i.posthog.com",
    description: "PostHog ingestion host.",
    requiredIn: deploymentEnvironments,
    services: ["web"],
  },
  NEXT_PUBLIC_SENTRY_DSN: {
    defaultValue: "",
    description: "Browser Sentry DSN.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  NEXT_PUBLIC_SITE_URL: {
    defaultValue: "http://localhost:3000",
    description:
      "Canonical public origin used for SEO, sitemap generation, and social metadata.",
    requiredIn: deploymentEnvironments,
    services: ["web"],
  },
  NEXT_PUBLIC_APP_URL: {
    defaultValue: "http://localhost:3000",
    description: "Canonical app URL used by the web surface.",
    requiredIn: deploymentEnvironments,
    services: ["web"],
  },
} as const satisfies EnvSpec;

export const webServerEnvSpec = {
  APP_ENV: sharedRuntimeEnvSpec.APP_ENV,
  LOG_LEVEL: sharedRuntimeEnvSpec.LOG_LEVEL,
  SERVICE_VERSION: sharedRuntimeEnvSpec.SERVICE_VERSION,
  CONVEX_DEPLOY_KEY: {
    defaultValue: "",
    description: "Convex deploy key for CI and deploy automation.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  ANTHROPIC_API_KEY: {
    defaultValue: "",
    description: "Anthropic provider key.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  OPENAI_API_KEY: {
    defaultValue: "",
    description: "OpenAI provider key.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  SENTRY_AUTH_TOKEN: {
    defaultValue: "",
    description: "Sentry auth token for release uploads.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  SENTRY_DSN: {
    defaultValue: "",
    description: "Server-side Sentry DSN.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  POSTHOG_PERSONAL_API_KEY: {
    defaultValue: "",
    description: "PostHog personal API key.",
    requiredIn: ["preview", "staging", "production"],
    services: ["web"],
  },
  NODE_ENV: {
    defaultValue: "development",
    description: "Node runtime environment.",
    requiredIn: deploymentEnvironments,
    services: ["web"],
  },
} as const satisfies EnvSpec;

export const extractionServiceEnvSpec = {
  APP_ENV: sharedRuntimeEnvSpec.APP_ENV,
  LOG_LEVEL: sharedRuntimeEnvSpec.LOG_LEVEL,
  SERVICE_VERSION: sharedRuntimeEnvSpec.SERVICE_VERSION,
  CORS_ORIGINS: {
    defaultValue: "http://localhost:3000",
    description:
      "Comma-separated web origins allowed to call the extraction service.",
    requiredIn: deploymentEnvironments,
    services: ["extractionService"],
  },
  PORT: {
    defaultValue: "8000",
    description:
      "Port bound by the extraction service locally. Railway injects its own value at runtime.",
    requiredIn: ["local"],
    services: ["extractionService"],
  },
} as const satisfies EnvSpec;

export const bootstrapEnvFiles = [
  { template: ".env.example", target: ".env.local" },
  { template: "python-workers/.env.example", target: "python-workers/.env" },
  {
    template: "services/extraction/.env.example",
    target: "services/extraction/.env",
  },
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
