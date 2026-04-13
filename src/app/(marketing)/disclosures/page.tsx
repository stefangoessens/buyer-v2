import { LegalPage } from "@/components/marketing/LegalPage";

export default function DisclosuresPage() {
  return (
    <LegalPage
      title="Disclosures"
      description="Important disclosures related to brokerage services and analysis outputs."
      updatedAt="April 12, 2026"
    >
      <h2 className="text-base font-semibold text-neutral-800">Brokerage Representation</h2>
      <p>
        Where representation is provided, services are performed by licensed Florida real estate professionals. Written disclosures may be required before or during representation.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">AI Analysis Outputs</h2>
      <p>
        AI-generated analyses are informational estimates. They rely on third-party and public data sources and may contain errors or omissions. You should verify key details independently.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">Third-Party Links</h2>
      <p>
        Listing links (Zillow, Redfin, Realtor.com, and others) are owned by third parties. We do not control their content and may not have access to all listing details.
      </p>
    </LegalPage>
  );
}

