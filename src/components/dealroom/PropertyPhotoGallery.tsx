"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface PropertyPhotoGalleryProps {
  photoUrls: string[];
  address: string;
}

function PhotoPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[20px] bg-neutral-100 text-neutral-300",
        className,
      )}
      aria-hidden="true"
    >
      <svg
        className="size-10"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
        />
      </svg>
    </div>
  );
}

export function PropertyPhotoGallery({
  photoUrls,
  address,
}: PropertyPhotoGalleryProps) {
  const hero = photoUrls[0];
  const thumbs = photoUrls.slice(1, 5);

  if (!hero) {
    return (
      <div className="relative flex aspect-[21/9] w-full flex-col items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-neutral-200 bg-white/60 text-center backdrop-blur-sm">
        <svg
          className="size-12 text-neutral-300"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
        <p className="mt-4 text-base font-medium text-neutral-600">
          No photos available for this listing
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          The listing source didn&apos;t include any photos we could extract
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[24px] bg-neutral-100">
        <Image
          src={hero}
          alt={`Main photo of ${address}`}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((idx) => {
          const url = thumbs[idx];
          if (!url) {
            return (
              <PhotoPlaceholder
                key={idx}
                className="aspect-[16/10] w-full"
              />
            );
          }
          return (
            <div
              key={idx}
              className="relative aspect-[16/10] w-full overflow-hidden rounded-[20px] bg-neutral-100"
            >
              <Image
                src={url}
                alt={`Photo ${idx + 2} of ${address}`}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 25vw"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
