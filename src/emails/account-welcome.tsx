import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface AccountWelcomeEmailProps {
  buyerFirstName: string;
  dashboardUrl: string;
  settings: BrokerageEmailSettings;
}

export function AccountWelcomeEmail({
  buyerFirstName,
  dashboardUrl,
  settings,
}: AccountWelcomeEmailProps) {
  return (
    <BrokerageLayout
      previewText="Your buyer-v2 account is ready."
      eyebrow="Welcome"
      heading={`Welcome to buyer-v2, ${buyerFirstName}`}
      settings={settings}
      cta={{ label: "Open your dashboard", url: dashboardUrl }}
    >
      <Section>
        <Text style={paragraph}>
          Your account is live. We built buyer-v2 so the brokerage work feels
          organized from the first showing request through closing.
        </Text>
        <Text style={paragraph}>
          Your dashboard is where we will keep your active homes, tours, offer
          activity, disclosures, and milestone reminders in one place.
        </Text>
        <Text style={paragraph}>
          If you already have a property in mind, drop the address or listing
          link into buyer-v2 and we will start a deal room around it.
        </Text>
        <Text style={paragraph}>
          Direct link:{" "}
          <Link href={dashboardUrl} style={link}>
            {dashboardUrl}
          </Link>
        </Text>
      </Section>
    </BrokerageLayout>
  );
}

const paragraph: React.CSSProperties = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: 1.7,
  margin: "0 0 14px",
};

const link: React.CSSProperties = {
  color: "#0f6fde",
};

export default AccountWelcomeEmail;
