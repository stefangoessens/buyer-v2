import { cn } from "@/lib/utils";

interface LoadingStateProps {
  variant: "card" | "list" | "text";
  count?: number;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-neutral-200", className)} />
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function TextSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function LoadingState({ variant, count = 1 }: LoadingStateProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="space-y-4">
      {items.map((i) => {
        switch (variant) {
          case "card":
            return <CardSkeleton key={i} />;
          case "list":
            return <ListRowSkeleton key={i} />;
          case "text":
            return <TextSkeleton key={i} />;
        }
      })}
    </div>
  );
}
