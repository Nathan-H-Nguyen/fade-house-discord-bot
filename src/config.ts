export interface Config {
  discordToken: string;
  applicationId: string;
  guildId: string;
  choresChannelId: string;
  adminChannelId: string;
  /** IANA name of the house timezone, which defines months and job times. */
  timezone: string;
  /** Whether the bot is running in the test server, which enables the `/dev` commands. */
  isTestServer: boolean;
}

/** Reads configuration from environment variables, reporting every problem at once. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  function required(name: string): string {
    const value = env[name]?.trim();
    if (!value) {
      problems.push(`${name} is not set.`);
      return "";
    }
    return value;
  }

  const config: Config = {
    discordToken: required("DISCORD_TOKEN"),
    applicationId: required("DISCORD_APPLICATION_ID"),
    guildId: required("DISCORD_GUILD_ID"),
    choresChannelId: required("CHORES_CHANNEL_ID"),
    adminChannelId: required("ADMIN_CHANNEL_ID"),
    timezone: env["TIMEZONE"]?.trim() || "America/Los_Angeles",
    isTestServer: false,
  };

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: config.timezone });
  } catch {
    problems.push(
      `TIMEZONE "${config.timezone}" is not a valid IANA timezone.`,
    );
  }

  const isTestServer = env["IS_TEST_SERVER"]?.trim().toLowerCase() || "false";
  if (isTestServer === "true") config.isTestServer = true;
  else if (isTestServer !== "false")
    problems.push(
      `IS_TEST_SERVER must be "true" or "false", not "${isTestServer}".`,
    );

  if (problems.length > 0)
    throw new Error(`Invalid configuration:\n${problems.join("\n")}`);
  return config;
}
