export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Marketing header/nav will be added by KIN-771 */}
      <main>{children}</main>
      {/* Marketing footer will be added by KIN-771 */}
    </div>
  );
}
