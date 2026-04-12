import Link from "next/link";

export function NavHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-bold text-primary-700">
          buyer-v2
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="#how-it-works"
            className="text-sm font-medium text-neutral-600 transition-colors duration-[var(--duration-fast)] hover:text-primary-500"
          >
            How it Works
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-neutral-600 transition-colors duration-[var(--duration-fast)] hover:text-primary-500"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium text-neutral-600 transition-colors duration-[var(--duration-fast)] hover:text-primary-500"
          >
            About
          </Link>
        </nav>

        <Link
          href="/get-started"
          className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-[var(--duration-fast)] hover:bg-accent-600"
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}
