"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PropertyAIChatInputProps {
  onSend: (content: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function PropertyAIChatInput({
  onSend,
  disabled,
  placeholder = "Ask about this property…",
}: PropertyAIChatInputProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const canSend = value.trim().length > 0 && !disabled && !busy;

  async function submit() {
    if (!canSend) return;
    const trimmed = value.trim();
    setBusy(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit();
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border bg-background px-4 py-3"
    >
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || busy}
        aria-label="Chat message"
      />
      <Button type="submit" disabled={!canSend}>
        Send
      </Button>
    </form>
  );
}
