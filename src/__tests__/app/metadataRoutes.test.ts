import { describe, expect, it } from "vitest";
import { metadata as homeMetadata } from "@/app/(marketing)/page";
import { metadata as intakeMetadata } from "@/app/(marketing)/intake/page";
import { metadata as dashboardMetadata } from "@/app/(app)/dashboard/page";
import { generateMetadata as generateArticleMetadata } from "@/app/(marketing)/blog/[slug]/page";

describe("route metadata pipeline", () => {
  it("homepage uses the shared public metadata definition", () => {
    expect(homeMetadata.title).toBe("Get the best deal on your Florida home | buyer-v2");
    expect(homeMetadata.alternates?.canonical).toBe("http://localhost:3000/");
    expect(homeMetadata.robots).toMatchObject({ index: true, follow: true });
  });

  it("intake stays non-indexable with a canonical route-level definition", () => {
    expect(intakeMetadata.title).toBe("Property intake | buyer-v2");
    expect(intakeMetadata.alternates?.canonical).toBe("http://localhost:3000/intake");
    expect(intakeMetadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("dashboard inherits the shared gated metadata definition", () => {
    expect(dashboardMetadata.title).toBe("Dashboard | buyer-v2");
    expect(dashboardMetadata.alternates?.canonical).toBe("http://localhost:3000/dashboard");
    expect(dashboardMetadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("article routes derive canonical and article time fields from the article model", async () => {
    const metadata = await generateArticleMetadata({
      params: Promise.resolve({ slug: "paste-a-link-walkthrough" }),
    });

    expect(metadata.title).toBe("How the paste-a-link flow actually works | buyer-v2");
    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/blog/paste-a-link-walkthrough"
    );
    expect(metadata.robots).toMatchObject({ index: true, follow: true });

    const openGraph = metadata.openGraph as
      | { publishedTime?: string; modifiedTime?: string }
      | undefined;
    expect(openGraph?.publishedTime).toBe("2026-04-05");
    expect(openGraph?.modifiedTime).toBe("2026-04-05");
  });
});
