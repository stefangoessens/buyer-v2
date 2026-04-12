"use client";

import { useCallback, useState } from "react";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";

export function HeroInput() {
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = useCallback((_url: string) => { setSubmitted(true); }, []);

  if (submitted) {
    return (
      <div className="flex h-[60px] items-center justify-center gap-3 rounded-[16px] border border-neutral-200 bg-white px-6 text-base font-medium text-neutral-700 shadow-sm" aria-live="polite">
        <svg className="size-5 animate-spin text-primary-400" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Analyzing your property...
      </div>
    );
  }

  return <PasteLinkInput variant="hero" onSubmit={handleSubmit} />;
}
