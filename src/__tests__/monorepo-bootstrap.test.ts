import { env } from "@/lib/env";
import {
  dealStatuses,
  readEnv,
  webPublicEnvSpec,
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
    expect(defaults.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://us.i.posthog.com");
    expect(env.NEXT_PUBLIC_CONVEX_URL).toBe("https://test.convex.cloud");
  });

  it("exposes stable shared contract unions", () => {
    expect(dealStatuses).toContain("offer_sent");
    expect(dealStatuses).toContain("under_contract");
  });
});
