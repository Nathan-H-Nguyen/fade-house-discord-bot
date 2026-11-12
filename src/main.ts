import { readConfig } from "./config.ts";
import { registerCommands, startBot } from "./discord/bot.ts";
import { openHouse } from "./house/index.ts";

/** The SQLite database, relative to the directory the bot is started from. */
const databasePath = "fade-house.db";

const config = readConfig();
const house = openHouse({ databasePath, clock: { now: () => new Date() } });

await registerCommands(config);
const client = await startBot(config, house);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}, shutting down`);
    void client.destroy().finally(() => {
      house.close();
    });
  });
}
