import { LegalPage } from "@/components/marketing/LegalPage";

export default function LicensingPage() {
  return (
    <LegalPage
      title="Licensing"
      description="Licensing and regulatory information for Florida brokerage services."
      updatedAt="April 12, 2026"
    >
      <h2 className="text-base font-semibold text-neutral-800">Florida Brokerage</h2>
      <p>
        buyer-v2 operates as a Florida-focused buyer brokerage platform. Representation services are provided through licensed Florida real estate professionals.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">Compliance</h2>
      <p>
        We aim to provide compliant workflows, disclosures, and documentation. Requirements can vary by transaction and timing; your broker will confirm what applies to your deal.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">Questions</h2>
      <p>
        For licensing questions, contact{" "}
        <a className="font-medium text-primary-700 underline" href="mailto:hello@buyer-v2.com">
          hello@buyer-v2.com
        </a>
        .
      </p>
    </LegalPage>
  );
}

