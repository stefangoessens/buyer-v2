import Image from "next/image";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  imageSrc,
  imageAlt,
  imageClassName,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  imageClassName?: string;
}) {
  return (
    <section className="relative w-full overflow-hidden bg-[#FCFBFF]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* PayFit-style soft gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(900px_560px_at_18%_0%,#EBF4FF_0%,#FCFBFF_55%,#FFFFFF_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(720px_480px_at_90%_18%,#F1ECFF_0%,rgba(252,251,255,0)_55%)]" />
      </div>

      <div className="relative mx-auto max-w-[1248px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
          <div className="max-w-2xl">
            {eyebrow ? (
              <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">{eyebrow}</p>
            ) : null}
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.006em] text-neutral-800 sm:text-5xl lg:text-[52px] lg:leading-[1.15]">
              {title}
            </h1>
            {description ? (
              <p className="mt-6 text-[18px] leading-[1.5] text-neutral-500">
                {description}
              </p>
            ) : null}
          </div>

          {imageSrc ? (
            <div className="w-full max-w-[560px]">
              <div className="overflow-hidden rounded-[24px] border border-neutral-200/80 bg-white shadow-lg">
                <div className="relative aspect-[16/10] bg-neutral-50">
                  <Image
                    src={imageSrc}
                    alt={imageAlt ?? ""}
                    fill
                    priority
                    className={cn("object-cover object-center", imageClassName)}
                    sizes="(min-width: 1024px) 560px, 100vw"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

