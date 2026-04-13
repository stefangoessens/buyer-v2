import { AppSidebar, AppTopNav } from "@/components/dealroom/AppSidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopNav />
        <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
