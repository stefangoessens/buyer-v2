"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type ChannelKey = "email" | "sms" | "push" | "inApp";
type CategoryKey =
  | "transactional"
  | "tours"
  | "offers"
  | "updates"
  | "marketing";

type ChannelState = Record<ChannelKey, boolean>;
type CategoryState = Record<CategoryKey, boolean>;

const CHANNELS: { key: ChannelKey; label: string; description: string }[] = [
  { key: "email", label: "Email", description: "Receive updates by email" },
  { key: "sms", label: "SMS", description: "Text message alerts" },
  { key: "push", label: "Push", description: "Mobile push notifications" },
  { key: "inApp", label: "In-app", description: "Notifications inside Buyer" },
];

const CATEGORIES: { key: CategoryKey; label: string; description: string }[] = [
  {
    key: "transactional",
    label: "Transactional",
    description: "Critical updates about your deals and offers",
  },
  {
    key: "tours",
    label: "Tours",
    description: "Tour confirmations, reminders, and changes",
  },
  {
    key: "offers",
    label: "Offers",
    description: "Counter-offers and negotiation activity",
  },
  {
    key: "updates",
    label: "Property updates",
    description: "Price changes and status updates on saved homes",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "New features, market reports, and tips",
  },
];

const DEFAULT_CHANNELS: ChannelState = {
  email: true,
  sms: false,
  push: true,
  inApp: true,
};

const DEFAULT_CATEGORIES: CategoryState = {
  transactional: true,
  tours: true,
  offers: true,
  updates: true,
  marketing: false,
};

function isChannelDirty(a: ChannelState, b: ChannelState) {
  return (Object.keys(a) as ChannelKey[]).some((key) => a[key] !== b[key]);
}

function isCategoryDirty(a: CategoryState, b: CategoryState) {
  return (Object.keys(a) as CategoryKey[]).some((key) => a[key] !== b[key]);
}

export function ProfileContactPreferencesSection() {
  const profile = useQuery(api.buyerProfiles.getMyProfile, {});
  const updateCommPrefs = useMutation(api.buyerProfiles.updateCommPrefs);

  const [channels, setChannels] = useState<ChannelState>(DEFAULT_CHANNELS);
  const [categories, setCategories] = useState<CategoryState>(DEFAULT_CATEGORIES);
  const [savedChannels, setSavedChannels] = useState<ChannelState>(DEFAULT_CHANNELS);
  const [savedCategories, setSavedCategories] = useState<CategoryState>(DEFAULT_CATEGORIES);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      const nextChannels: ChannelState = {
        email: profile.communicationPreferences.channels.email,
        sms: profile.communicationPreferences.channels.sms,
        push: profile.communicationPreferences.channels.push,
        inApp: profile.communicationPreferences.channels.inApp,
      };
      const nextCategories: CategoryState = {
        transactional: profile.communicationPreferences.categories.transactional,
        tours: profile.communicationPreferences.categories.tours,
        offers: profile.communicationPreferences.categories.offers,
        updates: profile.communicationPreferences.categories.updates,
        marketing: profile.communicationPreferences.categories.marketing,
      };
      setChannels(nextChannels);
      setCategories(nextCategories);
      setSavedChannels(nextChannels);
      setSavedCategories(nextCategories);
    }
  }, [profile]);

  const isLoading = profile === undefined;
  const isDirty =
    isChannelDirty(channels, savedChannels) ||
    isCategoryDirty(categories, savedCategories);

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateCommPrefs({
        channels,
        categories,
      });
      setSavedChannels(channels);
      setSavedCategories(categories);
      toast.success("Notification preferences updated");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save preferences";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card id="notifications" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Channels</h3>
            <p className="text-xs text-muted-foreground">
              How we reach you when there is something to share.
            </p>
          </div>
          <div className="grid gap-3">
            {CHANNELS.map((channel) => (
              <div
                key={channel.key}
                className="flex items-start justify-between gap-4 rounded-3xl border border-border/60 bg-background/40 p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={`channel-${channel.key}`} className="cursor-pointer">
                    {channel.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {channel.description}
                  </p>
                </div>
                <Switch
                  id={`channel-${channel.key}`}
                  checked={channels[channel.key]}
                  onCheckedChange={(checked) =>
                    setChannels((prev) => ({ ...prev, [channel.key]: checked }))
                  }
                  disabled={isLoading}
                />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Categories</h3>
            <p className="text-xs text-muted-foreground">
              Pick which kinds of messages you want to receive.
            </p>
          </div>
          <div className="grid gap-3">
            {CATEGORIES.map((category) => (
              <div
                key={category.key}
                className="flex items-start justify-between gap-4 rounded-3xl border border-border/60 bg-background/40 p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={`category-${category.key}`} className="cursor-pointer">
                    {category.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <Switch
                  id={`category-${category.key}`}
                  checked={categories[category.key]}
                  onCheckedChange={(checked) =>
                    setCategories((prev) => ({
                      ...prev,
                      [category.key]: checked,
                    }))
                  }
                  disabled={isLoading}
                />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-3 rounded-3xl border border-dashed border-border/60 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Quiet hours
              </p>
              <p className="text-xs text-muted-foreground">
                Pause non-urgent messages overnight
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Coming soon
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Weekly digest
              </p>
              <p className="text-xs text-muted-foreground">
                Get a single summary instead of individual updates
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Coming soon
            </span>
          </div>
        </section>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || isSaving || !isDirty}
          >
            {isSaving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
