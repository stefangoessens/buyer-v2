import { cn } from "@/lib/utils";

interface TimelineStepProps {
  label: string;
  description?: string;
  status: "completed" | "current" | "upcoming";
  isLast?: boolean;
}

export function TimelineStep({
  label,
  description,
  status,
  isLast = false,
}: TimelineStepProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        {/* Circle indicator */}
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
            status === "completed" && "border-primary-500 bg-primary-500",
            status === "current" && "border-accent-500 bg-accent-500 animate-pulse",
            status === "upcoming" && "border-neutral-300 bg-neutral-200",
          )}
        >
          {status === "completed" && (
            <svg
              className="h-3.5 w-3.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Connecting line */}
        {!isLast && (
          <div
            className={cn(
              "mt-1 w-0.5 grow",
              status === "completed" ? "bg-primary-500" : "bg-neutral-200",
            )}
          />
        )}
      </div>

      <div className={cn("pb-6", isLast && "pb-0")}>
        <p className="font-medium text-neutral-900">{label}</p>
        {description && (
          <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
        )}
      </div>
    </div>
  );
}
