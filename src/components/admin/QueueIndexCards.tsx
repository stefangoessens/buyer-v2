import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  QUEUE_KEYS,
  QUEUE_KEY_DESCRIPTIONS,
  QUEUE_KEY_LABELS,
  type QueueKey,
} from "@/lib/admin/queueLabels";
import { cn } from "@/lib/utils";

interface QueueCountRow {
  queueKey: QueueKey;
  open: number;
  inReview: number;
  urgent: number;
}

interface QueueIndexCardsProps {
  counts: QueueCountRow[];
}

/**
 * Grid of queue cards used on the index page. Each card is a link to
 * its detail route and surfaces open/in-review/urgent counts so ops
 * can see where attention is needed at a glance.
 */
export function QueueIndexCards({ counts }: QueueIndexCardsProps) {
  const byKey = new Map<QueueKey, QueueCountRow>();
  for (const row of counts) byKey.set(row.queueKey, row);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {QUEUE_KEYS.map((key) => {
        const row = byKey.get(key) ?? {
          queueKey: key,
          open: 0,
          inReview: 0,
          urgent: 0,
        };
        return (
          <Link
            key={key}
            href={`/queues/${key}`}
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-xl"
          >
            <Card
              className={cn(
                "h-full transition-shadow hover:shadow-md",
                row.urgent > 0 && "border border-error-500/40",
              )}
            >
              <CardHeader>
                <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Queue
                </CardDescription>
                <CardTitle className="text-lg font-semibold text-foreground">
                  {QUEUE_KEY_LABELS[key]}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {QUEUE_KEY_DESCRIPTIONS[key]}
                </p>
              </CardHeader>
              <CardContent className="flex items-end justify-between">
                <div className="flex gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Open
                    </div>
                    <div className="text-2xl font-semibold tabular-nums text-foreground">
                      {row.open}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      In review
                    </div>
                    <div className="text-2xl font-semibold tabular-nums text-muted-foreground">
                      {row.inReview}
                    </div>
                  </div>
                </div>
                {row.urgent > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-error-100 px-2 py-0.5 text-xs font-medium text-error-700">
                    {row.urgent} urgent
                  </span>
                ) : null}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
