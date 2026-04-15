"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AdminMetricCard } from "./AdminMetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatConsoleTimestamp } from "@/lib/admin/format";

const STATUS_OPTIONS = [
  "all",
  "pending",
  "processing",
  "completed",
  "failed",
  "suppressed",
  "duplicate",
  "unsupported_url",
  "needs_verification",
  "rate_limited",
] as const;

const DIRECTION_OPTIONS = ["all", "inbound", "outbound"] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number];
type DirectionFilter = (typeof DIRECTION_OPTIONS)[number];

interface SmsActivityParsedUrl {
  portal?: string;
  listingId?: string;
}

interface SmsActivityItem {
  _id: string;
  direction: "inbound" | "outbound";
  fromPhone: string;
  toPhone: string;
  body: string;
  status: string;
  providerState: string;
  parsedUrls?: SmsActivityParsedUrl[];
  matchedBuyer: {
    name: string;
    userId: string;
  } | null;
  dealRoomHref?: string;
  errorReason?: string;
  receivedAt: string;
}

interface SmsActivityDashboard {
  stats: {
    inboundToday: number;
    successfulCreates24h: number;
    needsAttention: number;
    unknownNumbers: number;
  };
  items: SmsActivityItem[];
}

function statusTone(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "duplicate") return "bg-sky-50 text-sky-700";
  if (status === "failed" || status === "unsupported_url") {
    return "bg-rose-50 text-rose-700";
  }
  if (status === "needs_verification" || status === "rate_limited") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-muted text-muted-foreground";
}

export function SmsActivityTab() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [hasError, setHasError] = useState(false);
  const [unknownSender, setUnknownSender] = useState(false);

  const filters = useMemo(
    () => ({
      status,
      direction,
      hasError,
      unknownSender,
      limit: 100,
    }),
    [direction, hasError, status, unknownSender],
  );

  const dashboard = useQuery(
    api.adminSms.getDashboard,
    filters,
  ) as SmsActivityDashboard | undefined;
  const reparseMessage = useMutation(api.adminSms.reparseMessage);
  const blockPhone = useMutation(api.adminSms.blockPhone);

  async function handleReparse(messageId: string) {
    try {
      await reparseMessage({ messageId: messageId as never });
      toast.success("Re-parse scheduled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not schedule re-parse",
      );
    }
  }

  async function handleBlock(phone: string) {
    const confirmed = window.confirm(
      `Block ${phone} from SMS delivery and intake?`,
    );
    if (!confirmed) return;

    try {
      await blockPhone({ phone, note: "Blocked from SMS activity console" });
      toast.success("Phone blocked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not block phone",
      );
    }
  }

  if (!dashboard) {
    return <div className="text-sm text-muted-foreground">Loading SMS activity…</div>;
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Inbound today"
          value={dashboard.stats.inboundToday.toLocaleString("en-US")}
          helper="Verified + unknown senders"
        />
        <AdminMetricCard
          label="Successful creates (24h)"
          value={dashboard.stats.successfulCreates24h.toLocaleString("en-US")}
          helper="New deal rooms from SMS"
        />
        <AdminMetricCard
          label="Needs attention"
          value={dashboard.stats.needsAttention.toLocaleString("en-US")}
          helper="Failed, unsupported, unverified, or rate-limited"
          tone={dashboard.stats.needsAttention > 0 ? "warning" : "default"}
        />
        <AdminMetricCard
          label="Unknown numbers"
          value={dashboard.stats.unknownNumbers.toLocaleString("en-US")}
          helper="Inbound texts without a verified buyer match"
          tone={dashboard.stats.unknownNumbers > 0 ? "warning" : "default"}
        />
      </section>

      <section className="rounded-3xl border border-border bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={direction}
            onValueChange={(value) => setDirection(value as DirectionFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              {DIRECTION_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={hasError ? "default" : "outline"}
            onClick={() => setHasError((value) => !value)}
          >
            {hasError ? "Showing errors" : "Has error"}
          </Button>
          <Button
            variant={unknownSender ? "default" : "outline"}
            onClick={() => setUnknownSender((value) => !value)}
          >
            {unknownSender ? "Unknown only" : "Unknown sender"}
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-white p-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phone</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Matched buyer</TableHead>
              <TableHead>Deal room</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.items.map((item: SmsActivityItem) => (
              <TableRow key={item._id}>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{item.fromPhone}</div>
                    <div className="text-xs text-muted-foreground">to {item.toPhone}</div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {item.direction}
                  </Badge>
                </TableCell>
                <TableCell className="align-top">
                  <div className="max-w-sm space-y-1">
                    <p className="whitespace-normal text-sm text-foreground">
                      {item.body}
                    </p>
                    {item.parsedUrls?.length ? (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {item.parsedUrls.map(
                          (parsed: SmsActivityParsedUrl, index: number) => (
                          <div key={`${item._id}-${index}`}>
                            {(parsed.portal ?? "unknown").toString()}
                            {parsed.listingId ? ` · ${parsed.listingId}` : ""}
                          </div>
                          ),
                        )}
                      </div>
                    ) : null}
                    {item.errorReason ? (
                      <p className="whitespace-normal text-xs text-rose-700">
                        {item.errorReason}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  {item.matchedBuyer ? (
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">
                        {item.matchedBuyer.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.matchedBuyer.userId}
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unknown</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  {item.dealRoomHref ? (
                    <a
                      href={item.dealRoomHref}
                      className="text-sm font-medium text-primary hover:text-primary/80"
                    >
                      Open deal room
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <Badge className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(item.status)}`}>
                    {item.status.replace(/_/g, " ")}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.providerState}
                  </p>
                </TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">
                  {formatConsoleTimestamp(item.receivedAt)}
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex justify-end gap-2">
                    {item.direction === "inbound" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReparse(item._id)}
                      >
                        Re-parse
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBlock(item.fromPhone)}
                    >
                      Block phone
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
