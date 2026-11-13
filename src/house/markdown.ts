/**
 * Escapes text a Housemate typed so Discord shows it literally instead of formatting it.
 * Discord drops the backslash before any punctuation, so over-escaping is harmless.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_~`|#>[\]]/g, "\\$&");
}

/** Shows a member by mention, which Discord renders as their current name. */
export function mention(memberId: string): string {
  return `<@${memberId}>`;
}
