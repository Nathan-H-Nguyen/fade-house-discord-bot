import { expect, test } from "vitest";
import { createTestHouse } from "./harness.ts";

test("/dev now shows the bot's time in house time", async () => {
  const house = createTestHouse({
    isTestServer: true,
    now: "2026-11-12T10:07:00-08:00",
  });

  const result = await house.run("Alice", { name: "dev now" });

  expect(result).toEqual({
    reply: {
      content: "The bot's time is 2026-11-12 10:07 (America/Los_Angeles).",
      private: true,
    },
    outbound: [],
  });
});

test("outside the test server the /dev commands are refused and leave the clock alone", async () => {
  const house = createTestHouse({ now: "2026-11-12T10:00:00-08:00" });

  const now = await house.run("Alice", { name: "dev now" });
  const advanced = await house.run("Alice", {
    name: "dev advance-to",
    to: "2026-11-13 03:00",
  });

  const refusal = {
    reply: {
      content: "The /dev commands only work in the test server.",
      private: true,
    },
    outbound: [],
  };
  expect(now).toEqual(refusal);
  expect(advanced).toEqual(refusal);
  expect(await house.tick()).toEqual([
    expect.objectContaining({
      content: "Daily database backup for 2026-11-12.",
    }),
  ]);
});

test("/dev advance-to moves the bot's time and runs the jobs now due", async () => {
  const house = createTestHouse({
    isTestServer: true,
    now: "2026-11-12T10:00:00-08:00",
  });
  await house.tick();

  const advanced = await house.run("Alice", {
    name: "dev advance-to",
    to: "2026-11-13 03:00",
  });

  expect(advanced).toEqual({
    reply: {
      content:
        "Moved the bot's time to 2026-11-13 03:00 (America/Los_Angeles).",
      private: true,
    },
    outbound: [
      {
        channel: "admin",
        content: "Daily database backup for 2026-11-13.",
        attachment: {
          name: "fade-house-2026-11-13.db",
          data: expect.any(Uint8Array) as Uint8Array,
        },
      },
    ],
  });
  expect((await house.run("Alice", { name: "dev now" })).reply.content).toBe(
    "The bot's time is 2026-11-13 03:00 (America/Los_Angeles).",
  );
});

test("/dev advance-to refuses a time it cannot read or that does not exist", async () => {
  const house = createTestHouse({
    isTestServer: true,
    now: "2026-01-12T10:00:00-08:00",
  });

  const unreadable = await house.run("Alice", {
    name: "dev advance-to",
    to: "tomorrow at 3",
  });
  const impossible = await house.run("Alice", {
    name: "dev advance-to",
    to: "2026-02-30 03:00",
  });
  // Clocks in America/Los_Angeles jump from 02:00 to 03:00 on 2026-03-08.
  const skipped = await house.run("Alice", {
    name: "dev advance-to",
    to: "2026-03-08 02:30",
  });

  expect(unreadable).toEqual({
    reply: {
      content: "Give the time as YYYY-MM-DD HH:MM, such as 2026-11-27 09:00.",
      private: true,
    },
    outbound: [],
  });
  expect(impossible.reply.content).toBe(
    "2026-02-30 03:00 is not a time in America/Los_Angeles.",
  );
  expect(skipped.reply.content).toBe(
    "2026-03-08 02:30 is not a time in America/Los_Angeles.",
  );
  expect((await house.run("Alice", { name: "dev now" })).reply.content).toBe(
    "The bot's time is 2026-01-12 10:00 (America/Los_Angeles).",
  );
});

test("/dev advance-to cannot move the bot's time backwards", async () => {
  const house = createTestHouse({
    isTestServer: true,
    now: "2026-11-12T10:00:00-08:00",
  });

  const result = await house.run("Alice", {
    name: "dev advance-to",
    to: "2026-11-12 09:59",
  });

  expect(result).toEqual({
    reply: {
      content:
        "The bot's time only moves forward, and it is already 2026-11-12 10:00 (America/Los_Angeles).",
      private: true,
    },
    outbound: [],
  });
});

test("after /dev advance-to the bot's time keeps running from where it was moved to", async () => {
  const house = createTestHouse({
    isTestServer: true,
    now: "2026-11-12T10:00:00-08:00",
  });
  await house.run("Alice", { name: "dev advance-to", to: "2026-11-27 08:55" });

  house.setTime("2026-11-12T10:05:00-08:00");

  expect((await house.run("Alice", { name: "dev now" })).reply.content).toBe(
    "The bot's time is 2026-11-27 09:00 (America/Los_Angeles).",
  );
});
