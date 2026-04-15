// @ts-nocheck
"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { readTwilioRuntimeConfig, startTwilioVerification, checkTwilioVerification } from "../notifications/providerAdapters/twilio";
import { normalizePhone } from "../lib/smsIntakeCompute";
import { smsConsentSource } from "../lib/validators";

const CONSENT_POLICY_VERSION =
  process.env.SMS_CONSENT_POLICY_VERSION ?? "2026-04-dashboard-enrollment";

export const startEnrollment = action({
  args: {
    phone: v.string(),
    consentSource: v.optional(smsConsentSource),
  },
  returns: v.object({
    status: v.string(),
    sid: v.string(),
    phone: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.buyerProfiles.getMyProfile, {});
    if (!profile) {
      throw new Error("Authentication required");
    }

    const normalizedPhone = normalizePhone(args.phone);
    if (!normalizedPhone) {
      throw new Error("Please enter a valid phone number");
    }

    const config = readTwilioRuntimeConfig();
    if (!config) {
      throw new Error("Twilio SMS is not configured");
    }

    const result = await startTwilioVerification(config, normalizedPhone);
    return {
      status: result.status,
      sid: result.sid,
      phone: normalizedPhone,
    };
  },
});

export const checkEnrollment = action({
  args: {
    phone: v.string(),
    code: v.string(),
    consentSource: v.optional(smsConsentSource),
  },
  returns: v.object({
    approved: v.boolean(),
    status: v.string(),
    sid: v.string(),
    phone: v.string(),
    senderNumber: v.string(),
    policyVersion: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(api.buyerProfiles.getMyProfile, {});
    if (!profile) {
      throw new Error("Authentication required");
    }

    const normalizedPhone = normalizePhone(args.phone);
    if (!normalizedPhone) {
      throw new Error("Please enter a valid phone number");
    }

    const code = args.code.trim();
    if (code.length < 4 || code.length > 10) {
      throw new Error("Please enter the verification code");
    }

    const config = readTwilioRuntimeConfig();
    if (!config) {
      throw new Error("Twilio SMS is not configured");
    }

    const result = await checkTwilioVerification(config, normalizedPhone, code);
    if (!result.valid || result.status !== "approved") {
      return {
        approved: false,
        status: result.status,
        sid: result.sid,
        phone: normalizedPhone,
        senderNumber: config.fromNumber,
        policyVersion: CONSENT_POLICY_VERSION,
      };
    }

    const now = new Date().toISOString();
    await ctx.runMutation(internal.buyerProfiles.recordSmsConsent, {
      userId: profile.userId,
      phone: normalizedPhone,
      consentState: "verified",
      consentSource: args.consentSource ?? "dashboard_banner",
      policyVersion: CONSENT_POLICY_VERSION,
      verificationSid: result.sid,
      consentedAt: now,
    });
    await ctx.runMutation(internal.sms.store.markUserPhoneVerified, {
      userId: profile.userId,
      phone: normalizedPhone,
      verifiedAt: now,
    });
    await ctx.runMutation(api.buyerProfiles.updateCommPrefs, {
      channels: { sms: true },
      categories: { transactional: true },
    });

    return {
      approved: true,
      status: result.status,
      sid: result.sid,
      phone: normalizedPhone,
      senderNumber: config.fromNumber,
      policyVersion: CONSENT_POLICY_VERSION,
    };
  },
});
