import { LegalPage } from "@/components/marketing/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How we collect, use, and protect your information."
      updatedAt="April 12, 2026"
    >
      <h2 className="text-base font-semibold text-neutral-800">1. Information We Collect</h2>
      <p>
        We collect information you provide (such as your email or a listing link) and basic technical data (such as device and browser information) to operate and improve the service.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">2. How We Use Information</h2>
      <p>
        We use your information to generate analyses, respond to requests, maintain security, and improve product quality. We do not sell personal information.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">3. Data Sharing</h2>
      <p>
        We may share information with service providers who help us run the platform (hosting, analytics, email). Providers are bound by contractual obligations to protect your data.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">4. Security</h2>
      <p>
        We use industry-standard security measures, but no system is perfectly secure. Please avoid sending sensitive information over email.
      </p>

      <h2 className="text-base font-semibold text-neutral-800">5. Contact</h2>
      <p>
        Questions? Email{" "}
        <a className="font-medium text-primary-700 underline" href="mailto:hello@buyer-v2.com">
          hello@buyer-v2.com
        </a>
        .
      </p>
    </LegalPage>
  );
}

