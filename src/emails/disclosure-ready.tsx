import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface DisclosureReadyEmailProps {
  buyerFirstName: string;
  propertyAddress: string;
  redFlagSummary: string;
  disclosuresUrl: string;
  settings: BrokerageEmailSettings;
}

export function DisclosureReadyEmail({
  buyerFirstName,
  propertyAddress,
  redFlagSummary,
  disclosuresUrl,
  settings,
}: DisclosureReadyEmailProps) {
  return (
    <BrokerageLayout
      previewText={`Disclosure packet ready for ${propertyAddress}`}
      eyebrow="Disclosures"
      heading="Your disclosure packet is ready"
      settings={settings}
      cta={{ label: "Review disclosures", url: disclosuresUrl }}
    >
      <Section>
        <Text style={paragraph}>Hi {buyerFirstName},</Text>
        <Text style={paragraph}>
          We finished processing the disclosure packet for {propertyAddress}.
          The buyer view now includes the uploaded documents, AI notes, and the
          broker review state for anything that needs a second look.
        </Text>
        <Text style={summaryBox}>{redFlagSummary}</Text>
        <Text style={paragraph}>
          You can review the packet here:{" "}
          <Link href={disclosuresUrl} style={link}>
            {disclosuresUrl}
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

const summaryBox: React.CSSProperties = {
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "18px",
  color: "#1e3a8a",
  fontSize: "14px",
  lineHeight: 1.7,
  margin: "6px 0 18px",
  padding: "16px 18px",
  whiteSpace: "pre-wrap",
};

const link: React.CSSProperties = {
  color: "#0f6fde",
};

export default DisclosureReadyEmail;
