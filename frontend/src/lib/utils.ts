/** Join class names (shadcn-style helper, no Tailwind dependency). */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
