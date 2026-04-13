type EnvSource = Record<string, string | undefined>;

export interface ObservabilityContext {
  environment: string;
  release: string;
  version: string;
  service: string;
  deployment: string;
}

interface ResolveOptions {
  source?: EnvSource;
  defaultService?: string;
  defaultVersion?: string;
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

export function resolveObservabilityContext(
  options: ResolveOptions = {},
): ObservabilityContext {
  const source = options.source ?? process.env;
  const version = firstValue(
    source.npm_package_version,
    source.NEXT_PUBLIC_APP_VERSION,
    options.defaultVersion,
  ) ?? "0.0.0";
  const deployment = firstValue(
    source.RAILWAY_ENVIRONMENT_NAME,
    source.RAILWAY_ENVIRONMENT,
    source.VERCEL_ENV,
    source.NODE_ENV,
  ) ?? "development";
  const environment = firstValue(
    source.SENTRY_ENVIRONMENT,
    source.RAILWAY_ENVIRONMENT_NAME,
    source.RAILWAY_ENVIRONMENT,
    source.VERCEL_ENV,
    source.NODE_ENV,
  ) ?? "development";
  const release = firstValue(
    source.SENTRY_RELEASE,
    source.RAILWAY_GIT_COMMIT_SHA,
    source.VERCEL_GIT_COMMIT_SHA,
    source.SOURCE_VERSION,
    version,
  ) ?? version;
  const service = firstValue(
    source.OBSERVABILITY_SERVICE_NAME,
    source.RAILWAY_SERVICE_NAME,
    options.defaultService,
  ) ?? "buyer-v2-web";

  return {
    environment,
    release,
    version,
    service,
    deployment,
  };
}
