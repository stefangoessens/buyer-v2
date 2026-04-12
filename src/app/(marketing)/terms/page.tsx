import { LegalPage } from "@/components/marketing/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description="The terms that govern your use of buyer-v2."
      updatedAt="April 12, 2026"
    >
      <h2 className="text-base font-semibold text-neutral-800">1. Service Overview</h2>
      <p>
        buyer-v2 provides AI-assisted property analysis and, where applicable, connects you with licensed Florida buyer representation. Content is informational and not legal, tax, or financial advice.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">2. Eligibility</h2>
      <p>
        You must be at least 18 years old to use the service. You’re responsible for ensuring any use complies with applicable laws and agreements.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">3. Acceptable Use</h2>
      <p>
        Don’t misuse the platform, attempt to reverse engineer it, or submit unlawful content. We may suspend access to protect users and systems.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">4. Disclaimers</h2>
      <p>
        Analyses are estimates based on available data and may be incomplete or inaccurate. You should verify key facts and consult professionals before making decisions.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">5. Contact</h2>
      <p>
        For questions about these terms, email{" "}
        <a className="font-medium text-primary-700 underline" href="mailto:hello@buyer-v2.com">
          hello@buyer-v2.com
        </a>
        .
      </p>
    </LegalPage>
  );
}

