import type {
  DeliveryRequest,
  DeliveryResult,
  ExternalNotificationChannel,
  ProviderAdapter,
  WebhookEvent,
} from "@/lib/notifications/types";
import { apnsAdapter } from "./apns";
import { resendAdapter } from "./resend";
import { twilioAdapter } from "./twilio";

const PROVIDER_ADAPTERS: Record<ExternalNotificationChannel, ProviderAdapter> = {
  email: resendAdapter,
  sms: twilioAdapter,
  push: apnsAdapter,
};

export type { DeliveryRequest, DeliveryResult, ProviderAdapter, WebhookEvent };

export function getProviderAdapter(
  channel: ExternalNotificationChannel,
): ProviderAdapter {
  return PROVIDER_ADAPTERS[channel];
}
