import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  defaultPreferences,
  mergePreferences,
  type MessagePreferences,
} from "@/lib/messagePreferences";

type PreferencesFetchContract = {
  hasStoredPreferences: boolean;
} & MessagePreferences;

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/contracts",
);

function loadFixture<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"),
  ) as T;
}

function expectMessagePreferencesShape(value: MessagePreferences) {
  expect(value.channels).toEqual({
    email: expect.any(Boolean),
    sms: expect.any(Boolean),
    push: expect.any(Boolean),
    inApp: expect.any(Boolean),
  });
  expect(value.categories).toEqual({
    transactional: expect.any(Boolean),
    tours: expect.any(Boolean),
    offers: expect.any(Boolean),
    updates: expect.any(Boolean),
    marketing: expect.any(Boolean),
  });
}

describe("message preference wire contracts", () => {
  it("keeps the fetch response fixture aligned with the TypeScript contract", () => {
    const fixture = loadFixture<PreferencesFetchContract>(
      "message-preferences.fetch.json",
    );

    expect(fixture.hasStoredPreferences).toBe(true);
    expectMessagePreferencesShape(fixture);
  });

  it("keeps the stored response fixture aligned with the merged default state", () => {
    const fixture = loadFixture<MessagePreferences>(
      "message-preferences.stored.json",
    );
    const expected = mergePreferences(defaultPreferences(), {
      channels: {
        sms: true,
        push: false,
      },
      categories: {
        tours: false,
        marketing: true,
      },
    });

    expectMessagePreferencesShape(fixture);
    expect(fixture).toEqual(expected);
  });
});
