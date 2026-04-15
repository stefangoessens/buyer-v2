import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface TourConfirmedEmailProps {
  buyerFirstName: string;
  propertyAddress: string;
  scheduledAt: string;
  itineraryUrl: string;
  settings: BrokerageEmailSettings;
}

export function TourConfirmedEmail({
  buyerFirstName,
  propertyAddress,
  scheduledAt,
  itineraryUrl,
  settings,
}: TourConfirmedEmailProps) {
  return (
    <BrokerageLayout
      previewText={`Tour confirmed for ${propertyAddress}`}
      eyebrow="Tours"
      heading="Your tour is confirmed"
      settings={settings}
      cta={{ label: "View itinerary", url: itineraryUrl }}
    >
      <Section>
        <Text style={paragraph}>Hi {buyerFirstName},</Text>
        <Text style={paragraph}>
          Your tour for {propertyAddress} is locked in for {scheduledAt}.
          We&apos;ll keep the deal room updated if the route, access notes, or
          timing shifts.
        </Text>
        <Text style={paragraph}>
          Full itinerary:{" "}
          <Link href={itineraryUrl} style={link}>
            {itineraryUrl}
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

export default TourConfirmedEmail;
