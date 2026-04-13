import { env } from "@/lib/env";
import {
  dealStatuses,
  deploymentStages,
  extractionServiceEnvSpec,
  readEnv,
  railwayServices,
  webPublicEnvSpec,
  webServerEnvSpec,
  workspaceSurfaces,
} from "@buyer-v2/shared";
import { describe, expect, it } from "vitest";

describe("monorepo bootstrap", () => {
  it("documents major workspace boundaries in the shared config package", () => {
    expect(workspaceSurfaces.web.path).toBe(".");
    expect(workspaceSurfaces.backend.path).toBe("convex");
    expect(workspaceSurfaces.mobile.path).toBe("ios/BuyerV2");
    expect(workspaceSurfaces.workers.path).toBe("python-workers");
    expect(workspaceSurfaces.extractionService.path).toBe("services/extraction");
  });

  it("shares public environment defaults through the config package", () => {
    const defaults = readEnv(webPublicEnvSpec, {});

    expect(defaults.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(defaults.NEXT_PUBLIC_APP_ENV).toBe("local");
    expect(defaults.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://us.i.posthog.com");
    expect(defaults.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_CONVEX_URL).toBe("https://test.convex.cloud");
  });

  it("exposes stable shared contract unions", () => {
    expect(dealStatuses).toContain("offer_sent");
    expect(dealStatuses).toContain("under_contract");
  });

  it("documents the Railway promotion path and independent service topology", () => {
    expect(deploymentStages.preview.promotionSource).toBe("local");
    expect(deploymentStages.staging.promotionSource).toBe("preview");
    expect(deploymentStages.production.promotionSource).toBe("staging");
    expect(railwayServices.web.healthcheckPath).toBe("/api/health");
    expect(railwayServices.extractionService.healthcheckPath).toBe("/health");
    expect(railwayServices.web.workspacePath).toBe(".");
    expect(railwayServices.extractionService.workspacePath).toBe(
      "services/extraction"
    );
  });

  it("keeps server and extraction env contracts explicit", () => {
    const webServerDefaults = readEnv(webServerEnvSpec, {});
    const extractionDefaults = readEnv(extractionServiceEnvSpec, {});

    expect(webServerDefaults.APP_ENV).toBe("local");
    expect(webServerDefaults.SERVICE_VERSION).toBe("0.0.0");
    expect(extractionDefaults.CORS_ORIGINS).toBe("http://localhost:3000");
    expect(extractionDefaults.PORT).toBe("8000");
  });
});
