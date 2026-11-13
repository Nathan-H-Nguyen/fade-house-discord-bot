/** The most characters Discord accepts in one message. */
export const maxMessageLength = 2000;

/**
 * Splits text into messages Discord accepts, breaking between lines,
 * and preferring the blank lines between sections.
 * A single line too long for one message is broken where it reaches the limit.
 */
export function splitMessage(
  text: string,
  limit: number = maxMessageLength,
): string[] {
  if (text.length <= limit) return [text];

  const messages: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    const breakAt = [window.lastIndexOf("\n\n"), window.lastIndexOf("\n")].find(
      (index) => index > 0,
    );
    if (breakAt === undefined) {
      messages.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    } else {
      messages.push(rest.slice(0, breakAt));
      rest = rest.slice(breakAt).replace(/^\n+/, "");
    }
  }
  if (rest !== "") messages.push(rest);
  return messages;
}
