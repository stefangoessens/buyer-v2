import Image from "next/image";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  imageSrc: string;
  imageAlt: string;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({ imageSrc, imageAlt, title, description, className }: FeatureCardProps) {
  return (
    <div className={cn("group overflow-hidden rounded-[24px] border border-neutral-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lg", className)}>
      {/* Image area — matches PayFit feature card pattern */}
      <div className="relative aspect-[5/3] overflow-hidden bg-neutral-50">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </div>
      {/* Text area */}
      <div className="p-6">
        <h3 className="text-lg font-semibold tracking-tight text-neutral-800">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">{description}</p>
      </div>
    </div>
  );
}
