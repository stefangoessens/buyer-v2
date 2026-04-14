"use client";

import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { z } from "zod/v3";
import { toast } from "sonner";

import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const phoneRegex = /^[\d\s().+-]{7,20}$/;

const identitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone is too long")
    .refine((value) => value === "" || phoneRegex.test(value), {
      message: "Enter a valid phone number",
    }),
});

type IdentityFormValues = z.infer<typeof identitySchema>;

export function ProfileIdentitySection() {
  const profile = useQuery(api.buyerProfiles.getMyProfile, {});
  const upsertProfile = useMutation(api.buyerProfiles.createOrUpdate);

  const form = useForm<IdentityFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(identitySchema as any) as unknown as Resolver<IdentityFormValues>,
    defaultValues: { name: "", phone: "" },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.identity.name ?? "",
        phone: profile.identity.phone ?? "",
      });
    }
  }, [profile, form]);

  const isLoading = profile === undefined;
  const email = profile?.identity.email ?? "";

  async function onSubmit(values: IdentityFormValues) {
    try {
      await upsertProfile({
        identity: {
          name: values.name.trim(),
          phone: values.phone?.trim() ? values.phone.trim() : undefined,
        },
      });
      toast.success("Profile updated");
      form.reset(values);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save changes";
      toast.error(message);
    }
  }

  return (
    <Card id="identity" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                {(form.watch("name") || email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <Button type="button" variant="outline" disabled>
                  Upload avatar
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Coming soon
                </p>
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Your full name"
                      autoComplete="name"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                readOnly
                disabled
                aria-readonly
              />
              <p className="text-sm text-muted-foreground">
                Contact support to change the email on your account.
              </p>
            </div>

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="(555) 555-5555"
                      autoComplete="tel"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  isLoading || form.formState.isSubmitting || !form.formState.isDirty
                }
              >
                {form.formState.isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
