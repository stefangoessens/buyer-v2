import { PageHeader } from "@/components/marketing/PageHeader";

export function LegalPage({
  title,
  description,
  updatedAt,
  children,
}: {
  title: string;
  description: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title={<>{title}</>}
        description={<>{description}</>}
        imageSrc="/images/marketing/bento/bento-3.png"
        imageAlt=""
        imageClassName="object-contain p-10"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-[24px] border border-neutral-200/80 bg-white p-8 shadow-sm md:p-10">
            <p className="text-xs font-medium text-neutral-400">Last updated: {updatedAt}</p>
            <div className="mt-6 space-y-6 text-sm leading-relaxed text-neutral-600">
              {children}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

