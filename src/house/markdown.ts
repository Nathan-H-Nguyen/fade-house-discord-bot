/** Escapes text a Housemate typed so Discord shows it literally instead of formatting it. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_~`|]/g, "\\$&");
}
