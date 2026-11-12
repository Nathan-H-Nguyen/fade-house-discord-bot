import { readConfig } from "./config.ts";
import { registerCommands, startBot } from "./discord/bot.ts";
import { openHouse } from "./house/index.ts";

/** The SQLite database, relative to the directory the bot is started from. */
const databasePath = "fade-house.db";

const config = readConfig();
const house = openHouse({
  databasePath,
  clock: { now: () => new Date() },
  timezone: config.timezone,
  // Discord's limit for bots in a server without boosts.
  attachmentLimitBytes: 10 * 1024 * 1024,
  isTestServer: config.isTestServer,
});

await registerCommands(config);
const bot = await startBot(config, house);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}, shutting down`);
    void bot.stop().finally(() => house.close());
  });
}
