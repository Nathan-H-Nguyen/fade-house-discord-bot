import { expect, test } from "vitest";
import { readConfig } from "../src/config.ts";

const required = {
  DISCORD_TOKEN: "token",
  DISCORD_APPLICATION_ID: "1",
  DISCORD_GUILD_ID: "2",
  CHORES_CHANNEL_ID: "3",
  RENT_CHANNEL_ID: "4",
  ADMIN_CHANNEL_ID: "5",
};

test("the database defaults to fade-house.db in the working directory", () => {
  expect(readConfig(required).databasePath).toBe("fade-house.db");
});

test("DATABASE_PATH moves the database, such as onto a mounted volume", () => {
  const config = readConfig({
    ...required,
    DATABASE_PATH: " /data/fade-house.db ",
  });

  expect(config.databasePath).toBe("/data/fade-house.db");
});
