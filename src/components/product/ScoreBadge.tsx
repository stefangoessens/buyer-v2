import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-6 text-xs px-2",
  md: "h-8 text-sm px-3",
  lg: "h-10 text-base px-4",
} as const;

function getScoreColor(score: number) {
  if (score >= 7) return "bg-success-50 text-success-700";
  if (score >= 5) return "bg-warning-50 text-warning-700";
  return "bg-error-50 text-error-700";
}

export function ScoreBadge({ score, maxScore, size = "md" }: ScoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full font-bold",
        sizeClasses[size],
        getScoreColor(score),
      )}
    >
      {score.toFixed(1)}
      {maxScore != null && (
        <span className="font-normal opacity-60">/ {maxScore}</span>
      )}
    </span>
  );
}
