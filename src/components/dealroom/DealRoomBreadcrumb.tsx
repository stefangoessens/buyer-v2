import Link from "next/link";

interface DealRoomBreadcrumbProps {
  propertyLabel: string;
}

export function DealRoomBreadcrumb({ propertyLabel }: DealRoomBreadcrumbProps) {
  return (
    <nav
      className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"
      aria-label="Breadcrumb"
    >
      <Link
        href="/dashboard"
        className="rounded-md px-1 py-0.5 text-muted-foreground transition-colors hover:text-primary-700"
      >
        Dashboard
      </Link>
      <svg
        className="size-3.5 shrink-0 text-neutral-300"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m7.5 5 5 5-5 5" />
      </svg>
      <span
        className="max-w-[220px] truncate text-foreground sm:max-w-[360px] md:max-w-[480px]"
        title={propertyLabel}
      >
        {propertyLabel}
      </span>
    </nav>
  );
}
