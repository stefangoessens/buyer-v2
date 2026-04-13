"use client";

import { useEffect, useState } from "react";
import type { LinkPastedSource } from "@buyer-v2/shared/launch-events";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";

interface PasteLinkInputProps {
  onSubmit?: (url: string) => void;
  placeholder?: string;
  variant?: Extract<LinkPastedSource, "hero" | "compact">;
  initialValue?: string;
}

function isValidPropertyUrl(url: string): boolean {
  try {
    const trimmed = url.trim().toLowerCase();
    return /^https?:\/\/(www\.)?(zillow|redfin|realtor)\.com\//.test(trimmed);
  } catch {
    return false;
  }
}

export function PasteLinkInput({
  onSubmit,
  placeholder = "Paste a Zillow, Redfin, or Realtor.com link...",
  variant = "hero",
  initialValue = "",
}: PasteLinkInputProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const isHero = variant === "hero";
  const canSubmit = isValidPropertyUrl(value);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) {
      track("link_pasted", { url: value.trim(), source: variant });
      try {
        onSubmit?.(value.trim());
      } catch (err) {
        const code =
          err instanceof Error ? err.message : "unknown_parse_error";
        track("error_boundary_hit", { error: code, url: value.trim() });
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex w-full items-center gap-3 ${isHero ? "flex-col" : ""}`}
    >
      <div className="relative w-full">
        <svg
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-400 ${isHero ? "left-4 size-5" : "left-3 size-4"}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.027a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757"
          />
        </svg>
        <Input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={
            isHero
              ? "h-[60px] rounded-[16px] border border-neutral-200 bg-white pl-12 pr-4 text-base shadow-sm placeholder:text-neutral-400"
              : "h-11 rounded-[12px] border border-neutral-200 bg-white pl-10 pr-3 text-sm shadow-sm placeholder:text-neutral-400"
          }
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className={`shrink-0 font-medium text-white shadow-sm transition-colors duration-[var(--duration-fast)] ${
          isHero
            ? "h-[60px] w-full rounded-[12px] bg-primary-400 px-5 text-base hover:bg-primary-500 disabled:bg-primary-200"
            : "h-11 rounded-[12px] bg-primary-400 px-4 text-sm hover:bg-primary-500 disabled:bg-primary-200"
        }`}
      >
        {isHero ? "Get free analysis" : "Analyze"}
      </button>
    </form>
  );
}
