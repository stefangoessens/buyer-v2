import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface BrokerageEmailSettings {
  siteName: string;
  outboundFromName: string;
  outboundFromEmail: string;
  signaturePostalAddress: string;
  flLicenseNumber: string;
  unsubscribeUrl: string;
  supportEmail: string;
}

interface BrokerageLayoutProps {
  previewText: string;
  heading: string;
  settings: BrokerageEmailSettings;
  children: React.ReactNode;
  eyebrow?: string;
  cta?: {
    label: string;
    url: string;
  };
  showUnsubscribe?: boolean;
}

function renderAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.length > 0
    ? trimmed
    : "Physical brokerage address pending compliance review.";
}

function renderLicense(license: string): string {
  const trimmed = license.trim();
  return trimmed.length > 0
    ? `Florida broker license: ${trimmed}`
    : "Florida broker license pending compliance review.";
}

export function BrokerageLayout({
  previewText,
  heading,
  settings,
  children,
  eyebrow,
  cta,
  showUnsubscribe = true,
}: BrokerageLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={card}>
            <Section style={brandRow}>
              <Text style={brandMark}>b2</Text>
              <div>
                <Text style={brandName}>{settings.siteName}</Text>
                <Text style={brandSubhead}>{settings.outboundFromName}</Text>
              </div>
            </Section>

            {eyebrow ? <Text style={eyebrowText}>{eyebrow}</Text> : null}
            <Heading style={headingStyle}>{heading}</Heading>

            <Section>{children}</Section>

            {cta ? (
              <Section style={ctaSection}>
                <Button href={cta.url} style={button}>
                  {cta.label}
                </Button>
              </Section>
            ) : null}

            <Hr style={rule} />

            <Section style={footer}>
              <Text style={footerText}>
                Sent by {settings.outboundFromName} ({settings.outboundFromEmail})
              </Text>
              <Text style={footerText}>{renderLicense(settings.flLicenseNumber)}</Text>
              <Text style={footerText}>{renderAddress(settings.signaturePostalAddress)}</Text>
              <Text style={footerText}>
                Questions? Reply to this email or contact{" "}
                <Link href={`mailto:${settings.supportEmail}`} style={footerLink}>
                  {settings.supportEmail}
                </Link>
                .
              </Text>
              {showUnsubscribe ? (
                <Text style={footerText}>
                  Manage preferences or unsubscribe:{" "}
                  <Link href={settings.unsubscribeUrl} style={footerLink}>
                    {settings.unsubscribeUrl}
                  </Link>
                </Text>
              ) : null}
              <Text style={footerLegal}>
                Transactional and relationship email is sent separately so critical
                tour, offer, disclosure, and closing updates stay isolated from
                marketing programs.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f3f7fb",
  fontFamily:
    "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0,
  padding: "32px 0",
};

const container: React.CSSProperties = {
  margin: "0 auto",
  maxWidth: "640px",
  padding: "0 16px",
};

const card: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #d9e3f0",
  borderRadius: "24px",
  padding: "32px",
  boxShadow: "0 18px 48px rgba(15, 111, 222, 0.08)",
};

const brandRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  marginBottom: "24px",
};

const brandMark: React.CSSProperties = {
  backgroundColor: "#0f6fde",
  borderRadius: "14px",
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: 700,
  height: "44px",
  lineHeight: "44px",
  margin: 0,
  textAlign: "center",
  width: "44px",
};

const brandName: React.CSSProperties = {
  color: "#0f172a",
  fontSize: "18px",
  fontWeight: 700,
  lineHeight: 1.2,
  margin: 0,
};

const brandSubhead: React.CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: 1.4,
  margin: "4px 0 0",
};

const eyebrowText: React.CSSProperties = {
  color: "#0f6fde",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  margin: "0 0 10px",
  textTransform: "uppercase",
};

const headingStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: "30px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.15,
  margin: "0 0 18px",
};

const ctaSection: React.CSSProperties = {
  marginTop: "24px",
};

const button: React.CSSProperties = {
  backgroundColor: "#0f6fde",
  borderRadius: "14px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  padding: "14px 20px",
  textDecoration: "none",
};

const rule: React.CSSProperties = {
  borderColor: "#d9e3f0",
  margin: "28px 0 20px",
};

const footer: React.CSSProperties = {
  color: "#475569",
};

const footerText: React.CSSProperties = {
  color: "#475569",
  fontSize: "12px",
  lineHeight: 1.6,
  margin: "0 0 8px",
  whiteSpace: "pre-wrap",
};

const footerLink: React.CSSProperties = {
  color: "#0f6fde",
  textDecoration: "underline",
};

const footerLegal: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "11px",
  lineHeight: 1.6,
  margin: "12px 0 0",
};
