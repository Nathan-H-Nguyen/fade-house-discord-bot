import { writeFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import type { Outbound } from "../src/house/index.ts";
import { createTestHouse, temporaryPath } from "./harness.ts";

/** The names of the backups among the messages a tick sent. */
function backups(outbound: Outbound[]): (string | undefined)[] {
  return outbound.map((message) => message.attachment?.name);
}

test("at 03:00 house time a snapshot of the database is posted to #bot-admin, named with the date", async () => {
  const house = createTestHouse({ now: "2026-11-12T03:00:00-08:00" });
  await house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });

  const outbound = await house.tick();

  expect(outbound).toEqual([
    {
      channel: "admin",
      content: "Daily database backup for 2026-11-12.",
      attachment: {
        name: "fade-house-2026-11-12.db",
        data: expect.any(Uint8Array) as Uint8Array,
      },
    },
  ]);
});

test("a posted backup restores to a House with the same Chores", async () => {
  const house = createTestHouse({ now: "2026-11-12T03:00:00-08:00" });
  await house.run("Alice", {
    name: "chore add",
    choreName: "Kitchen",
    scope: "global",
  });
  const [backup] = await house.tick();
  if (!backup?.attachment) throw new Error("Expected a backup attachment");

  const databasePath = temporaryPath("restored.db");
  writeFileSync(databasePath, backup.attachment.data);
  const restored = createTestHouse({ databasePath });

  expect(
    (await restored.run("Alice", { name: "chore list" })).reply.content,
  ).toMatch(/^\*\*Global\*\*\n- Kitchen\n\n/);
});

test("the backup runs once a day, at 03:00 house time", async () => {
  const house = createTestHouse({ now: "2026-11-11T03:00:00-08:00" });
  expect(backups(await house.tick())).toEqual(["fade-house-2026-11-11.db"]);

  house.setTime("2026-11-11T03:01:00-08:00");
  expect(await house.tick()).toEqual([]);
  house.setTime("2026-11-12T02:59:00-08:00");
  expect(await house.tick()).toEqual([]);
  house.setTime("2026-11-12T03:00:00-08:00");
  expect(backups(await house.tick())).toEqual(["fade-house-2026-11-12.db"]);
  house.setTime("2026-11-12T23:59:00-08:00");
  expect(await house.tick()).toEqual([]);
});

test("a restart after the day's backup does not back up again", async () => {
  const databasePath = temporaryPath("house.db");
  const before = createTestHouse({
    databasePath,
    now: "2026-11-12T03:00:00-08:00",
  });
  expect(backups(await before.tick())).toEqual(["fade-house-2026-11-12.db"]);
  await before.close();

  const after = createTestHouse({
    databasePath,
    now: "2026-11-12T03:05:00-08:00",
  });

  expect(await after.tick()).toEqual([]);
});

test("downtime over 03:00 backs up once when the bot comes back", async () => {
  const databasePath = temporaryPath("house.db");
  const before = createTestHouse({
    databasePath,
    now: "2026-11-11T03:00:00-08:00",
  });
  await before.tick();
  before.setTime("2026-11-12T02:00:00-08:00");
  expect(await before.tick()).toEqual([]);
  await before.close();

  const after = createTestHouse({
    databasePath,
    now: "2026-11-12T09:30:00-08:00",
  });

  expect(backups(await after.tick())).toEqual(["fade-house-2026-11-12.db"]);
  after.setTime("2026-11-12T09:31:00-08:00");
  expect(await after.tick()).toEqual([]);
});

test("downtime over several days backs up once, for today only", async () => {
  const databasePath = temporaryPath("house.db");
  const before = createTestHouse({
    databasePath,
    now: "2026-11-08T03:00:00-08:00",
  });
  await before.tick();
  await before.close();

  const after = createTestHouse({
    databasePath,
    now: "2026-11-12T01:00:00-08:00",
  });

  expect(backups(await after.tick())).toEqual(["fade-house-2026-11-11.db"]);
  after.setTime("2026-11-12T02:59:00-08:00");
  expect(await after.tick()).toEqual([]);
  after.setTime("2026-11-12T03:00:00-08:00");
  expect(backups(await after.tick())).toEqual(["fade-house-2026-11-12.db"]);
});

test("ticks that overlap back up only once", async () => {
  const house = createTestHouse({ now: "2026-11-12T03:00:00-08:00" });

  const ticks = await Promise.all([house.tick(), house.tick()]);

  expect(ticks.flatMap(backups)).toEqual(["fade-house-2026-11-12.db"]);
});

test("closing the House lets a backup in progress finish first", async () => {
  const house = createTestHouse({ now: "2026-11-12T03:00:00-08:00" });

  const tick = house.tick();
  await house.close();

  expect(backups(await tick)).toEqual(["fade-house-2026-11-12.db"]);
});

test("a backup too big to attach is reported in #bot-admin instead, once", async () => {
  const house = createTestHouse({
    now: "2026-11-12T03:00:00-08:00",
    attachmentLimitBytes: 1024,
  });

  const [report, ...rest] = await house.tick();

  expect(rest).toEqual([]);
  expect(report).toEqual({
    channel: "admin",
    content: expect.stringMatching(
      /^The database backup for 2026-11-12 was not posted: it is \d+\.\d KiB, over the 1\.0 KiB attachment limit\. See "Backups" in the README to take one by hand\.$/,
    ) as string,
  });
  house.setTime("2026-11-12T03:01:00-08:00");
  expect(await house.tick()).toEqual([]);
});

test("a failed backup is reported in #bot-admin instead, once", async () => {
  const house = createTestHouse({ now: "2026-11-12T03:00:00-08:00" });
  // The snapshot is written to a temporary file before it is posted.
  vi.stubEnv("TMPDIR", temporaryPath("missing"));

  const [report, ...rest] = await house.tick();

  expect(rest).toEqual([]);
  expect(report).toEqual({
    channel: "admin",
    content: expect.stringMatching(
      /^The database backup for 2026-11-12 failed: .*ENOENT.*\. See "Backups" in the README to take one by hand\.$/,
    ) as string,
  });
  house.setTime("2026-11-12T03:01:00-08:00");
  expect(await house.tick()).toEqual([]);
});
