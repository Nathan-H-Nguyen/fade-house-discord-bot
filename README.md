# Fade House Discord bot

A Discord bot for the Fade House server that assigns Chores each month and chases the Rent.
The vocabulary (Housemate, Chore, Scope, Assignment and so on) is defined in [GLOSSARY.md](GLOSSARY.md).

## Commands

| Command                     | Who        | What it does                                                     |
| --------------------------- | ---------- | ---------------------------------------------------------------- |
| `/ping`                     | Anyone     | Confirms the bot is connected.                                   |
| `/chore add <name> <scope>` | Housemates | Adds a Chore to the pool, with Scope Global, Floor 1 or Floor 3. |
| `/chore list`               | Housemates | Lists the active Chores grouped by Scope.                        |

A Housemate is a member with exactly one of the `Floor 1` or `Floor 3` roles.
Anyone else gets a private refusal explaining why.

## Local setup

1. Install Node.js 26 (the version is pinned in `.node-version`).
2. Install dependencies:

   ```sh
   npm install
   ```

3. In the [Discord Developer Portal](https://discord.com/developers/applications), open the test bot's application and, under **Bot**, enable the **Server Members Intent**.
   The bot reads members' roles to tell who is a Housemate, and fails to log in without it.
4. Invite the bot to the test server with the `bot` and `applications.commands` scopes.
5. Copy `.env.example` to `.env` and fill it in (see below).
6. Start the bot:

   ```sh
   npm start
   ```

   On startup it applies any pending database migrations, registers the slash commands in the configured server, and logs `Logged in as ...`.
   Run `/ping` in the server to check it is connected.

The database is the SQLite file `fade-house.db` in the directory the bot is started from.
It is ignored by git.

## Environment variables

`npm start` reads them from `.env` if it exists, otherwise from the environment.

| Variable                 | Required | Description                                                                                       |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`          | Yes      | The bot token. Use the test bot's token while developing.                                         |
| `DISCORD_APPLICATION_ID` | Yes      | The application ID, from the Developer Portal's General Information page.                         |
| `DISCORD_GUILD_ID`       | Yes      | The server the bot runs in. Commands are registered and answered only there.                      |
| `CHORES_CHANNEL_ID`      | Yes      | The #chores channel, for Assignment posts and completions.                                        |
| `ADMIN_CHANNEL_ID`       | Yes      | The #bot-admin channel, for admin logs, warnings and backups.                                     |
| `TIMEZONE`               | No       | The house's IANA timezone, which defines months and job times. Defaults to `America/Los_Angeles`. |
| `IS_TEST_SERVER`         | No       | `true` only in the test server, to enable the `/dev` commands. Defaults to `false`.               |

To get an ID, turn on **Developer Mode** in Discord's Advanced settings, then right-click the server or channel and choose **Copy ID**.

The bot only ever reads `DISCORD_TOKEN`.
Keep the production token out of it while developing; a lint rule rejects any code that reads `PROD_DISCORD_TOKEN`.

## Development

| Script              | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm test`          | Runs the tests once.                        |
| `npm run typecheck` | Type-checks with TypeScript in strict mode. |
| `npm run lint`      | Runs ESLint and checks Prettier formatting. |
| `npm run format`    | Formats every file with Prettier.           |

CI runs the typecheck, lint and tests on every push and pull request.

All behaviour lives in the House core (`src/house/`), which knows nothing about Discord.
It takes commands and a snapshot of the server's members, and returns the reply and any messages to send.
The Discord adapter (`src/discord/`) is a thin translation layer around it and is checked by hand in the test server.

Tests drive only the House core, through `test/harness.ts`: an in-memory SQLite database, a fake Clock, and a roster of two Floor 1 and four Floor 3 Housemates plus members who are not Housemates.
They never inspect database rows or call internal modules, so the internals can change freely.
