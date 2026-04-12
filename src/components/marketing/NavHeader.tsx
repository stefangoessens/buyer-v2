import Link from "next/link";

export function NavHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-[84px] max-w-[1248px] items-center justify-between px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold text-primary-700">
          buyer-v2
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="/#how-it-works"
            className="text-sm font-medium text-neutral-500 transition-colors duration-[var(--duration-fast)] hover:text-primary-400"
          >
            How it Works
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-neutral-500 transition-colors duration-[var(--duration-fast)] hover:text-primary-400"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium text-neutral-500 transition-colors duration-[var(--duration-fast)] hover:text-primary-400"
          >
            About
          </Link>
        </nav>

        <Link
          href="/get-started"
          className="rounded-xl bg-primary-400 px-4 py-3 text-base font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-primary-500"
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}
