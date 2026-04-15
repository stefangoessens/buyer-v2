import type { Id } from "../_generated/dataModel";
import { selectDriver, type MailMessage } from "../mailRail";

export const WELCOME_EMAIL_TEMPLATE_KEY = "buyer_first_account_welcome_v1";

export const WELCOME_EMAIL_FROM_ADDRESS = "hello@buyer-v2.com";
export const WELCOME_EMAIL_FROM_NAME = "buyer-v2 Brokerage";

type WelcomeEmailUserRow = {
  _id: Id<"users">;
  email: string;
  name: string;
  role: "buyer" | "broker" | "admin";
  welcomeEmailQueuedAt?: string;
  welcomeEmailProviderMessageId?: string;
  welcomeEmailTemplateKey?: string;
};

type WelcomeEmailCtx = {
  db: {
    get(id: Id<"users">): Promise<WelcomeEmailUserRow | null>;
    patch(id: Id<"users">, value: Record<string, unknown>): Promise<void>;
  };
};

type WelcomeEmailCallbackArgs = {
  userId: Id<"users">;
  existingUserId: Id<"users"> | null;
  type: "oauth" | "credentials" | "email" | "phone" | "verification";
};

export type WelcomeEmailOutcome =
  | { queued: true; providerMessageId: string }
  | {
      queued: false;
      reason:
        | "existing_account"
        | "not_buyer"
        | "already_handled"
        | "missing_user"
        | "missing_email"
        | "delivery_failed";
    };

export function composeWelcomeEmail(params: {
  buyerName: string;
  to: string;
}): MailMessage {
  const bodyText = [
    `Hi ${params.buyerName},`,
    "",
    "Your buyer-v2 account is ready.",
    "",
    "Next steps:",
    "- Paste a Zillow, Redfin, or Realtor.com link so we can build the property record.",
    "- Complete your profile so we can keep your preferences, timeline, and contact details current.",
    "- Schedule a tour when you have a place in mind.",
    "",
    "When a listing's terms support a buyer-side credit, we'll show the rebate math in context before you decide. If the terms do not support a credit, we'll say that plainly.",
    "",
    "If you already have a listing in mind, reply with the link and we'll take it from there.",
    "",
    "Best,",
    WELCOME_EMAIL_FROM_NAME,
  ].join("\n");

  return {
    kind: "raw",
    to: params.to,
    from: WELCOME_EMAIL_FROM_ADDRESS,
    fromName: WELCOME_EMAIL_FROM_NAME,
    subject: "Welcome to buyer-v2",
    bodyText,
    replyTo: WELCOME_EMAIL_FROM_ADDRESS,
    metadata: {
      feature: "kin-1096-welcome-email",
      templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    },
  };
}

function isWelcomeEmailRecorded(user: WelcomeEmailUserRow | null): boolean {
  return (
    user !== null &&
    ((typeof user.welcomeEmailQueuedAt === "string" &&
      user.welcomeEmailQueuedAt.length > 0) ||
      (typeof user.welcomeEmailProviderMessageId === "string" &&
        user.welcomeEmailProviderMessageId.length > 0) ||
      (typeof user.welcomeEmailTemplateKey === "string" &&
        user.welcomeEmailTemplateKey.length > 0))
  );
}

export async function sendWelcomeEmailForNewBuyerAccount(
  ctx: WelcomeEmailCtx,
  args: WelcomeEmailCallbackArgs,
): Promise<WelcomeEmailOutcome> {
  if (args.existingUserId !== null) {
    return { queued: false, reason: "existing_account" };
  }

  const user = await ctx.db.get(args.userId);
  if (user === null) {
    return { queued: false, reason: "missing_user" };
  }

  if (user.role !== "buyer") {
    return { queued: false, reason: "not_buyer" };
  }

  if (isWelcomeEmailRecorded(user)) {
    return { queued: false, reason: "already_handled" };
  }

  const recipientEmail = user.email.trim();
  if (recipientEmail.length === 0) {
    return { queued: false, reason: "missing_email" };
  }

  let providerName = "unavailable";
  try {
    const driver = selectDriver();
    providerName = driver.name;
    const mailMessage = {
      ...composeWelcomeEmail({
        buyerName: user.name.trim() || "there",
        to: recipientEmail,
      }),
      metadata: {
        feature: "kin-1096-welcome-email",
        templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
        userId: String(user._id),
        authType: args.type,
      },
    };
    const { providerMessageId } = await driver.send(mailMessage);
    const queuedAt = new Date().toISOString();
    await ctx.db.patch(user._id, {
      welcomeEmailQueuedAt: queuedAt,
      welcomeEmailProviderMessageId: providerMessageId,
      welcomeEmailTemplateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    });
    return { queued: true, providerMessageId };
  } catch (error) {
    console.error("[welcomeMail] welcome email delivery failed", {
      userId: String(user._id),
      templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
      provider: providerName,
      errorName:
        error instanceof Error ? error.name : typeof error,
    });
    return { queued: false, reason: "delivery_failed" };
  }
}
