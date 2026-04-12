import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default function OnboardingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(15,111,222,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(0,196,172,0.18),transparent_26%),linear-gradient(180deg,#f5f8ff_0%,#f8fafc_46%,#ffffff_100%)] px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
      <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(5,45,91,0.08),transparent)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1248px] items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(560px,620px)] lg:items-center xl:gap-14">
          <section className="space-y-8 lg:pr-4">
            <div className="inline-flex rounded-full border border-primary-100 bg-white/85 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-primary-600 uppercase shadow-sm backdrop-blur">
              Buyer onboarding
            </div>
            <div className="max-w-[38rem] space-y-5">
              <h1 className="text-[42px] leading-[1.08] font-semibold tracking-[-0.03em] text-primary-800 sm:text-[52px]">
                Register once. Keep every Florida deal room moving forward.
              </h1>
              <p className="max-w-[34rem] text-lg leading-8 text-neutral-600">
                This is the bridge between anonymous listing discovery and the
                registered buyer experience. Save your profile, attach your first
                listing, and unlock a proper buyer dashboard.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: "Persisted",
                  value: "Resume exactly where you left off",
                },
                {
                  label: "Connected",
                  value: "Same session powers the dashboard and deal room",
                },
                {
                  label: "Buyer-first",
                  value: "Built for Florida search behavior, not generic SaaS",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[24px] border border-white/80 bg-white/78 p-5 shadow-[0_18px_50px_rgba(5,45,91,0.08)] backdrop-blur"
                >
                  <p className="text-xs font-semibold tracking-[0.18em] text-primary-500 uppercase">
                    {item.label}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-[28px] border border-white/80 bg-white/72 px-6 py-5 shadow-[0_18px_50px_rgba(5,45,91,0.08)] backdrop-blur">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary-500 uppercase">
                What carries through
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  "Buyer profile and contact details",
                  "Budget, timeline, and financing state",
                  "First pasted listing and access status",
                ].map((item) => (
                  <div key={item} className="rounded-[20px] bg-neutral-50/90 px-4 py-4 text-sm leading-6 text-neutral-600">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <OnboardingFlow />
        </div>
      </div>
    </main>
  );
}
