import { expect, test } from "vitest";
import { createTestHouse } from "./harness.ts";

test("/ping tells anyone in the server that the bot is connected", async () => {
  const house = createTestHouse();

  const result = await house.run("Guest", { name: "ping" });

  expect(result.reply).toEqual({
    content: "Pong! Fade House bot is connected.",
    private: true,
  });
  expect(result.outbound).toEqual([]);
});
