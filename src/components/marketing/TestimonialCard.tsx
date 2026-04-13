import Image from "next/image";

interface TestimonialCardProps {
  quote: string;
  author: string;
  role?: string;
  avatarSrc?: string;
  rating?: number;
}

/* PayFit star icon — extracted from payfit.com */
function StarIcon() {
  return (
    <svg width="20" height="20" fill="none" viewBox="0 0 20 20" className="size-5 text-warning-500">
      <path fill="currentColor" d="m10 14.392 5.15 3.108-1.367-5.858 4.55-3.942-5.991-.508L10 1.667 7.658 7.192 1.667 7.7l4.55 3.942L4.85 17.5z" />
    </svg>
  );
}

export function TestimonialCard({ quote, author, role, avatarSrc, rating = 5 }: TestimonialCardProps) {
  return (
    <div className="flex h-full flex-col rounded-[24px] border border-neutral-200 bg-white p-8">
      <div className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
        {Array.from({ length: rating }).map((_, i) => (
          <StarIcon key={i} />
        ))}
      </div>
      <blockquote className="mt-5 flex-1 text-base leading-relaxed text-neutral-700">&ldquo;{quote}&rdquo;</blockquote>
      <div className="mt-6 flex items-center gap-3 border-t border-neutral-100 pt-6">
        {avatarSrc ? (
          <Image src={avatarSrc} alt={author} width={40} height={40} className="size-10 rounded-full object-cover" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">{author.charAt(0)}</div>
        )}
        <div>
          <div className="text-sm font-semibold text-neutral-800">{author}</div>
          {role && <div className="text-xs text-neutral-500">{role}</div>}
        </div>
      </div>
    </div>
  );
}
