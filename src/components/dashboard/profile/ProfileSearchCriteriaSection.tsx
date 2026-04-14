"use client";

import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { z } from "zod/v3";
import { toast } from "sonner";

import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROPERTY_TYPES = [
  { value: "single_family", label: "Single family" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
] as const;

const MUST_HAVES = [
  { value: "pool", label: "Pool" },
  { value: "garage", label: "Garage" },
  { value: "no_hoa", label: "No HOA" },
  { value: "waterfront", label: "Waterfront" },
] as const;

const DEALBREAKERS = [
  { value: "hoa", label: "HOA" },
  { value: "flood_zone", label: "Flood zone" },
  { value: "pre_1980", label: "Pre-1980 build" },
] as const;

const MOVE_TIMELINE_OPTIONS = [
  { value: "asap", label: "ASAP" },
  { value: "1_3_months", label: "1-3 months" },
  { value: "3_6_months", label: "3-6 months" },
  { value: "6_plus_months", label: "6+ months" },
  { value: "just_looking", label: "Just looking" },
] as const;

type MoveTimelineValue =
  | ""
  | "asap"
  | "1_3_months"
  | "3_6_months"
  | "6_plus_months"
  | "just_looking";

const searchSchema = z.object({
  preferredAreasInput: z.string().max(500, "Areas list is too long"),
  propertyTypes: z.array(z.string()),
  mustHaves: z.array(z.string()),
  dealbreakers: z.array(z.string()),
  moveTimeline: z.enum([
    "",
    "asap",
    "1_3_months",
    "3_6_months",
    "6_plus_months",
    "just_looking",
  ]),
});

type SearchFormValues = z.infer<typeof searchSchema>;

function parseAreas(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function ProfileSearchCriteriaSection() {
  const profile = useQuery(api.buyerProfiles.getMyProfile, {});
  const upsertProfile = useMutation(api.buyerProfiles.createOrUpdate);

  const form = useForm<SearchFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(searchSchema as any) as unknown as Resolver<SearchFormValues>,
    defaultValues: {
      preferredAreasInput: "",
      propertyTypes: [],
      mustHaves: [],
      dealbreakers: [],
      moveTimeline: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        preferredAreasInput: profile.searchPreferences.preferredAreas.join(", "),
        propertyTypes: profile.searchPreferences.propertyTypes,
        mustHaves: profile.searchPreferences.mustHaves,
        dealbreakers: profile.searchPreferences.dealbreakers,
        moveTimeline: (profile.searchPreferences.moveTimeline ?? "") as MoveTimelineValue,
      });
    }
  }, [profile, form]);

  const isLoading = profile === undefined;

  async function onSubmit(values: SearchFormValues) {
    try {
      const moveTimeline =
        values.moveTimeline === "" ? undefined : values.moveTimeline;
      await upsertProfile({
        searchPreferences: {
          preferredAreas: parseAreas(values.preferredAreasInput),
          propertyTypes: values.propertyTypes,
          mustHaves: values.mustHaves,
          dealbreakers: values.dealbreakers,
          moveTimeline,
        },
      });
      toast.success("Search preferences updated");
      form.reset(values);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save preferences";
      toast.error(message);
    }
  }

  return (
    <Card id="search" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Search criteria</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
          >
            <FormField
              control={form.control}
              name="preferredAreasInput"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred areas</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Coral Gables, Brickell, Coconut Grove"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Comma-separated list of neighborhoods or cities.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <CheckboxGroupField<SearchFormValues>
              control={form.control}
              name="propertyTypes"
              label="Property types"
              options={PROPERTY_TYPES}
              disabled={isLoading}
            />

            <CheckboxGroupField<SearchFormValues>
              control={form.control}
              name="mustHaves"
              label="Must haves"
              options={MUST_HAVES}
              disabled={isLoading}
            />

            <CheckboxGroupField<SearchFormValues>
              control={form.control}
              name="dealbreakers"
              label="Dealbreakers"
              options={DEALBREAKERS}
              disabled={isLoading}
            />

            <FormField
              control={form.control}
              name="moveTimeline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Move timeline</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                    disabled={isLoading}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a timeline" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MOVE_TIMELINE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                {form.formState.isSubmitting ? "Saving…" : "Save preferences"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

import type { Control, FieldValues, FieldPath, PathValue } from "react-hook-form";

type CheckboxGroupFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
};

function CheckboxGroupField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  disabled,
}: CheckboxGroupFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected = (field.value as string[] | undefined) ?? [];
        const toggle = (value: string, checked: boolean) => {
          const next = checked
            ? [...selected, value]
            : selected.filter((entry) => entry !== value);
          field.onChange(next as PathValue<TFieldValues, typeof name>);
        };
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((option) => {
                const id = `${String(name)}-${option.value}`;
                const checked = selected.includes(option.value);
                return (
                  <label
                    key={option.value}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 rounded-3xl border border-border/60 bg-background/40 px-4 py-3 text-sm transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) => toggle(option.value, value === true)}
                      disabled={disabled}
                    />
                    <Label htmlFor={id} className="cursor-pointer font-medium">
                      {option.label}
                    </Label>
                  </label>
                );
              })}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
