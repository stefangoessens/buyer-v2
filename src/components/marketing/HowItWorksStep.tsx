import Image from "next/image";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export interface HowItWorksStepProps {
  number: number;
  title: string;
  body: string;
  technicalDetail?: string;
  imageSrc?: string;
  imageAlt?: string;
  reverse?: boolean;
}

export function HowItWorksStep({
  number,
  title,
  body,
  technicalDetail,
  imageSrc,
  imageAlt,
  reverse = false,
}: HowItWorksStepProps) {
  const paddedNumber = String(number).padStart(2, "0");

  return (
    <article className="relative w-full">
      <div
        className={cn(
          "grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16",
          reverse && "lg:[&>div:first-child]:order-2",
        )}
      >
        <div className="max-w-xl">
          <div className="flex items-baseline gap-4">
            <span
              aria-hidden="true"
              className="bg-gradient-to-br from-primary-400 to-primary-700 bg-clip-text text-6xl font-semibold tracking-tight text-transparent lg:text-7xl"
            >
              {paddedNumber}
            </span>
            <span className="text-sm font-semibold uppercase tracking-widest text-primary-400">
              Step {number}
            </span>
          </div>

          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-3xl lg:leading-[1.2]">
            {title}
          </h3>
          <p className="mt-4 text-[17px] leading-relaxed text-neutral-500">
            {body}
          </p>

          {technicalDetail ? (
            <div className="mt-6 max-w-md">
              <Accordion type="single" collapsible className="rounded-2xl border-neutral-200 bg-white">
                <AccordionItem value="behind-the-scenes" className="border-none">
                  <AccordionTrigger className="px-5 py-3 text-sm font-semibold text-primary-700 hover:no-underline">
                    Behind the scenes
                  </AccordionTrigger>
                  <AccordionContent className="px-5 text-sm leading-relaxed text-neutral-500">
                    {technicalDetail}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          ) : null}
        </div>

        {imageSrc ? (
          <div className="w-full">
            <div className="overflow-hidden rounded-[28px] border border-neutral-200/80 bg-white shadow-lg">
              <div className="relative aspect-[4/3] bg-neutral-50">
                <Image
                  src={imageSrc}
                  alt={imageAlt ?? ""}
                  fill
                  className="object-cover object-center"
                  sizes="(min-width: 1024px) 560px, 100vw"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden lg:block" aria-hidden="true" />
        )}
      </div>
    </article>
  );
}
