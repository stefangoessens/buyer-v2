import { PageHeader } from "@/components/marketing/PageHeader";
import { SavingsCalculator } from "@/components/marketing/SavingsCalculator";

export default function CalculatorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Savings calculator"
        title={<>Estimate what you could save</>}
        description={
          <>
            Get a quick estimate of potential rebate savings based on your home price and typical commission assumptions.
          </>
        }
        imageSrc="/images/marketing/bento/bento-4.png"
        imageAlt="Market insights preview"
      />

      <section className="w-full bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
          <SavingsCalculator />
        </div>
      </section>
    </>
  );
}

