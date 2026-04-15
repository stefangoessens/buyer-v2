import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { BrokerageEmailSettings } from "@/emails/layouts/BrokerageLayout";

type SettingsCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

const DEFAULT_SETTINGS = {
  siteName: "buyer-v2",
  outboundFromName: "buyer-v2 Brokerage",
  outboundFromEmail: "broker@buyer-v2.app",
  replyDomain: "reply.buyer-v2.app",
  signaturePostalAddress: "",
  flLicenseNumber: "",
  supportEmail: "support@buyerv2.com",
  resendApiKeyEnvVarName: "RESEND_API_KEY",
  resendWebhookSecretEnvVarName: "RESEND_WEBHOOK_SECRET",
  marketingListId: "",
} as const;

export interface ResolvedEmailRuntimeSettings {
  branding: BrokerageEmailSettings;
  replyDomain: string;
  resendApiKeyEnvVarName: string;
  resendWebhookSecretEnvVarName: string;
  marketingListId: string;
}

async function readStringSetting(
  ctx: SettingsCtx,
  key: string,
  fallback: string,
): Promise<string> {
  const row = await ctx.db
    .query("settingsEntries")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!row) return fallback;
  if (row.kind === "string") {
    return row.stringValue ?? fallback;
  }
  if (row.kind === "richText") {
    return row.richTextValue ?? fallback;
  }
  return fallback;
}

export async function resolveEmailRuntimeSettings(
  ctx: SettingsCtx,
): Promise<ResolvedEmailRuntimeSettings> {
  const [
    siteName,
    outboundFromName,
    outboundFromEmail,
    replyDomain,
    signaturePostalAddress,
    flLicenseNumber,
    supportEmail,
    resendApiKeyEnvVarName,
    resendWebhookSecretEnvVarName,
    marketingListId,
  ] = await Promise.all([
    readStringSetting(ctx, "branding.site_name", DEFAULT_SETTINGS.siteName),
    readStringSetting(
      ctx,
      "broker.outbound_from_name",
      DEFAULT_SETTINGS.outboundFromName,
    ),
    readStringSetting(
      ctx,
      "broker.outbound_from_email",
      DEFAULT_SETTINGS.outboundFromEmail,
    ),
    readStringSetting(ctx, "broker.reply_domain", DEFAULT_SETTINGS.replyDomain),
    readStringSetting(
      ctx,
      "broker.signature_postal_address",
      DEFAULT_SETTINGS.signaturePostalAddress,
    ),
    readStringSetting(
      ctx,
      "broker.fl_license_number",
      DEFAULT_SETTINGS.flLicenseNumber,
    ),
    readStringSetting(ctx, "ops.support_email", DEFAULT_SETTINGS.supportEmail),
    readStringSetting(
      ctx,
      "email.resend_api_key_env_var_name",
      DEFAULT_SETTINGS.resendApiKeyEnvVarName,
    ),
    readStringSetting(
      ctx,
      "email.resend_webhook_secret_env_var_name",
      DEFAULT_SETTINGS.resendWebhookSecretEnvVarName,
    ),
    readStringSetting(
      ctx,
      "email.marketing_list_id",
      DEFAULT_SETTINGS.marketingListId,
    ),
  ]);

  return {
    branding: {
      siteName,
      outboundFromName,
      outboundFromEmail,
      signaturePostalAddress,
      flLicenseNumber,
      unsubscribeUrl: buildPreferenceCenterUrl(),
      supportEmail,
    },
    replyDomain,
    resendApiKeyEnvVarName,
    resendWebhookSecretEnvVarName,
    marketingListId,
  };
}

export function buildPreferenceCenterUrl(): string {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${baseUrl}/dashboard/profile#notifications`;
}

export function buildDisclosureReplyToAddress(
  dealRoomId: Id<"dealRooms">,
  replyDomain: string,
): string {
  const normalizedDomain = replyDomain.trim().replace(/^@+/, "");
  return `disclosures+${dealRoomId}@${normalizedDomain}`;
}
