import { vi } from "vitest";

// Mock environment variables for tests
vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test_posthog_key");
vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://test@sentry.io/123");
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
vi.stubEnv("NODE_ENV", "test");
