"use client";

import { useMemo, useState, useTransition } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OVERRIDE_BY_KEY,
  OVERRIDE_CATALOG,
  OVERRIDE_REASON_CODES,
  OVERRIDE_REASON_LABELS,
  type OverrideReasonCode,
  validateOverrideValue,
  validateReasonDetail,
} from "@/lib/admin/overrideCatalog";
import { cn } from "@/lib/utils";

interface OverrideFormProps {
  /** Role of the currently-signed-in user, used to filter the catalog. */
  role: "broker" | "admin";
}

interface AllowedField {
  key: string;
  targetType: string;
  valueType: "boolean" | "string" | "number" | "enum";
  enumValues?: string[];
  allowedRoles: Array<"broker" | "admin">;
}

/**
 * Execute a manual override with structured reason capture and typed
 * value input. The catalog is pulled from the backend so the client
 * cannot submit a field the server does not accept. Every validation
 * we do here is mirrored server-side in `executeOverride`.
 */
export function OverrideForm({ role }: OverrideFormProps) {
  const catalog = useQuery(api.manualOverrides.listCatalog) as
    | AllowedField[]
    | undefined;
  const execute = useMutation(api.manualOverrides.executeOverride);

  const [fieldKey, setFieldKey] = useState<string>("");
  const [targetId, setTargetId] = useState("");
  const [beforeValue, setBeforeValue] = useState("");
  const [afterValue, setAfterValue] = useState("");
  const [reasonCode, setReasonCode] = useState<OverrideReasonCode>("ops_request");
  const [reasonDetail, setReasonDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = fieldKey ? OVERRIDE_BY_KEY[fieldKey] : undefined;

  const availableFields = useMemo(() => {
    if (!catalog) return OVERRIDE_CATALOG.filter((f) => role === "admin" || f.allowedRoles.includes(role));
    return OVERRIDE_CATALOG.filter((def) =>
      catalog.some((entry) => entry.key === def.key),
    );
  }, [catalog, role]);

  const coerce = (value: string): unknown => {
    if (!selected) return value;
    switch (selected.valueType) {
      case "boolean":
        if (value === "true") return true;
        if (value === "false") return false;
        return undefined;
      case "number": {
        if (value.trim() === "") return undefined;
        const n = Number(value);
        return Number.isNaN(n) ? undefined : n;
      }
      case "string":
      case "enum":
        return value;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selected) {
      setError("Select an override field");
      return;
    }
    if (!targetId.trim()) {
      setError("Target ID required");
      return;
    }
    const coercedAfter = coerce(afterValue);
    const valueCheck = validateOverrideValue(selected, coercedAfter);
    if (!valueCheck.ok) {
      setError(valueCheck.reason);
      return;
    }
    const reasonCheck = validateReasonDetail(reasonDetail);
    if (!reasonCheck.ok) {
      setError(reasonCheck.reason);
      return;
    }
    const coercedBefore = beforeValue ? coerce(beforeValue) : undefined;

    startTransition(async () => {
      try {
        await execute({
          field: selected.key,
          targetId: targetId.trim(),
          beforeValue: coercedBefore,
          afterValue: coercedAfter,
          reasonCode,
          reasonDetail,
        });
        setSuccess(`Override recorded for ${selected.label}`);
        setAfterValue("");
        setBeforeValue("");
        setTargetId("");
        setReasonDetail("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Override failed");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-neutral-200 bg-white p-6"
    >
      <div className="mb-4">
        <div className="text-sm font-semibold text-neutral-900">Execute override</div>
        <p className="mt-0.5 text-xs text-neutral-500">
          Every override is logged with your identity, before/after values, and
          structured reason.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor="override-field"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500"
          >
            Field
          </label>
          <select
            id="override-field"
            value={fieldKey}
            onChange={(e) => {
              setFieldKey(e.target.value);
              setAfterValue("");
              setBeforeValue("");
            }}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">Choose a field…</option>
            {availableFields.map((def) => (
              <option key={def.key} value={def.key}>
                {def.label}
              </option>
            ))}
          </select>
          {selected ? (
            <p className="mt-1 text-xs text-neutral-500">{selected.description}</p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor="override-target"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500"
          >
            Target ID
          </label>
          <Input
            id="override-target"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder={
              selected ? `${selected.targetType} document ID` : "document ID"
            }
          />
        </div>
        <ValueInput
          label="Before value"
          field={selected}
          value={beforeValue}
          onChange={setBeforeValue}
          optional
        />
        <ValueInput
          label="After value"
          field={selected}
          value={afterValue}
          onChange={setAfterValue}
        />
        <div>
          <label
            htmlFor="override-reason-code"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500"
          >
            Reason
          </label>
          <select
            id="override-reason-code"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as OverrideReasonCode)}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            {OVERRIDE_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {OVERRIDE_REASON_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label
          htmlFor="override-reason-detail"
          className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500"
        >
          Reason detail
        </label>
        <textarea
          id="override-reason-detail"
          value={reasonDetail}
          onChange={(e) => setReasonDetail(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Why is this override necessary? Minimum 10 characters."
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
        <div className="mt-1 text-right text-[11px] text-neutral-400">
          {reasonDetail.length} / 2000
        </div>
      </div>
      {error ? (
        <div className="mt-3 rounded-md border border-error-500/40 bg-error-50 px-3 py-2 text-sm text-error-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-3 rounded-md border border-success-500/40 bg-success-50 px-3 py-2 text-sm text-success-700">
          {success}
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isPending || !selected}>
          Execute override
        </Button>
      </div>
    </form>
  );
}

interface ValueInputProps {
  label: string;
  field?: (typeof OVERRIDE_CATALOG)[number];
  value: string;
  onChange: (next: string) => void;
  optional?: boolean;
}

function ValueInput({ label, field, value, onChange, optional }: ValueInputProps) {
  const id = `override-${label.replace(/\s+/g, "-").toLowerCase()}`;
  if (!field) {
    return (
      <div>
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500"
        >
          {label}
        </label>
        <Input id={id} value={value} disabled placeholder="Select a field first" />
      </div>
    );
  }
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500"
      >
        {label}
        {optional ? " (optional)" : ""}
      </label>
      {field.valueType === "enum" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="">{optional ? "(leave blank)" : "Select…"}</option>
          {field.enumValues?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.valueType === "boolean" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="">{optional ? "(leave blank)" : "Select…"}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <Input
          id={id}
          type={field.valueType === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={optional ? "(leave blank)" : undefined}
        />
      )}
    </div>
  );
}

export { cn };
