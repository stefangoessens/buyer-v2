import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({ icon, title, description, className }: FeatureCardProps) {
  return (
    <div className={cn("group rounded-2xl border border-neutral-200 bg-white p-8 transition-all duration-[250ms] hover:-translate-y-1 hover:shadow-lg", className)}>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-400 transition-colors duration-[250ms] group-hover:bg-primary-100">
        {icon}
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-tight text-neutral-800">{title}</h3>
      <p className="mt-2.5 text-base leading-relaxed text-neutral-500">{description}</p>
    </div>
  );
}
