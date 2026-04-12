export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Admin sidebar will be added later */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
