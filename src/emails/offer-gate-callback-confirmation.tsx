import * as React from "react";
import { Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface OfferGateCallbackConfirmationEmailProps {
  buyerFirstName: string;
  propertyAddress: string;
  callbackWindow: string;
  settings: BrokerageEmailSettings;
}

export function OfferGateCallbackConfirmationEmail({
  buyerFirstName,
  propertyAddress,
  callbackWindow,
  settings,
}: OfferGateCallbackConfirmationEmailProps) {
  return (
    <BrokerageLayout
      previewText="We have your callback request."
      eyebrow="Offer support"
      heading="We have your callback request"
      settings={settings}
    >
      <Section>
        <Text style={paragraph}>Hi {buyerFirstName},</Text>
        <Text style={paragraph}>
          We received your request for help on {propertyAddress}. A licensed
          broker will call within {callbackWindow} to confirm strategy, timing,
          and anything we need before the offer starts moving.
        </Text>
        <Text style={paragraph}>
          Keep your phone nearby. If we miss you, reply to this email and we
          will work the thread instead.
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

export default OfferGateCallbackConfirmationEmail;
