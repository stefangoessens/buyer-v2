import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface WaitlistWelcomeEmailProps {
  buyerFirstName: string;
  stateName: string;
  learnMoreUrl: string;
  settings: BrokerageEmailSettings;
}

export function WaitlistWelcomeEmail({
  buyerFirstName,
  stateName,
  learnMoreUrl,
  settings,
}: WaitlistWelcomeEmailProps) {
  return (
    <BrokerageLayout
      previewText={`You're on the ${stateName} waitlist`}
      eyebrow="Waitlist"
      heading={`You’re on the ${stateName} waitlist`}
      settings={settings}
      cta={{ label: "Follow product updates", url: learnMoreUrl }}
    >
      <Section>
        <Text style={paragraph}>Hi {buyerFirstName},</Text>
        <Text style={paragraph}>
          We captured your interest in buyer-v2 outside Florida. We&apos;ll keep
          you posted as we expand brokerage coverage and launch the first
          workflows in {stateName}.
        </Text>
        <Text style={paragraph}>
          Follow product updates here:{" "}
          <Link href={learnMoreUrl} style={link}>
            {learnMoreUrl}
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

export default WaitlistWelcomeEmail;
