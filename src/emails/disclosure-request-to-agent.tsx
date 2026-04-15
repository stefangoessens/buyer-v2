import * as React from "react";
import { Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface DisclosureRequestToAgentEmailProps {
  listingAgentName?: string;
  buyerDisplayName: string;
  propertyAddress: string;
  personalNote?: string;
  replyToAddress: string;
  settings: BrokerageEmailSettings;
}

export function DisclosureRequestToAgentEmail({
  listingAgentName,
  buyerDisplayName,
  propertyAddress,
  personalNote,
  replyToAddress,
  settings,
}: DisclosureRequestToAgentEmailProps) {
  const greeting = listingAgentName?.trim().length
    ? `Hi ${listingAgentName.trim()},`
    : "Hi there,";
  const trimmedNote = personalNote?.trim();

  return (
    <BrokerageLayout
      previewText={`Disclosure request for ${propertyAddress}`}
      eyebrow="Broker-to-broker"
      heading={`Disclosure request for ${propertyAddress}`}
      settings={settings}
    >
      <Section>
        <Text style={paragraph}>{greeting}</Text>
        <Text style={paragraph}>
          I&apos;m reaching out on behalf of {buyerDisplayName}, who is preparing
          to make an offer on {propertyAddress}. Before we finalize terms,
          we&apos;re asking for the seller&apos;s disclosure packet, HOA or condo
          documents, recent inspection reports, permit history, and any known
          material defects.
        </Text>
        <Text style={paragraph}>
          You can reply directly to {replyToAddress} with attachments. PDF is
          preferred, but any documentation that helps the buyer review the
          property is useful.
        </Text>
        <Text style={paragraph}>
          If a formal request letter or signed acknowledgement is needed on our
          side, let me know and I&apos;ll send it over the same day.
        </Text>
        {trimmedNote ? (
          <Section style={noteBox}>
            <Text style={noteLabel}>Personal note from the buyer</Text>
            <Text style={noteText}>{trimmedNote}</Text>
          </Section>
        ) : null}
        <Text style={paragraph}>
          Thanks for your help. We&apos;ll keep the turnaround tight on our end.
        </Text>
        <Text style={paragraph}>
          Best,
          <br />
          {settings.outboundFromName}
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

const noteBox: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #d9e3f0",
  borderRadius: "18px",
  margin: "18px 0",
  padding: "18px 20px",
};

const noteLabel: React.CSSProperties = {
  color: "#0f6fde",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  margin: "0 0 8px",
  textTransform: "uppercase",
};

const noteText: React.CSSProperties = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: 1.7,
  margin: 0,
  whiteSpace: "pre-wrap",
};

export default DisclosureRequestToAgentEmail;
