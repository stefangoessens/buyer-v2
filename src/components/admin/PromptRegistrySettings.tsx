"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminEmptyState } from "./AdminEmptyState";
import { formatConsoleTimestamp, pluralize } from "@/lib/admin/format";

interface PromptVersionSummary {
  promptKey: string;
  version: string;
  model: string;
  createdAt: string;
  author: string;
  changeNotes?: string;
}

interface PromptRegistryEngineSnapshot {
  engineType: string;
  promptCount: number;
  activeVersions: PromptVersionSummary[];
  recentVersions: Array<{
    promptKey: string;
    version: string;
    model: string;
    createdAt: string;
    author: string;
    isActive: boolean;
  }>;
}

function titleizeEngine(engineType: string): string {
  return engineType
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function titleizePromptKey(promptKey: string): string {
  return promptKey
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function PromptRegistrySettings() {
  const ensureCatalogPrompts = useMutation(api.promptRegistry.ensureCatalogPrompts);
  const snapshot = useQuery(api.promptRegistry.getConsoleSnapshot) as
    | PromptRegistryEngineSnapshot[]
    | undefined;
  const didRequestSeedRef = useRef(false);

  useEffect(() => {
    if (snapshot === undefined || didRequestSeedRef.current) {
      return;
    }

    didRequestSeedRef.current = true;
    void ensureCatalogPrompts().catch(() => {});
  }, [ensureCatalogPrompts, snapshot]);

  const summary = useMemo(() => {
    if (!snapshot) return null;
    const seededEngines = snapshot.filter((engine) => engine.promptCount > 0);
    return {
      engineCount: seededEngines.length,
      promptCount: seededEngines.reduce(
        (total, engine) => total + engine.promptCount,
        0,
      ),
      activeVersionCount: seededEngines.reduce(
        (total, engine) => total + engine.activeVersions.length,
        0,
      ),
    };
  }, [snapshot]);

  if (snapshot === undefined) {
    return (
      <AdminEmptyState
        title="Loading prompt registry…"
        description="Fetching active prompt versions and history from Convex."
      />
    );
  }

  if ((summary?.promptCount ?? 0) === 0) {
    return (
      <AdminEmptyState
        title="Prompt registry is empty"
        description="Seeding the default prompt catalog and active runtime refs."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Seeded engines</CardDescription>
            <CardTitle className="text-3xl">
              {summary?.engineCount ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-500">
            {pluralize(summary?.engineCount ?? 0, "engine")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stored prompts</CardDescription>
            <CardTitle className="text-3xl">
              {summary?.promptCount ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-500">
            Historical versions retained for replay and rollback.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active runtime refs</CardDescription>
            <CardTitle className="text-3xl">
              {summary?.activeVersionCount ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-500">
            Explicit prompt versions currently marked active.
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {snapshot
          .filter((engine) => engine.promptCount > 0)
          .map((engine) => (
            <Card key={engine.engineType} className="gap-4">
              <CardHeader className="pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">
                      {titleizeEngine(engine.engineType)}
                    </CardTitle>
                    <CardDescription>
                      {pluralize(engine.promptCount, "stored version")} across{" "}
                      {pluralize(engine.activeVersions.length, "active ref")}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {pluralize(engine.promptCount, "version")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Active
                  </div>
                  {engine.activeVersions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-sm text-neutral-500">
                      No active version selected for this engine.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {engine.activeVersions.map((version) => (
                        <div
                          key={`${engine.engineType}-${version.promptKey}-${version.version}`}
                          className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>{titleizePromptKey(version.promptKey)}</Badge>
                            <code className="text-xs text-neutral-700">
                              {version.version}
                            </code>
                            <span className="text-xs text-neutral-500">
                              {version.model}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-neutral-500">
                            {version.author} • {formatConsoleTimestamp(version.createdAt)}
                          </div>
                          {version.changeNotes ? (
                            <div className="mt-2 text-sm text-neutral-600">
                              {version.changeNotes}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Recent versions
                  </div>
                  <div className="space-y-2">
                    {engine.recentVersions.map((version) => (
                      <div
                        key={`${engine.engineType}-recent-${version.promptKey}-${version.version}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-neutral-900">
                              {titleizePromptKey(version.promptKey)}
                            </span>
                            {version.isActive ? (
                              <Badge variant="secondary">Active</Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            <code>{version.version}</code> • {version.model} •{" "}
                            {version.author}
                          </div>
                        </div>
                        <div className="text-xs text-neutral-500">
                          {formatConsoleTimestamp(version.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </section>
    </div>
  );
}
