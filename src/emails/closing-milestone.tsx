import * as React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  BrokerageLayout,
  type BrokerageEmailSettings,
} from "./layouts/BrokerageLayout";

export interface ClosingMilestoneEmailProps {
  buyerFirstName: string;
  propertyAddress: string;
  milestoneName: string;
  dueDate: string;
  actionUrl: string;
  settings: BrokerageEmailSettings;
}

export function ClosingMilestoneEmail({
  buyerFirstName,
  propertyAddress,
  milestoneName,
  dueDate,
  actionUrl,
  settings,
}: ClosingMilestoneEmailProps) {
  return (
    <BrokerageLayout
      previewText={`${milestoneName} is coming up`}
      eyebrow="Closing"
      heading={`${milestoneName} is coming up`}
      settings={settings}
      cta={{ label: "Open closing checklist", url: actionUrl }}
    >
      <Section>
        <Text style={paragraph}>Hi {buyerFirstName},</Text>
        <Text style={paragraph}>
          {milestoneName} for {propertyAddress} is due by {dueDate}. We&apos;re
          surfacing it now so there&apos;s still time to clear blockers without
          compressing the rest of the close.
        </Text>
        <Text style={paragraph}>
          Review the checklist here:{" "}
          <Link href={actionUrl} style={link}>
            {actionUrl}
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

export default ClosingMilestoneEmail;
