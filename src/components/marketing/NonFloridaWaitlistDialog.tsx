"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { MARKETING_AVAILABILITY } from "@/content/marketing-availability";
import { US_STATES } from "@/lib/intake/address";
import { track } from "@/lib/analytics";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_REGEX = /^[0-9]{5}$/;

type SubmitErrorReason =
  | "honeypot"
  | "rate_limited"
  | "invalid_email"
  | "invalid_state"
  | "invalid_zip"
  | "network";

interface NonFloridaWaitlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Marketing route the dialog was opened from — passed through for analytics. */
  route: string;
  /** Fired the first time the upsert returns ok:true. */
  onSubmitSuccess: () => void;
}

interface StateOption {
  code: string;
  fullName: string;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildStateOptions(): StateOption[] {
  return Object.entries(US_STATES)
    .map(([fullName, code]) => ({
      code,
      fullName: titleCase(fullName),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function reasonToInlineError(reason: SubmitErrorReason): string {
  switch (reason) {
    case "rate_limited":
      return "You just signed up — hang tight, we'll email you soon.";
    case "invalid_email":
      return "That email doesn't look right. Double-check and try again.";
    case "invalid_state":
      return "Pick a state from the list.";
    case "invalid_zip":
      return "Zip should be 5 digits or left blank.";
    case "network":
      return "Something went wrong. Try again in a moment.";
    case "honeypot":
      return "";
  }
}

export function NonFloridaWaitlistDialog({
  open,
  onOpenChange,
  route,
  onSubmitSuccess,
}: NonFloridaWaitlistDialogProps) {
  const stateOptions = useMemo(buildStateOptions, []);
  const emailFieldId = useId();
  const stateFieldId = useId();
  const zipFieldId = useId();
  const formErrorId = useId();

  const [email, setEmail] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [stateTouched, setStateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [success, setSuccess] = useState<{ stateName: string } | null>(null);

  const upsert = useMutation(api.waitlistSignups.upsert);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setStateCode("");
      setZip("");
      setHoneypot("");
      setEmailTouched(false);
      setStateTouched(false);
      setSubmitting(false);
      setSubmitError("");
      setSuccess(null);
    }
  }, [open]);

  const trimmedEmail = email.trim();
  const trimmedZip = zip.trim();
  const emailValid = EMAIL_REGEX.test(trimmedEmail);
  const zipValid = trimmedZip === "" || ZIP_REGEX.test(trimmedZip);
  const showEmailError = emailTouched && !emailValid;
  const showStateError = stateTouched && !stateCode;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setEmailTouched(true);
    setStateTouched(true);
    setSubmitError("");

    if (!emailValid) {
      track("waitlist_submit_error", { route, errorKind: "invalid_email" });
      return;
    }
    if (!stateCode) {
      track("waitlist_submit_error", { route, errorKind: "invalid_state" });
      return;
    }
    if (!zipValid) {
      track("waitlist_submit_error", { route, errorKind: "invalid_zip" });
      setSubmitError(reasonToInlineError("invalid_zip"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await upsert({
        email: trimmedEmail,
        stateCode,
        zip: trimmedZip ? trimmedZip : undefined,
        sourcePath: route,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        honeypot: honeypot || undefined,
      });

      if (result.ok) {
        const surface: "desktop" | "mobile" =
          typeof window !== "undefined" && window.innerWidth < 768
            ? "mobile"
            : "desktop";
        track("waitlist_submitted", {
          route,
          surface,
          stateCode,
          zipPresent: trimmedZip.length > 0,
        });
        const stateName =
          stateOptions.find((option) => option.code === stateCode)?.fullName ??
          stateCode;
        setSuccess({ stateName });
        onSubmitSuccess();
        return;
      }

      const reason = result.reason ?? "network";
      track("waitlist_submit_error", { route, errorKind: reason });
      if (reason === "honeypot") {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[waitlist] honeypot tripped on submit");
        }
        // Pretend success to bots — silently no-op the form.
        setSubmitError("");
        return;
      }
      setSubmitError(reasonToInlineError(reason));
    } catch (error) {
      track("waitlist_submit_error", { route, errorKind: "network" });
      if (process.env.NODE_ENV !== "production") {
        console.warn("[waitlist] network error", error);
      }
      setSubmitError(reasonToInlineError("network"));
    } finally {
      setSubmitting(false);
    }
  }

  const successCopy = success
    ? MARKETING_AVAILABILITY.dialog.successTemplate.replace(
        "{stateName}",
        success.stateName,
      )
    : "";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <DialogPrimitive.Content className="relative w-full max-w-full bg-white text-neutral-800 shadow-lg ring-1 ring-neutral-200/80 rounded-t-2xl sm:rounded-2xl sm:max-w-md sm:w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:slide-in-from-bottom-0">
            <DialogPrimitive.Title className="sr-only">
              {success
                ? "You're on the list"
                : MARKETING_AVAILABILITY.dialog.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {MARKETING_AVAILABILITY.dialog.description}
            </DialogPrimitive.Description>
            <DialogPrimitive.Close
              aria-label="Close waitlist dialog"
              className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="size-4"
                aria-hidden="true"
              >
                <path d="M6 6L18 18M6 18L18 6" />
              </svg>
            </DialogPrimitive.Close>

            {success ? (
              <div className="px-6 py-8 sm:px-8">
                <div className="flex flex-col items-center text-center">
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-6"
                      aria-hidden="true"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                  <h2 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-neutral-800">
                    You&rsquo;re on the list
                  </h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    We&rsquo;ll let you know the moment buyer-v2 launches in
                    your state.
                  </p>
                  <p
                    aria-live="polite"
                    className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-800 ring-1 ring-neutral-200/80"
                  >
                    {successCopy}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="mt-6 inline-flex items-center justify-center rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="px-6 py-6 sm:px-8 sm:py-7"
              >
                <h2 className="font-heading text-2xl font-semibold tracking-tight text-neutral-800">
                  {MARKETING_AVAILABILITY.dialog.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {MARKETING_AVAILABILITY.dialog.description}
                </p>

                <div className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor={emailFieldId}
                      className="block text-sm font-medium text-neutral-800"
                    >
                      Email
                    </label>
                    <input
                      id={emailFieldId}
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      aria-invalid={showEmailError || undefined}
                      aria-describedby={
                        showEmailError ? `${emailFieldId}-error` : undefined
                      }
                      className="mt-1.5 block w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200/80 transition placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                      placeholder="you@example.com"
                    />
                    {showEmailError ? (
                      <p
                        id={`${emailFieldId}-error`}
                        className="mt-1.5 text-xs font-medium text-red-600"
                      >
                        That email doesn&rsquo;t look right.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor={stateFieldId}
                      className="block text-sm font-medium text-neutral-800"
                    >
                      State
                    </label>
                    <select
                      id={stateFieldId}
                      name="stateCode"
                      required
                      value={stateCode}
                      onChange={(event) => {
                        setStateCode(event.target.value);
                        setStateTouched(true);
                      }}
                      onBlur={() => setStateTouched(true)}
                      aria-invalid={showStateError || undefined}
                      className="mt-1.5 block w-full appearance-none rounded-2xl border-0 bg-white px-4 py-3 pr-10 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200/80 transition focus:ring-2 focus:ring-primary-600 focus:outline-none"
                    >
                      <option value="" disabled>
                        Choose your state
                      </option>
                      {stateOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.fullName}
                        </option>
                      ))}
                    </select>
                    {showStateError ? (
                      <p className="mt-1.5 text-xs font-medium text-red-600">
                        Pick a state from the list.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor={zipFieldId}
                      className="block text-sm font-medium text-neutral-800"
                    >
                      Zip{" "}
                      <span className="font-normal text-neutral-500">
                        (optional)
                      </span>
                    </label>
                    <input
                      id={zipFieldId}
                      name="zip"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{5}"
                      maxLength={5}
                      autoComplete="postal-code"
                      value={zip}
                      onChange={(event) =>
                        setZip(event.target.value.replace(/[^0-9]/g, ""))
                      }
                      className="mt-1.5 block w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm ring-1 ring-neutral-200/80 transition placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                      placeholder="33133"
                    />
                  </div>

                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    value={honeypot}
                    onChange={(event) => setHoneypot(event.target.value)}
                    style={{
                      position: "absolute",
                      left: "-9999px",
                      width: "1px",
                      height: "1px",
                      opacity: 0,
                    }}
                  />
                </div>

                {submitError ? (
                  <p
                    id={formErrorId}
                    role="alert"
                    className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200"
                  >
                    {submitError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting
                    ? "Joining…"
                    : MARKETING_AVAILABILITY.dialog.submitLabel}
                </button>
                <p className="mt-3 text-center text-xs text-neutral-500">
                  We&rsquo;ll only email when buyer-v2 launches in your state.
                </p>
              </form>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
