# Fade House Discord bot

A Discord bot for the Fade House server that assigns Chores each month and chases the Rent.
The vocabulary (Housemate, Chore, Scope, Assignment and so on) is defined in [GLOSSARY.md](GLOSSARY.md).

## Commands

| Command                              | Who        | What it does                                                     |
| ------------------------------------ | ---------- | ---------------------------------------------------------------- |
| `/ping`                              | Anyone     | Confirms the bot is connected.                                   |
| `/chore add <name> <scope>`          | Housemates | Adds a Chore to the pool, with Scope Global, Floor 1 or Floor 3. |
| `/chore edit <chore> [name] [scope]` | Housemates | Renames a Chore or changes its Scope.                            |
| `/chore retire <chore>`              | Housemates | Takes a Chore out of the pool, keeping its history.              |
| `/chore list`                        | Housemates | Lists the active Chores grouped by Scope.                        |
| `/chore mine`                        | Housemates | Lists your open Assignments, Overdue ones marked, privately.     |
| `/chore done <assignment>`           | Housemates | Marks one of your open Assignments complete.                     |
| `/rent set <housemate> <amount>`     | Admins     | Sets a Housemate's monthly Rent, in dollars such as 1250.50.     |
| `/rent list`                         | Housemates | Lists every Housemate's Rent, flagging any without one set.      |

Edit and retire suggest active Chores as you type.
Done suggests only your own open Assignments, and posts a short completion message in #chores.
Completing someone else's Assignment, or one already complete, is refused privately.
Active Chore names must be unique, ignoring case.
Changes to the pool apply from the next monthly run and never alter existing Assignments.
Admins are Housemates with the Discord Administrator permission; anyone else using `/rent set` is refused privately.
Every Rent set or change is logged in #bot-admin, naming the Admin who made it.

A Housemate is a member with exactly one of the `Floor 1` or `Floor 3` roles.
Anyone else gets a private refusal explaining why.

## Scheduled jobs

| Job                | When                                                      | What it does                                                                                   |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Monthly assignment | The 1st, 00:05 house time                                 | Summarises the month just ended and hands out the new month's Chores (see Monthly assignment). |
| Chore reminder     | 09:00 house time, 7 days before the last day of the month | DMs each Housemate their open Assignments (see Chore reminder).                                |
| Backup             | Daily, 03:00 house time                                   | Posts a snapshot of the database in #bot-admin (see Backups).                                  |

The bot checks for due jobs when it starts and about once a minute.
Each job runs at most once per day (or month, for the monthly assignment and Chore reminder), even across restarts.
If the bot was off when a job was due, the job runs once when it comes back, for the current day or month only: missed earlier ones are not made up.
A new database, or a newly added job, waits for the job's next time rather than running for a day or month already under way.
So the first monthly assignment is on the 1st after the bot first starts.

## Monthly assignment

At 00:05 on the 1st, the bot closes out the month just ended, then gives every active Chore to one eligible Housemate for the new month.
Global Chores can go to anyone; Floor 1 and Floor 3 Chores go only to Housemates on that Floor.

Assignments not completed by the end of their month become Overdue Assignments:

- An Overdue Assignment stays with its Housemate and stands in for its Chore, so the Chore is not handed out again that month.
- It stays overdue month after month until completed, and is completed with `/chore done` like any other Assignment.
- It is dropped if its Housemate has left (they are no longer in the server, or have no floor role) or its Chore is retired.
- Overdue Assignments do not count toward balancing.

Before the month's Assignments, the bot posts a summary of the month just ended in #chores.
It lists, per Housemate, the Assignments completed during that month and those now overdue, then any Overdue Assignments dropped.
There is no summary when there is nothing to list, such as before the first monthly run.

- Balancing counts each Housemate's Assignments across all Scopes, so Floor 1's Housemates, who share their Floor's Chores between fewer people, take fewer Global Chores.
- Nobody gets a Chore they held last (including as an Overdue Assignment) unless no one else is eligible for it.
- Ties are broken at random.
- A Chore whose Scope has no Housemates is not assigned, and the post lists it.

The bot posts the month's Assignments in #chores, grouped by Housemate, and DMs each Housemate their own, with Overdue Assignments marked.
If a DM cannot be delivered (for example, the Housemate does not accept DMs from server members), the bot says so in #chores.
A member with both floor roles gets no new Chores and is reported in #bot-admin, but keeps their Overdue Assignments, which are still posted and DMed.
Mentions in these messages show who is meant without notifying them.

## Chore reminder

At 09:00 house time seven days before the last day of the month (the 21st in a 28-day February, the 24th in a 31-day month), the bot DMs each Housemate with open Assignments a list of them, with Overdue Assignments marked.
Housemates with nothing open get nothing, and so do members who have left.
A member with both floor roles is reminded of the Assignments they keep.
If a DM cannot be delivered, the bot posts the list in #chores instead, saying the DM failed.
If the bot is off from before the reminder time until the month has ended, that month's reminder is skipped.

## Backups

Every day at 03:00 house time the bot posts a snapshot of its database in #bot-admin, as an attachment named `fade-house-YYYY-MM-DD.db`.
The snapshot is taken with SQLite's online backup, so it is consistent even while the bot is writing.
If the snapshot fails, or is too big to attach (10 MiB), the bot posts an error there instead.

To take a backup by hand, run this in the directory the bot is started from (the `sqlite3` command ships with macOS):

```sh
sqlite3 fade-house.db ".backup fade-house-manual.db"
```

Never copy `fade-house.db` itself while the bot is running: recent changes may still be in `fade-house.db-wal`.

To restore from a backup:

1. Stop the bot.
2. Download the backup you want from #bot-admin.
3. In the directory the bot is started from, move `fade-house.db` somewhere safe, along with `fade-house.db-wal` and `fade-house.db-shm` if they exist.
   They belong to the old database and must not sit next to the restored one.
4. Copy the backup into that directory as `fade-house.db`.
5. Start the bot.
   It applies any migrations newer than the backup.

Everything since the backup was taken is lost, and scheduled jobs that ran since then may run again.

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

### Moving the bot's time

With `IS_TEST_SERVER=true`, the bot registers two extra commands for walking through the month in the test server:

| Command                              | What it does                                                            |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `/dev advance-to <YYYY-MM-DD HH:MM>` | Moves the bot's time forward to a house time and runs any jobs now due. |
| `/dev now`                           | Shows the bot's time.                                                   |

The bot's time keeps running from where it was moved to, and only moves forward.
It goes back to the real time when the bot restarts.
Jobs that ran for days you moved past are then skipped when those days really arrive, so use a throwaway database for the walk-through.
For example, `/dev advance-to 2026-11-13 03:00` posts that day's backup in #bot-admin, and `/dev advance-to 2026-12-01 00:05` hands out December's Chores.
Outside the test server these commands are not registered, and the House refuses them.

CI runs the typecheck, lint and tests on every push and pull request.

All behaviour lives in the House core (`src/house/`), which knows nothing about Discord.
It takes commands and a snapshot of the server's members, and returns the reply and any messages to send.
The Discord adapter (`src/discord/`) is a thin translation layer around it and is checked by hand in the test server.

Tests drive only the House core, through `test/harness.ts`: an in-memory SQLite database, a fake Clock, and a roster of two Floor 1 and four Floor 3 Housemates plus members who are not Housemates.
They never inspect database rows or call internal modules, so the internals can change freely.
The exceptions are `test/commands.test.ts`, which checks that the `/dev` commands are registered only in the test server, and `test/messages.test.ts`, which checks how long messages are split to fit Discord's limit.
