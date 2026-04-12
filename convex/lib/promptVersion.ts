/**
 * Generate a stable version hash from prompt content.
 * Uses a simple djb2 hash — not crypto, just deterministic.
 */
export function generateVersionHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `v-${hex}`;
}

/**
 * Build the hashable content string from prompt parts.
 * Ensures version changes when any meaningful content changes.
 */
export function buildVersionContent(
  prompt: string,
  systemPrompt: string | undefined,
  model: string
): string {
  return `${model}::${systemPrompt ?? ""}::${prompt}`;
}
