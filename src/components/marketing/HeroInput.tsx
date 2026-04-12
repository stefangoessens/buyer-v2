"use client";

import { useCallback, useState } from "react";
import { PasteLinkInput } from "@/components/marketing/PasteLinkInput";

export function HeroInput() {
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = useCallback((_url: string) => { setSubmitted(true); }, []);

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-[24px] bg-white/10 px-6 py-4 text-lg font-medium text-white backdrop-blur">
        <svg className="size-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        Analyzing your property...
      </div>
    );
  }

  return <PasteLinkInput variant="hero" onSubmit={handleSubmit} />;
}
