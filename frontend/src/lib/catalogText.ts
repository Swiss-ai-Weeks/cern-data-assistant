const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** Strip catalog HTML to readable plain text for UI display. */
export function catalogPlainText(raw: string, maxLength?: number): string {
  if (!raw) return "";
  let text = raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>\s*<p[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? " ");

  text = text.replace(/\s+/g, " ").trim();
  if (maxLength != null && text.length > maxLength) {
    return `${text.slice(0, maxLength).trim()}…`;
  }
  return text;
}
