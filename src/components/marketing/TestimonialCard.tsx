import { Card, CardContent } from "@/components/ui/card";

interface TestimonialCardProps {
  quote: string;
  author: string;
  role?: string;
  avatarUrl?: string;
}

export function TestimonialCard({
  quote,
  author,
  role,
  avatarUrl,
}: TestimonialCardProps) {
  return (
    <Card className="rounded-2xl border border-neutral-200 p-6">
      <CardContent className="p-0">
        <blockquote className="text-lg italic text-neutral-700">
          &ldquo;{quote}&rdquo;
        </blockquote>
        <div className="mt-4 flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={author}
              className="size-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
              {author.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold text-neutral-800">{author}</div>
            {role && (
              <div className="text-sm text-neutral-500">{role}</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
