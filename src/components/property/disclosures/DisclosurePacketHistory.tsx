"use client";

import { useMemo } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type PacketDoc = Doc<"disclosurePackets">;

interface DisclosurePacketHistoryProps {
  packets: PacketDoc[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function totalBytesFor(packet: PacketDoc): number {
  return packet.files.reduce((sum, f) => sum + f.byteSize, 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DisclosurePacketHistory({
  packets,
}: DisclosurePacketHistoryProps) {
  const [active, superseded] = useMemo(() => {
    const sorted = [...packets].sort((a, b) => b.version - a.version);
    const activePacket = sorted.find((p) => p.status !== "superseded") ?? null;
    const rest = sorted.filter((p) => p.status === "superseded");
    return [activePacket, rest] as const;
  }, [packets]);

  if (packets.length === 0) return null;
  if (superseded.length === 0 && active) {
    return null;
  }

  return (
    <Card className="rounded-4xl border-border">
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Packet history
          </p>
          <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Previous versions
          </h3>
          <p className="text-sm text-muted-foreground">
            Old versions are kept for the audit trail. Findings shown here are
            read-only.
          </p>
        </div>

        {active && (
          <div className="flex items-center justify-between gap-3 rounded-3xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Version {active.version}
              </p>
              <p className="text-xs text-muted-foreground">
                Uploaded {formatDate(active.createdAt)} ·{" "}
                {active.files.length} file
                {active.files.length === 1 ? "" : "s"} ·{" "}
                {formatBytes(totalBytesFor(active))}
              </p>
            </div>
            <Badge className="bg-primary text-primary-foreground">Active</Badge>
          </div>
        )}

        {superseded.length > 0 && (
          <Accordion
            type="single"
            collapsible
            className="flex flex-col gap-2 border-0"
          >
            {superseded.map((p) => (
              <AccordionItem
                key={p._id}
                value={p._id}
                className="rounded-3xl border border-border bg-card"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex flex-1 flex-col text-left">
                    <span className="text-sm font-semibold text-foreground">
                      Version {p.version}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Uploaded {formatDate(p.createdAt)} ·{" "}
                      {p.files.length} file
                      {p.files.length === 1 ? "" : "s"} ·{" "}
                      {formatBytes(totalBytesFor(p))}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <ul className="flex flex-col gap-2">
                    {p.files.map((file) => (
                      <li
                        key={file.storageId}
                        className="rounded-2xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {file.fileName}
                        </span>
                        {" · "}
                        {formatBytes(file.byteSize)}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
