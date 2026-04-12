import { Card, CardContent } from "@/components/ui/card";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Card className="rounded-xl border-neutral-200 p-6 shadow-sm transition-shadow duration-[var(--duration-normal)] hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
          {icon}
        </div>
        <h3 className="mt-4 text-xl font-semibold text-neutral-900">
          {title}
        </h3>
        <p className="mt-2 text-base text-neutral-600">{description}</p>
      </CardContent>
    </Card>
  );
}
