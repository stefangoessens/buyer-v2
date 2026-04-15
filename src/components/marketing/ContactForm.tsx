"use client";

import { useMutation } from "convex/react";
import { useId, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/lib/analytics";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactSubmissionResult =
  | { ok: true }
  | { ok: false; reason?: string | null };

type ContactMessageLengthBucket =
  | "short"
  | "medium"
  | "long"
  | "very_long";

interface ContactFormProps {
  sourcePath: string;
}

function bucketMessageLength(length: number): ContactMessageLengthBucket {
  if (length < 120) return "short";
  if (length < 300) return "medium";
  if (length < 700) return "long";
  return "very_long";
}

function reasonToMessage(reason: string): string {
  switch (reason) {
    case "invalid_name":
      return "Please add your name.";
    case "invalid_email":
      return "That email doesn't look right. Please double-check it.";
    case "invalid_message":
      return "Please add a little more detail about what you need.";
    case "invalid_listing_link":
      return "That listing link doesn't look right. Please paste the full URL.";
    case "rate_limited":
      return "You just sent a message. Please wait a minute and try again.";
    case "honeypot":
    case "network":
    default:
      return "We couldn't send that right now. Please try again in a moment.";
  }
}

export function ContactForm({ sourcePath }: ContactFormProps) {
  const submitContact = useMutation(api.contactRequests.submitPublic);
  const nameFieldId = useId();
  const emailFieldId = useId();
  const listingLinkFieldId = useId();
  const messageFieldId = useId();
  const errorId = useId();
  const successId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [listingLink, setListingLink] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [messageTouched, setMessageTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedListingLink = listingLink.trim();
  const trimmedMessage = message.trim();

  const isValidName = trimmedName.length > 0;
  const isValidEmail = EMAIL_REGEX.test(trimmedEmail);
  const isValidMessage = trimmedMessage.length >= 10;
  const showNameError = nameTouched && !isValidName;
  const showEmailError = emailTouched && !isValidEmail;
  const showMessageError = messageTouched && !isValidMessage;

  function resetForm() {
    setName("");
    setEmail("");
    setListingLink("");
    setMessage("");
    setHoneypot("");
    setNameTouched(false);
    setEmailTouched(false);
    setMessageTouched(false);
    setSubmitting(false);
    setSubmitError(null);
    setSuccess(false);
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submitting || success) return;

    setNameTouched(true);
    setEmailTouched(true);
    setMessageTouched(true);
    setSubmitError(null);

    if (!isValidName) {
      setSubmitError(reasonToMessage("invalid_name"));
      return;
    }
    if (!isValidEmail) {
      setSubmitError(reasonToMessage("invalid_email"));
      return;
    }
    if (!isValidMessage) {
      setSubmitError(reasonToMessage("invalid_message"));
      return;
    }

    setSubmitting(true);
    try {
      const result = (await submitContact({
        name: trimmedName,
        email: trimmedEmail,
        message: trimmedMessage,
        listingLink: trimmedListingLink || undefined,
        sourcePath,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        honeypot: honeypot || undefined,
      })) as ContactSubmissionResult;

      if (result.ok) {
        track("contact_form_submitted", {
          sourcePath,
          listingLinkPresent: trimmedListingLink.length > 0,
          messageLengthBucket: bucketMessageLength(trimmedMessage.length),
        });
        setSuccess(true);
        setSubmitError(null);
        return;
      }

      setSubmitError(reasonToMessage(result.reason ?? "network"));
    } catch {
      setSubmitError(reasonToMessage("network"));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        id={successId}
        role="status"
        aria-live="polite"
        className="mt-6 rounded-[24px] border border-emerald-200/80 bg-emerald-50 px-6 py-8 shadow-sm"
      >
        <div className="flex flex-col gap-5 text-center">
          <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-white text-emerald-700 ring-1 ring-emerald-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6"
              aria-hidden="true"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-neutral-800">
              Message received
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Thanks. We’ve got your note and will reply by email once we’ve
              reviewed it.
            </p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="mx-auto inline-flex h-12 items-center justify-center rounded-[12px] bg-neutral-900 px-5 text-sm font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-neutral-800"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 grid grid-cols-1 gap-5">
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={`${nameFieldId}-honeypot`}>Website</label>
      </div>
      <input
        id={`${nameFieldId}-honeypot`}
        name="contact_honeypot"
        type="text"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="absolute left-[-9999px] top-auto h-px w-px opacity-0"
      />

      <label className="grid gap-2" htmlFor={nameFieldId}>
        <span className="text-sm font-medium text-neutral-700">Name</span>
        <Input
          id={nameFieldId}
          name="name"
          type="text"
          autoComplete="name"
          required
          disabled={submitting}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setNameTouched(true)}
          aria-invalid={showNameError || undefined}
          aria-describedby={showNameError ? `${nameFieldId}-error` : undefined}
          placeholder="Your name"
        />
      </label>
      {showNameError ? (
        <p id={`${nameFieldId}-error`} className="text-xs font-medium text-red-600">
          Please add your name.
        </p>
      ) : null}

      <label className="grid gap-2" htmlFor={emailFieldId}>
        <span className="text-sm font-medium text-neutral-700">Email</span>
        <Input
          id={emailFieldId}
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={submitting}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setEmailTouched(true)}
          aria-invalid={showEmailError || undefined}
          aria-describedby={showEmailError ? `${emailFieldId}-error` : undefined}
          placeholder="you@example.com"
        />
      </label>
      {showEmailError ? (
        <p id={`${emailFieldId}-error`} className="text-xs font-medium text-red-600">
          That email doesn’t look right.
        </p>
      ) : null}

      <label className="grid gap-2" htmlFor={listingLinkFieldId}>
        <span className="text-sm font-medium text-neutral-700">
          Listing link (optional)
        </span>
        <Input
          id={listingLinkFieldId}
          name="listingLink"
          type="url"
          disabled={submitting}
          value={listingLink}
          onChange={(event) => setListingLink(event.target.value)}
          placeholder="https://www.zillow.com/..."
        />
      </label>

      <label className="grid gap-2" htmlFor={messageFieldId}>
        <span className="text-sm font-medium text-neutral-700">Message</span>
        <Textarea
          id={messageFieldId}
          name="message"
          required
          disabled={submitting}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onBlur={() => setMessageTouched(true)}
          aria-invalid={showMessageError || undefined}
          aria-describedby={
            showMessageError ? `${messageFieldId}-error` : undefined
          }
          className="min-h-[140px]"
          placeholder="Tell us what you’re looking for..."
        />
      </label>
      {showMessageError ? (
        <p
          id={`${messageFieldId}-error`}
          className="text-xs font-medium text-red-600"
        >
          Please add a little more detail.
        </p>
      ) : null}

      {submitError ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 inline-flex h-12 items-center justify-center rounded-[12px] bg-primary-400 px-4 text-base font-medium text-white transition-colors duration-[var(--duration-fast)] hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
      >
        {submitting ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
