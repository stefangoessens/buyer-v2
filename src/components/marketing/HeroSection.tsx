interface HeroSectionProps {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}

export function HeroSection({ title, subtitle, children }: HeroSectionProps) {
  return (
    <section className="w-full bg-primary-800 py-24 lg:py-32">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h1 className="text-5xl font-bold tracking-tighter text-white lg:text-7xl">
          {title}
        </h1>
        <p className="mt-6 text-xl text-primary-200">{subtitle}</p>
        {children && <div className="mt-10">{children}</div>}
      </div>
    </section>
  );
}
