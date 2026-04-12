interface HeroSectionProps {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}

export function HeroSection({ title, subtitle, children }: HeroSectionProps) {
  return (
    <section className="w-full bg-primary-700 py-24 lg:py-32">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mt-6 text-lg text-primary-50/90 sm:text-xl">{subtitle}</p>
        {children && <div className="mt-10">{children}</div>}
      </div>
    </section>
  );
}
