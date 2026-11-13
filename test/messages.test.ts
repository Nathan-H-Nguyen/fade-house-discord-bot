import { expect, test } from "vitest";
import { splitMessage } from "../src/discord/messages.ts";

test("a message within the limit is sent whole", () => {
  expect(splitMessage("a\nb", 3)).toEqual(["a\nb"]);
});

test("a long message breaks between sections first, then between lines", () => {
  expect(splitMessage("aa\nbb\n\ncc\ndd", 8)).toEqual(["aa\nbb", "cc\ndd"]);
  expect(splitMessage("aa\nbb\ncc", 5)).toEqual(["aa\nbb", "cc"]);
});

test("every part fits, even a line longer than the limit", () => {
  const parts = splitMessage("abcdefgh\nij", 3);

  expect(parts).toEqual(["abc", "def", "gh", "ij"]);
});
