import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface OfferCounteredEmailProps {
  buyerFirstName: string;
  propertyAddress: string;
  counterPrice: string;
  offerUrl: string;
  settings: BrokerageEmailSettings;
}

export function OfferCounteredEmail({
  buyerFirstName,
  propertyAddress,
  counterPrice,
  offerUrl,
  settings,
}: OfferCounteredEmailProps) {
  return (
    <BrokerageLayout
      previewText={`Seller countered on ${propertyAddress}`}
      eyebrow="Offers"
      heading="Seller counter received"
      settings={settings}
      cta={{ label: "Review the counter", url: offerUrl }}
    >
      <Section>
        <Text style={paragraph}>Hi {buyerFirstName},</Text>
        <Text style={paragraph}>
          The seller sent a counter on {propertyAddress}. The latest number on
          the table is {counterPrice}.
        </Text>
        <Text style={paragraph}>
          Open the offer workspace to review terms, compare scenarios, and pick
          the next move with the brokerage.
        </Text>
        <Text style={paragraph}>
          Offer workspace:{" "}
          <Link href={offerUrl} style={link}>
            {offerUrl}
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

export default OfferCounteredEmail;
