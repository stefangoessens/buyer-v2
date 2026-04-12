import Link from "next/link";

export function NavHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#D8D7FF] bg-white shadow-[0_0_15px_rgba(0,0,0,0.07)]">
      <div className="mx-auto flex h-[84px] max-w-[1248px] items-center px-6 lg:px-8">
        <div className="flex items-center gap-10">
          <Link href="/" className="text-[18px] font-semibold tracking-tight text-primary-700">
            buyer-v2
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            <Link
              href="/#how-it-works"
              className="text-sm font-medium text-primary-700 transition-colors duration-[var(--duration-fast)] hover:text-primary-400"
            >
              How it Works
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-primary-700 transition-colors duration-[var(--duration-fast)] hover:text-primary-400"
            >
              Pricing
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-primary-700 transition-colors duration-[var(--duration-fast)] hover:text-primary-400"
            >
              About
            </Link>
          </nav>
        </div>

        <Link
          href="/get-started"
          className="ml-auto rounded-[12px] bg-primary-400 px-4 py-3 text-base font-medium text-white shadow-sm transition-colors duration-[var(--duration-fast)] hover:bg-primary-500"
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}
