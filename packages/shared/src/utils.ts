export function hasValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function compactRecord<T extends Record<string, string>>(
  record: T,
): Partial<T> {
  const entries = Object.entries(record).filter(([, value]) => hasValue(value));
  return Object.fromEntries(entries) as Partial<T>;
}
