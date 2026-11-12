import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createTestHouse } from "./harness.ts";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Chores added before a restart are still listed after it", () => {
  const dir = mkdtempSync(join(tmpdir(), "fade-house-"));
  directories.push(dir);
  const databasePath = join(dir, "house.db");

  const before = createTestHouse({ databasePath });
  before.run("Alice", {
    name: "chore add",
    choreName: "Bins",
    scope: "global",
  });
  before.close();

  const after = createTestHouse({ databasePath });
  const listed = after.run("Alice", { name: "chore list" });
  after.close();

  expect(listed.reply.content).toMatch(/^\*\*Global\*\*\n- Bins\n\n/);
});
