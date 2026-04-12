import Link from "next/link";

const footerSections = {
  product: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Savings Calculator", href: "/calculator" },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQ", href: "/faq" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Careers", href: "/careers" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Disclosures", href: "/disclosures" },
    { label: "Licensing", href: "/licensing" },
  ],
} as const;

function FooterColumn({ title, links }: { title: string; links: ReadonlyArray<{ label: string; href: string }> }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">{title}</h3>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-neutral-300 transition-colors duration-[var(--duration-fast)] hover:text-white">{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="w-full bg-primary-800">
      <div className="mx-auto max-w-[1248px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Link href="/" className="text-xl font-bold text-white">buyer-v2</Link>
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">AI-native buyer brokerage for Florida homebuyers. Expert representation, instant property analysis, real savings.</p>
            <div className="mt-6"><span className="text-xs font-medium text-neutral-500">Florida licensed brokerage</span></div>
          </div>
          <FooterColumn title="Product" links={footerSections.product} />
          <FooterColumn title="Company" links={footerSections.company} />
          <FooterColumn title="Legal" links={footerSections.legal} />
        </div>
        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center">
          <p className="text-sm text-neutral-500">&copy; {new Date().getFullYear()} buyer-v2. All rights reserved.</p>
          <p className="text-xs text-neutral-500">All services provided in compliance with Florida real estate law.</p>
        </div>
      </div>
    </footer>
  );
}
