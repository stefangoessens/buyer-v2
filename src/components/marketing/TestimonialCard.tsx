interface TestimonialCardProps {
  quote: string;
  author: string;
  role?: string;
  rating?: number;
}

export function TestimonialCard({ quote, author, role, rating = 5 }: TestimonialCardProps) {
  return (
    <div className="flex h-full flex-col rounded-[24px] border border-neutral-200 bg-white p-8">
      <div className="flex gap-0.5">
        {Array.from({ length: rating }).map((_, i) => (
          <svg key={i} className="size-5 text-warning-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <blockquote className="mt-5 flex-1 text-base leading-relaxed text-neutral-700">&ldquo;{quote}&rdquo;</blockquote>
      <div className="mt-6 flex items-center gap-3 border-t border-neutral-100 pt-6">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">{author.charAt(0)}</div>
        <div>
          <div className="text-sm font-semibold text-neutral-800">{author}</div>
          {role && <div className="text-xs text-neutral-500">{role}</div>}
        </div>
      </div>
    </div>
  );
}
