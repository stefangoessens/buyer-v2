import * as React from "react";
import { render, toPlainText } from "@react-email/render";
import type { EmailTemplateKey, EmailStream } from "@buyer-v2/shared";
import {
  AccountWelcomeEmail,
  type AccountWelcomeEmailProps,
} from "@/emails/account-welcome";
import {
  ClosingMilestoneEmail,
  type ClosingMilestoneEmailProps,
} from "@/emails/closing-milestone";
import {
  DisclosureReadyEmail,
  type DisclosureReadyEmailProps,
} from "@/emails/disclosure-ready";
import {
  DisclosureRequestToAgentEmail,
  type DisclosureRequestToAgentEmailProps,
} from "@/emails/disclosure-request-to-agent";
import {
  OfferCounteredEmail,
  type OfferCounteredEmailProps,
} from "@/emails/offer-countered";
import {
  OfferGateCallbackConfirmationEmail,
  type OfferGateCallbackConfirmationEmailProps,
} from "@/emails/offer-gate-callback-confirmation";
import {
  TourConfirmedEmail,
  type TourConfirmedEmailProps,
} from "@/emails/tour-confirmed";
import {
  WaitlistWelcomeEmail,
  type WaitlistWelcomeEmailProps,
} from "@/emails/waitlist-welcome";
import type { BrokerageEmailSettings } from "@/emails/layouts/BrokerageLayout";

export type EmailTemplateVariablesMap = {
  "account-welcome": AccountWelcomeEmailProps;
  "offer-gate-callback-confirmation": OfferGateCallbackConfirmationEmailProps;
  "disclosure-request-to-agent": DisclosureRequestToAgentEmailProps;
  "disclosure-ready": DisclosureReadyEmailProps;
  "tour-confirmed": TourConfirmedEmailProps;
  "offer-countered": OfferCounteredEmailProps;
  "closing-milestone": ClosingMilestoneEmailProps;
  "waitlist-welcome": WaitlistWelcomeEmailProps;
};

export interface RenderedEmailTemplate {
  subject: string;
  html: string;
  text: string;
  stream: EmailStream;
}

interface EmailTemplateDefinition<K extends EmailTemplateKey> {
  stream: EmailStream;
  buildSubject: (variables: EmailTemplateVariablesMap[K]) => string;
  render: (variables: EmailTemplateVariablesMap[K]) => React.ReactElement;
  buildText?: (variables: EmailTemplateVariablesMap[K]) => string;
}

export type AnyEmailTemplateVariables =
  EmailTemplateVariablesMap[EmailTemplateKey];

export const DEFAULT_BROKERAGE_EMAIL_SETTINGS: BrokerageEmailSettings = {
  siteName: "buyer-v2",
  outboundFromName: "buyer-v2 Brokerage",
  outboundFromEmail: "broker@buyer-v2.app",
  signaturePostalAddress: "",
  flLicenseNumber: "",
  unsubscribeUrl: "http://localhost:3000/dashboard/profile#notifications",
  supportEmail: "support@buyerv2.com",
};

const EMAIL_TEMPLATE_DEFINITIONS: {
  [K in EmailTemplateKey]: EmailTemplateDefinition<K>;
} = {
  "account-welcome": {
    stream: "relationship",
    buildSubject: ({ buyerFirstName }) => `Welcome to buyer-v2, ${buyerFirstName}`,
    render: (variables) => React.createElement(AccountWelcomeEmail, variables),
  },
  "offer-gate-callback-confirmation": {
    stream: "transactional",
    buildSubject: ({ propertyAddress }) =>
      `We have your callback request for ${propertyAddress}`,
    render: (variables) =>
      React.createElement(OfferGateCallbackConfirmationEmail, variables),
  },
  "disclosure-request-to-agent": {
    stream: "transactional",
    buildSubject: ({ propertyAddress }) => `Disclosure request — ${propertyAddress}`,
    render: (variables) =>
      React.createElement(DisclosureRequestToAgentEmail, variables),
    buildText: (variables) => {
      const greeting = variables.listingAgentName?.trim().length
        ? `Hi ${variables.listingAgentName.trim()},`
        : "Hi there,";
      const lines = [
        greeting,
        "",
        `I'm reaching out on behalf of ${variables.buyerDisplayName}, who is preparing to make an offer on ${variables.propertyAddress}. Before we finalize terms, we're asking for the seller's disclosure packet, HOA or condo documents, recent inspection reports, permit history, and any known material defects.`,
        "",
        `You can reply directly to ${variables.replyToAddress} with attachments. PDF is preferred, but any documentation that helps the buyer review the property is useful.`,
        "",
        "If a formal request letter or signed acknowledgement is needed on our side, let me know and I'll send it over the same day.",
      ];

      const note = variables.personalNote?.trim();
      if (note) {
        lines.push("", "Personal note from the buyer:", note);
      }

      lines.push(
        "",
        "Thanks for your help.",
        "",
        "Best,",
        variables.settings.outboundFromName,
      );
      return lines.join("\n");
    },
  },
  "disclosure-ready": {
    stream: "transactional",
    buildSubject: ({ propertyAddress }) =>
      `Disclosure packet ready — ${propertyAddress}`,
    render: (variables) => React.createElement(DisclosureReadyEmail, variables),
  },
  "tour-confirmed": {
    stream: "transactional",
    buildSubject: ({ propertyAddress }) => `Tour confirmed — ${propertyAddress}`,
    render: (variables) => React.createElement(TourConfirmedEmail, variables),
  },
  "offer-countered": {
    stream: "transactional",
    buildSubject: ({ propertyAddress }) =>
      `Seller countered — ${propertyAddress}`,
    render: (variables) => React.createElement(OfferCounteredEmail, variables),
  },
  "closing-milestone": {
    stream: "transactional",
    buildSubject: ({ milestoneName, propertyAddress }) =>
      `${milestoneName} due — ${propertyAddress}`,
    render: (variables) => React.createElement(ClosingMilestoneEmail, variables),
  },
  "waitlist-welcome": {
    stream: "relationship",
    buildSubject: ({ stateName }) =>
      `You're on the buyer-v2 waitlist for ${stateName}`,
    render: (variables) => React.createElement(WaitlistWelcomeEmail, variables),
  },
};

export function getEmailTemplateStream(templateKey: EmailTemplateKey): EmailStream {
  return EMAIL_TEMPLATE_DEFINITIONS[templateKey].stream;
}

export async function renderTemplate<K extends EmailTemplateKey>(
  templateKey: K,
  variables: EmailTemplateVariablesMap[K],
): Promise<RenderedEmailTemplate> {
  const definition = EMAIL_TEMPLATE_DEFINITIONS[templateKey];
  const subject = definition.buildSubject(variables);
  const html = await render(definition.render(variables));
  const text = definition.buildText
    ? definition.buildText(variables)
    : toPlainText(html);

  return {
    subject,
    html,
    text,
    stream: definition.stream,
  };
}
