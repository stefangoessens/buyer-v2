"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";

interface PasteLinkInputProps {
  onSubmit?: (url: string) => void;
  placeholder?: string;
  variant?: "hero" | "compact";
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
}: PasteLinkInputProps) {
  const [value, setValue] = useState("");

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
      className={`flex items-center gap-2 ${isHero ? "flex-col sm:flex-row" : ""}`}
    >
      <div className="relative w-full">
        <svg
          className={`absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400 ${isHero ? "size-5" : "size-4"}`}
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
              ? "h-[68px] rounded-3xl border-2 border-primary-200 bg-white pl-10 text-lg"
              : "h-10 rounded-xl pl-9"
          }
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className={`shrink-0 font-semibold text-white transition-colors duration-[var(--duration-normal)] ${
          isHero
            ? "h-16 rounded-3xl bg-primary-400 px-8 text-lg hover:bg-primary-500 disabled:bg-primary-200 sm:w-auto w-full"
            : "h-10 rounded-xl bg-primary-400 px-5 text-sm hover:bg-primary-500 disabled:bg-primary-200"
        }`}
      >
        {isHero ? "Get free analysis" : "Analyze"}
      </button>
    </form>
  );
}
