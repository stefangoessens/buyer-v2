export const SMS_TEMPLATE_KEYS = [
  "offer-gate-callback-confirmation",
  "tour-confirmed-same-day",
  "tour-reminder-2h",
  "offer-countered",
  "wire-fraud-warning",
  "closing-reminder-24h",
] as const;

export type SmsTemplateKey = (typeof SMS_TEMPLATE_KEYS)[number];

export type SmsTemplateCategory =
  | "transactional"
  | "tours"
  | "offers"
  | "updates"
  | "safety";

export interface SmsTemplateDefinition {
  key: SmsTemplateKey;
  category: SmsTemplateCategory;
  bypassSuppression?: boolean;
  render: (vars: Record<string, string>) => string;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function required(vars: Record<string, string>, key: string): string {
  const value = vars[key]?.trim();
  if (!value) {
    throw new Error(`Missing SMS template variable "${key}"`);
  }
  return value;
}

export const SMS_TEMPLATES: Record<SmsTemplateKey, SmsTemplateDefinition> = {
  "offer-gate-callback-confirmation": {
    key: "offer-gate-callback-confirmation",
    category: "transactional",
    render: (vars) =>
      compact(
        `A ${required(vars, "brand")} broker will call you within 1 business hour at ${required(vars, "phone")}. Reply STOP to opt out.`,
      ),
  },
  "tour-confirmed-same-day": {
    key: "tour-confirmed-same-day",
    category: "tours",
    render: (vars) =>
      compact(
        `Your tour at ${required(vars, "address")} is confirmed for ${required(vars, "time")}. Reply STOP to opt out.`,
      ),
  },
  "tour-reminder-2h": {
    key: "tour-reminder-2h",
    category: "tours",
    render: (vars) =>
      compact(
        `Tour at ${required(vars, "address")} in 2 hours. ${required(vars, "agentName")} will meet you there.`,
      ),
  },
  "offer-countered": {
    key: "offer-countered",
    category: "offers",
    render: (vars) =>
      compact(
        `Seller countered your offer. Open ${required(vars, "brand")} to see terms: ${required(vars, "shortLink")}`,
      ),
  },
  "wire-fraud-warning": {
    key: "wire-fraud-warning",
    category: "safety",
    bypassSuppression: true,
    render: (vars) =>
      compact(
        `Warning: ${required(vars, "brand")} wire safety alert. Verify wire instructions by phone before sending funds.`,
      ),
  },
  "closing-reminder-24h": {
    key: "closing-reminder-24h",
    category: "updates",
    render: (vars) =>
      compact(
        `Closing tomorrow at ${required(vars, "time")}. See your checklist: ${required(vars, "shortLink")}`,
      ),
  },
};

export function renderSmsTemplate(
  key: SmsTemplateKey,
  vars: Record<string, string>,
): string {
  return SMS_TEMPLATES[key].render(vars);
}
