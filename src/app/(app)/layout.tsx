export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar navigation will be added later */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
