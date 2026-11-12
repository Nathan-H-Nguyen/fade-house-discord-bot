import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { openHouse } from "../src/house/index.ts";
import { FakeClock, roster } from "./harness.ts";

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
  const clock = new FakeClock(new Date("2026-11-12T18:00:00Z"));
  const alice = { memberId: "1001", isAdmin: false };

  const before = openHouse({ databasePath, clock });
  before.handle({
    actor: alice,
    roster,
    command: { name: "chore add", choreName: "Bins", scope: "global" },
  });
  before.close();

  const after = openHouse({ databasePath, clock });
  const listed = after.handle({
    actor: alice,
    roster,
    command: { name: "chore list" },
  });
  after.close();

  expect(listed.reply.content).toMatch(/^\*\*Global\*\*\n- Bins\n\n/);
});
