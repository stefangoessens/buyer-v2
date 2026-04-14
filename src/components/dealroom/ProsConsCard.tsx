"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

interface ProsConsCardProps {
  propertyId: Id<"properties">;
}

export function ProsConsCard({ propertyId }: ProsConsCardProps) {
  const data = useQuery(api.engines.prosConsSynthesizer.getForProperty, {
    propertyId,
  });

  if (data === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pros & cons</CardTitle>
        </CardHeader>
        <CardContent>Loading…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pros & cons</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-success-700">
              Pros
            </h3>
            <ul className="space-y-2">
              {data.pros.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-success-500">✓</span>
                  <div>
                    <span className="text-neutral-800">{p.text}</span>
                    {p.citation && (
                      <span className="ml-1 text-xs text-neutral-500">
                        — {p.citation}
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {data.pros.length === 0 && (
                <li className="text-sm text-neutral-500">
                  No pros surfaced yet
                </li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-error-700">
              Cons
            </h3>
            <ul className="space-y-2">
              {data.cons.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-error-500">✗</span>
                  <div>
                    <span className="text-neutral-800">{c.text}</span>
                    {c.citation && (
                      <span className="ml-1 text-xs text-neutral-500">
                        — {c.citation}
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {data.cons.length === 0 && (
                <li className="text-sm text-neutral-500">
                  No concerns surfaced yet
                </li>
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
