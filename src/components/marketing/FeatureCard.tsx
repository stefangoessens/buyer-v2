import Image from "next/image";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon?: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({
  icon,
  imageSrc,
  imageAlt,
  title,
  description,
  className,
}: FeatureCardProps) {
  return (
    <div className={cn("group overflow-hidden rounded-[24px] border border-neutral-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg", className)}>
      {imageSrc ? (
        <div className="relative aspect-[5/3] overflow-hidden bg-neutral-50">
          <Image
            src={imageSrc}
            alt={imageAlt ?? title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        </div>
      ) : null}
      {/* Text area */}
      <div className="p-6">
        {icon ? <div className="mb-4 text-primary-700">{icon}</div> : null}
        <h3 className="text-lg font-semibold tracking-tight text-neutral-800">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">{description}</p>
      </div>
    </div>
  );
}
