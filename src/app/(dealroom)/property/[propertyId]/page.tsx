import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canPerformAction,
  filterByAccessLevel,
  resolveAccessLevel,
  type AccessLevel,
} from "@/lib/dealroom/access";
import { BUYER_SESSION_COOKIE } from "@/lib/onboarding/types";
import { parseBuyerSessionCookie } from "@/lib/onboarding/storage";

interface PropertyPageProps {
  params: Promise<{ propertyId: string }>;
}

const mockProperty = {
  canonicalId: "zillow-123456",
  address: "1823 Bayshore Drive, Miami Beach, FL",
  status: "active",
  listPrice: 1385000,
  beds: 4,
  bathsFull: 3,
  bathsHalf: 1,
  sqftLiving: 2380,
  propertyType: "Townhome",
  yearBuilt: 2019,
  photoUrls: [
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80",
  ],
  photoCount: 18,
  pool: true,
  waterfrontType: "None",
  hoaFee: 380,
  hoaFrequency: "monthly",
  mlsNumber: "FL-224488",
  folioNumber: "00-00-000-000",
  coordinates: { lat: 27.9944, lng: -81.7603 },
  zillowId: "z-224488",
  redfinId: "r-224488",
  realtorId: "re-224488",
  listDate: "2026-03-21",
  daysOnMarket: 12,
  cumulativeDom: 12,
  lotSize: 0.14,
  stories: 2,
  garageSpaces: 2,
  constructionType: "Concrete block",
  roofYear: 2020,
  roofMaterial: "Metal",
  impactWindows: true,
  stormShutters: false,
  floodZone: "X",
  hurricaneZone: "Wind-B",
  seniorCommunity: false,
  shortTermRentalAllowed: false,
  gatedCommunity: true,
  taxAnnual: 8712,
  taxAssessedValue: 841000,
  listingAgentName: "M. Rivera",
  listingBrokerage: "Sun Coast Realty",
  listingAgentPhone: "(813) 555-0144",
  description:
    "Waterfront-style Florida listing used to show how registration unlocks a richer buyer-facing deal-room state.",
  virtualTourUrl: "https://example.com/tour",
  elementarySchool: "Bayview Elementary",
  middleSchool: "South Tampa Middle",
  highSchool: "Hillsborough High",
  schoolDistrict: "Hillsborough County",
  subdivision: "Harbor Pines",
  zestimate: 905000,
  redfinEstimate: 910000,
  realtorEstimate: 918000,
  sourcePlatform: "manual",
  extractedAt: "2026-04-12T00:00:00.000Z",
  updatedAt: "2026-04-12T00:00:00.000Z",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DealRoomPage({ params }: PropertyPageProps) {
  const { propertyId } = await params;
  const cookieStore = await cookies();
  const session = parseBuyerSessionCookie(
    cookieStore.get(BUYER_SESSION_COOKIE)?.value
  );

  const accessLevel: AccessLevel = resolveAccessLevel(
    "registered",
    Boolean(session),
    session?.firstPropertyId === propertyId,
    false
  );
  const visibleProperty = filterByAccessLevel(
    mockProperty,
    accessLevel
  ) as typeof mockProperty;
  const canViewFull = canPerformAction(accessLevel, "view_full");
  const ctaHref = session ? "/dashboard" : "/onboarding";
  const propertyFacts = [
    ["MLS number", visibleProperty.mlsNumber],
    ["Property type", visibleProperty.propertyType],
    ["Year built", String(visibleProperty.yearBuilt)],
    ["Subdivision", visibleProperty.subdivision],
    ["Annual tax", formatCurrency(visibleProperty.taxAnnual)],
    ["Listing brokerage", visibleProperty.listingBrokerage],
  ];

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-neutral-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,111,222,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(255,107,74,0.08),_transparent_24%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute top-16 right-6 h-64 w-64 rounded-full bg-primary-100/50 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-accent-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1248px]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.05em] text-primary-700">
              Deal room
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.006em] text-neutral-900">
              Property {propertyId}
            </h1>
          </div>
          <Badge
            variant="outline"
            className={
              accessLevel === "registered"
                ? "border-success-200 bg-success-50 text-success-700"
                : "border-neutral-200 text-neutral-500"
            }
          >
            {accessLevel === "registered" ? "Registered access" : "Teaser access"}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="relative aspect-[16/10] overflow-hidden bg-neutral-100">
              <Image
                src={visibleProperty.photoUrls?.[0] ?? mockProperty.photoUrls[0]}
                alt="Deal room preview"
                fill
                sizes="(min-width: 1024px) 720px, 100vw"
                className="object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary-700/25 via-transparent to-transparent" />
              <div className="absolute top-4 left-4">
                <Badge className="rounded-full bg-white/90 text-primary-700 shadow-sm">
                  {accessLevel === "registered" ? "Full teaser unlocked" : "Preview locked"}
                </Badge>
              </div>
            </div>
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500">Address</p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.003em] text-neutral-900">
                    {visibleProperty.address}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-medium text-neutral-500">List price</p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.003em] text-primary-700">
                    {formatCurrency(visibleProperty.listPrice)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  ["Beds", `${visibleProperty.beds}`],
                  [
                    "Baths",
                    `${visibleProperty.bathsFull}${visibleProperty.bathsHalf ? ` + ${visibleProperty.bathsHalf} half` : ""}`,
                  ],
                  ["Sqft", `${visibleProperty.sqftLiving?.toLocaleString("en-US") ?? "—"}`],
                  ["HOA", `${visibleProperty.hoaFee ? formatCurrency(visibleProperty.hoaFee) : "None"}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[18px] border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.05em] text-neutral-500">{label}</p>
                    <p className="mt-2 text-lg font-semibold text-neutral-900">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] bg-primary-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.05em] text-primary-700">
                  Access state
                </p>
                <p className="mt-2 text-base leading-7 text-neutral-700">
                  {canViewFull
                    ? "Your registered buyer session unlocks the full deal-room teaser view and keeps the property context linked to this browser."
                    : "This browser is still anonymous. Register to unlock the richer access state and preserve the first-property linkage."}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[28px] border border-neutral-200 bg-white shadow-sm">
              <CardHeader className="space-y-2 border-b border-neutral-100 px-6 py-6">
                <CardTitle className="text-xl font-semibold tracking-[-0.003em] text-neutral-900">
                  Session summary
                </CardTitle>
                <p className="text-sm text-neutral-500">
                  The same cookie snapshot powers onboarding, dashboard, and access gating.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-6">
                <div className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-500">Browser status</p>
                  <p className="mt-2 text-base font-semibold text-neutral-900">
                    {session ? "Registered" : "Anonymous"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-500">Linked property</p>
                  <p className="mt-2 text-base font-semibold text-neutral-900">
                    {session?.firstPropertyId ?? "None yet"}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {session
                      ? "This registered buyer cookie now drives dashboard and deal-room access."
                      : "Complete onboarding to create the registered buyer session."}
                  </p>
                </div>
                <Button
                  asChild
                  className="h-12 w-full rounded-2xl bg-primary-400 text-base font-semibold text-white hover:bg-primary-500"
                >
                  <Link href={ctaHref}>
                    {accessLevel === "registered" ? "Back to dashboard" : "Register to unlock"}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-neutral-200 bg-white shadow-sm">
              <CardHeader className="space-y-2 border-b border-neutral-100 px-6 py-6">
                <CardTitle className="text-xl font-semibold tracking-[-0.003em] text-neutral-900">
                  Property data
                </CardTitle>
                <p className="text-sm text-neutral-500">
                  {accessLevel === "registered"
                    ? "Registered buyers see the richer property context."
                    : "Anonymous visitors only see teaser fields from the same access model."}
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 px-6 py-6">
                {propertyFacts.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 rounded-[18px] border border-neutral-200 px-4 py-3">
                    <p className="text-sm font-medium text-neutral-500">{label}</p>
                    <p className="text-sm font-semibold text-neutral-900">{value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
