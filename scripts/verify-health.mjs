#!/usr/bin/env node

const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_INTERVAL_SECONDS = 15;
const DEFAULT_STATUS_FIELD = "status";
const DEFAULT_EXPECTED_STATUS = "ok";

const args = parseArgs(process.argv.slice(2));

const label = args.label ?? "deployment";
const timeoutSeconds = parseNumber(args["timeout-seconds"], DEFAULT_TIMEOUT_SECONDS);
const intervalSeconds = parseNumber(args["interval-seconds"], DEFAULT_INTERVAL_SECONDS);
const statusField = args["status-field"] ?? DEFAULT_STATUS_FIELD;
const expectedStatus = args["expected-status"] ?? DEFAULT_EXPECTED_STATUS;

if (!args.path) {
  throw new Error("Missing required argument: --path");
}

const baseUrl = resolveBaseUrl(args);
const healthUrl = new URL(args.path, ensureTrailingSlash(baseUrl)).toString();

console.log(`[health] waiting for ${label}: ${healthUrl}`);
await waitForHealthyUrl({
  expectedStatus,
  healthUrl,
  intervalMs: intervalSeconds * 1000,
  label,
  statusField,
  timeoutMs: timeoutSeconds * 1000,
});
console.log(`[health] ${label} healthy`);

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function parseNumber(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive number, received: ${rawValue}`);
  }

  return value;
}

function resolveBaseUrl(args) {
  if (args.url) {
    validateUrl(args.url, "--url");
    return args.url;
  }

  if (!args.template) {
    throw new Error("Missing required argument: --url or --template");
  }

  const resolved = args.template.replaceAll(/\{([A-Z_]+)\}/g, (_, name) => {
    const value = templateContext[name];
    if (!value) {
      throw new Error(
        `Template placeholder {${name}} is not available in this workflow context.`,
      );
    }

    return value;
  });

  validateUrl(resolved, "--template");
  return resolved;
}

function validateUrl(value, label) {
  try {
    new URL(value);
  } catch {
    throw new Error(`${label} must resolve to an absolute URL. Received: ${value}`);
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function waitForHealthyUrl({
  expectedStatus,
  healthUrl,
  intervalMs,
  label,
  statusField,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 1;
  let lastFailure = "No response received.";

  while (Date.now() <= deadline) {
    try {
      const response = await fetch(healthUrl, {
        headers: {
          accept: "application/json",
        },
      });
      const bodyText = await response.text();
      const body = tryParseJson(bodyText);
      const reportedStatus =
        body && typeof body === "object" ? body[statusField] : undefined;

      if (response.ok && reportedStatus === expectedStatus) {
        console.log(
          `[health] ${label} responded with ${statusField}=${expectedStatus} on attempt ${attempt}.`,
        );
        return;
      }

      lastFailure = [
        `status=${response.status}`,
        `reported=${String(reportedStatus)}`,
        `body=${truncate(bodyText)}`,
      ].join(" ");
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    console.log(`[health] ${label} not ready on attempt ${attempt}: ${lastFailure}`);
    attempt += 1;

    if (Date.now() + intervalMs > deadline) {
      break;
    }

    await sleep(intervalMs);
  }

  throw new Error(`[health] ${label} failed readiness check: ${lastFailure}`);
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function truncate(value, maxLength = 200) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function slugifyRef(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const templateContext = {
  PR_NUMBER: process.env.PR_NUMBER ?? "",
  PR_HEAD_REF: slugifyRef(process.env.PR_HEAD_REF ?? ""),
  REF_NAME: slugifyRef(process.env.GITHUB_REF_NAME ?? ""),
  SHA: process.env.GITHUB_SHA ?? "",
  SHORT_SHA: (process.env.GITHUB_SHA ?? "").slice(0, 7),
};
