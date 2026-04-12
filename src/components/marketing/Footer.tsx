import Link from "next/link";

const footerLinks = {
  company: [
    { label: "About", href: "/about" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Disclosures", href: "/disclosures" },
  ],
  resources: [
    { label: "Blog", href: "/blog" },
    { label: "Calculator", href: "/calculator" },
    { label: "FAQ", href: "/faq" },
  ],
} as const;

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold tracking-wide text-neutral-200 uppercase">
        {title}
      </h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-neutral-400 transition-colors duration-[var(--duration-fast)] hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="w-full bg-neutral-900">
      <div className="mx-auto max-w-[1248px] px-6 py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
          <FooterColumn title="Company" links={footerLinks.company} />
          <FooterColumn title="Legal" links={footerLinks.legal} />
          <FooterColumn title="Resources" links={footerLinks.resources} />
        </div>

        <div className="mt-12 border-t border-neutral-800 pt-8">
          <p className="text-sm text-neutral-400">
            &copy; {new Date().getFullYear()} buyer-v2. All rights reserved.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Florida licensed brokerage. All services provided in compliance with
            Florida real estate law.
          </p>
        </div>
      </div>
    </footer>
  );
}
