"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WizardStep } from "@/lib/propertyChatPrompts";
import type { BrokerReviewState } from "@/lib/dealroom/offer-cockpit-types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiChat02Icon } from "@hugeicons/core-free-icons";
import {
  PropertyAIChatMessage,
  type PropertyAIChatMessageData,
} from "./PropertyAIChatMessage";
import { PropertyAIChatInput } from "./PropertyAIChatInput";
import { PropertyAIChatSuggestedQuestions } from "./PropertyAIChatSuggestedQuestions";

type ChatBrokerState = "none" | "pending" | "approved" | "flagged";

interface PropertyAIChatDrawerProps {
  propertyId: string;
  wizardStep: WizardStep;
  propertyAddress?: string;
}

function mapBrokerState(
  state: ChatBrokerState | undefined,
): BrokerReviewState | "none" {
  switch (state) {
    case "pending":
      return "pending_review";
    case "approved":
      return "approved";
    case "flagged":
      return "rejected";
    default:
      return "none";
  }
}

export function PropertyAIChatDrawer({
  propertyId,
  wizardStep,
  propertyAddress,
}: PropertyAIChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();

  const messagesQuery = useQuery(
    api.propertyChat.listMessages,
    isAuthenticated ? { propertyId: propertyId as Id<"properties"> } : "skip",
  );
  const sendMessageMutation = useMutation(api.propertyChat.sendMessage);

  const messagesForRender: PropertyAIChatMessageData[] = useMemo(() => {
    if (!messagesQuery) return [];
    return messagesQuery.map((message) => ({
      role: message.role,
      content: message.content,
      brokerReviewState: mapBrokerState(
        message.brokerReviewState as ChatBrokerState | undefined,
      ),
      brokerReviewNote: null,
      createdAt: message.createdAt,
    }));
  }, [messagesQuery]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [open, messagesForRender.length]);

  async function handleSend(content: string) {
    if (!isAuthenticated) return;
    await sendMessageMutation({
      propertyId: propertyId as Id<"properties">,
      wizardStep,
      content,
    });
  }

  const description = propertyAddress
    ? `Chat about ${propertyAddress}`
    : "Chat with the buyer-v2 assistant";
  const isLoading = isAuthenticated && messagesQuery === undefined;
  const empty = !isLoading && messagesForRender.length === 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="default"
          size="default"
          className="fixed bottom-6 right-6 z-40 gap-2 shadow-lg lg:static lg:shadow-none"
          aria-label="Ask the property AI"
        >
          <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
          Ask AI
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex h-[90vh] w-full flex-col gap-0 p-0 data-[side=bottom]:h-[90vh] sm:max-w-md sm:rounded-l-3xl"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Property AI</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div ref={scrollRef} className="flex flex-col gap-3 px-4 py-4">
            {!isAuthenticated ? (
              <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                Sign in to chat with the property assistant.
              </p>
            ) : isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading conversation…
              </p>
            ) : empty ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Ask anything about this property — the assistant knows the
                  list price, comps, disclosures, and your current wizard step.
                </p>
                <PropertyAIChatSuggestedQuestions
                  wizardStep={wizardStep}
                  onPick={(question) => {
                    void handleSend(question);
                  }}
                />
              </div>
            ) : (
              messagesForRender.map((message, index) => (
                <PropertyAIChatMessage
                  key={`${message.createdAt}-${index}`}
                  message={message}
                />
              ))
            )}
          </div>
        </ScrollArea>
        <PropertyAIChatInput
          onSend={handleSend}
          disabled={!isAuthenticated}
          placeholder={
            isAuthenticated
              ? "Ask about this property…"
              : "Sign in to chat"
          }
        />
      </SheetContent>
    </Sheet>
  );
}
