import { expect, test } from "vitest";
import { createTestHouse, temporaryPath } from "./harness.ts";

test("Chores added before a restart are still listed after it", async () => {
  const databasePath = temporaryPath("house.db");

  const before = createTestHouse({ databasePath });
  await before.run("Alice", {
    name: "chore add",
    choreName: "Bins",
    scope: "global",
  });
  await before.close();

  const after = createTestHouse({ databasePath });
  const listed = await after.run("Alice", { name: "chore list" });
  await after.close();

  expect(listed.reply.content).toMatch(/^\*\*Global\*\*\n- Bins\n\n/);
});
