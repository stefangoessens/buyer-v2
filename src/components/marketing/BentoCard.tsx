import Image from "next/image";
import { cn } from "@/lib/utils";

export function BentoCard({
  src,
  title,
  description,
  imageAspectClassName,
  className,
  sizes,
}: {
  src: string;
  title: string;
  description: string;
  imageAspectClassName: string;
  className?: string;
  sizes: string;
}) {
  return (
    <div className={cn("flex h-full flex-col justify-between rounded-[24px] bg-neutral-50", className)}>
      <div className="flex flex-col gap-2 p-8 md:p-12">
        <h3 className="text-[30px] font-semibold leading-[36px] tracking-[-0.006em] text-neutral-800">
          {title}
        </h3>
        <p className="text-[16px] font-normal leading-[1.5] text-neutral-500 md:text-[18px] md:leading-[27px]">
          {description}
        </p>
      </div>

      <div className={cn("relative w-full overflow-hidden rounded-b-[24px]", imageAspectClassName)}>
        <div className="absolute inset-0 px-8 pb-8 pt-12 md:px-10 md:pb-10 md:pt-16">
          <div className="relative h-full w-full">
            <Image src={src} alt={title} fill className="object-contain object-bottom" sizes={sizes} />
          </div>
        </div>
      </div>
    </div>
  );
}

