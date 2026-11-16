# Fade House Discord bot

A Discord bot for the Fade House server that assigns Chores each month and chases the Rent.
The vocabulary (Housemate, Chore, Scope, Assignment and so on) is defined in [GLOSSARY.md](GLOSSARY.md).

## Commands

| Command                                        | Who        | What it does                                                                          |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `/ping`                                        | Anyone     | Confirms the bot is connected.                                                        |
| `/help`                                        | Anyone     | Lists the commands Housemates can use, privately, leaving out Admin commands.         |
| `/chore add <name> <scope>`                    | Housemates | Adds a Chore to the pool, with Scope Global, Floor 1 or Floor 3.                      |
| `/chore edit <chore> [name] [scope]`           | Housemates | Renames a Chore or changes its Scope.                                                 |
| `/chore retire <chore>`                        | Housemates | Takes a Chore out of the pool, keeping its history.                                   |
| `/chore list`                                  | Housemates | Lists the active Chores grouped by Scope.                                             |
| `/chore mine`                                  | Housemates | Lists your open Assignments, Overdue ones marked, privately.                          |
| `/chore done <assignment>`                     | Housemates | Marks one of your open Assignments complete.                                          |
| `/rent set <housemate> <amount>`               | Admins     | Sets a Housemate's monthly Rent, in dollars such as 1250.50.                          |
| `/rent list`                                   | Housemates | Lists every Housemate's Rent, flagging any without one set.                           |
| `/rent paid`                                   | Housemates | Marks your Rent paid for the current month.                                           |
| `/admin chore-done <housemate> <assignment>`   | Admins     | Marks a Housemate's open Assignment complete for them.                                |
| `/admin chore-reopen <housemate> <assignment>` | Admins     | Reopens an Assignment a Housemate completed this month.                               |
| `/admin rent-paid <housemate> [paid]`          | Admins     | Marks a Housemate's Rent paid, or with `paid: False` not paid, for the current month. |
| `/admin reassign`                              | Admins     | Hands out this month's open new Assignments again (see Admin corrections).            |

Edit and retire suggest active Chores as you type.
Done suggests only your own open Assignments, and posts a short completion message in #chores.
Completing someone else's Assignment, or one already complete, is refused privately.
Active Chore names must be unique, ignoring case.
Changes to the pool apply from the next monthly run and never alter existing Assignments.
Admins are Housemates with the Discord Administrator permission; anyone else using `/rent set` or `/admin` is refused privately.
Every Rent set or change is logged in #bot-admin, naming the Admin who made it.

A Housemate is a member with exactly one of the `Floor 1` or `Floor 3` roles.
Anyone else gets a private refusal explaining why.

## Scheduled jobs

| Job                | When                                                      | What it does                                                                                   |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Monthly assignment | The 1st, 00:05 house time                                 | Summarises the month just ended and hands out the new month's Chores (see Monthly assignment). |
| Chore Reminders    | 09:00 house time, the 15th and 7 days before the last day | DMs each Housemate their open Assignments (see Chore Reminder).                                |
| Rent Reminder      | 09:00 house time, the last 4 days of the month            | DMs each Housemate who has not paid for the month (see Rent).                                  |
| Backup             | Daily, 03:00 house time                                   | Posts a snapshot of the database in #bot-admin (see Backups).                                  |

The bot checks for due jobs when it starts and about once a minute.
Each job runs at most once per day (or month, for the monthly assignment and each Chore Reminder), even across restarts.
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

## Chore Reminder

The bot sends Chore Reminders twice a month, both at 09:00 house time:

- On the 15th, saying the month is half over.
- Seven days before the last day of the month (the 21st in a 28-day February, the 24th in a 31-day month), saying a week is left.

Each one DMs every Housemate with open Assignments a list of them, with Overdue Assignments marked.
Housemates with nothing open get nothing, and so do members who have left.
A member with both floor roles is reminded of the Assignments they keep.
If a DM cannot be delivered, the bot posts the list in #chores instead, saying the DM failed.
If the bot is off at a reminder's time, the reminder goes out when it comes back, with two exceptions:

- A mid-month reminder still missed when the week-left reminder is due is skipped, so the two never arrive together.
- A week-left reminder missed until the month has ended is skipped.

## Rent

Rent is tracked one calendar month at a time, and its Due Date is the month's last day.
Any time during the month, a Housemate can mark that month's Rent paid with `/rent paid`.
Each month stands alone: Rent not marked paid by the end of the month is settled in person, and the bot sends nothing more about it.

Every day at 09:00 from three days before the Due Date until the Due Date (November 27 to 30 for November), each Housemate with Rent set who has not marked it paid gets a Rent Reminder DM with the month, their amount and the Due Date.
Reminders stop as soon as they mark it paid, or as soon as they stop being a Housemate, such as when their floor role is removed.
A member with both floor roles is not reminded.
If a DM cannot be delivered, the bot says so in #bot-admin.
If the bot is off at 09:00, the day's reminder goes out when it comes back that day; a day missed entirely is not made up.

Each time a Housemate's Rent is marked paid, the bot says so in #rent.
Marking Rent paid again in the same month is refused, naming when next month's can be marked.
Once every Housemate with Rent set has paid for the month, the bot says so once in #rent.
It does not wait on members who have left, but does wait on a member with both floor roles, who must have one removed before they can mark their Rent paid themselves, or have an Admin mark it.
`/rent list` shows, for the current month, who has paid and who has not.

## Admin corrections

The `/admin` commands fix mistakes, and each one is logged in #bot-admin, naming the Admin who made it.
Discord shows `/admin` only to members with the Administrator permission, unless the server's integration settings say otherwise.

- `/admin chore-done` completes one of a Housemate's open Assignments, Overdue ones included, and posts the completion in #chores as `/chore done` does.
  The `assignment` option suggests the chosen Housemate's open Assignments.
- `/admin chore-reopen` reopens an Assignment the Housemate completed this month: one given this month, or an Overdue Assignment that stood in for its Chore this month.
  A reopened Overdue Assignment is overdue again.
  Assignments completed in earlier months cannot be reopened, since their Chores have been handed out again.
- `/admin rent-paid` marks a Housemate's Rent paid or not paid for the current month, which works for a member with both floor roles too.
  Marking a Housemate paid posts in #rent as `/rent paid` does, including the all-paid message for the last unpaid Housemate.
  Marking someone not paid is logged only in #bot-admin; it does not withdraw the all-paid message, and that is not posted again.
  Rent Reminders resume for a Housemate marked not paid from the next day's 09:00 reminder.
- `/admin reassign` corrects a bad monthly run, such as one where floor roles were wrong on the 1st.
  It discards this month's Assignments that are neither completed nor Overdue, and hands their Chores out again with the server's roles as they are now, by the same rules as the monthly run.
  Completed Assignments and Overdue Assignments are kept, and Assignments completed this month count toward balancing.
  Chores added since the 1st are handed out too, and Chores retired since are not.
  It posts the new Assignments in #chores and DMs each Housemate theirs, marked as reassigned.
  It is refused until the month's Chores have been handed out.

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

## Running in Docker

The `Dockerfile` builds an image that runs the bot as the unprivileged `node` user.
The database lives at `/data/fade-house.db`, so mount a volume at `/data` or it is lost with the container.
Pass the environment variables (see below) at run time; none are baked into the image.

To try it locally with the values from `.env`:

```sh
docker compose up --build
```

Compose keeps the database in a named volume, `data`.
Stop the container with `docker compose stop`, which sends SIGTERM and lets the bot shut down cleanly.
To take a backup by hand from the volume, see Backups, running `sqlite3` against the file in the container.

## Hosting

Production runs on Google Cloud, in the `fade-house-bot` project: see [ADR 0001](docs/adr/0001-host-on-a-compute-engine-vm.md) for why a Compute Engine VM.
Its resources are defined with Terraform, whose state lives in the versioned bucket `gs://fade-house-bot-tfstate`.
That bucket, and the APIs Terraform uses to read the project and its billing account, are made by hand, once, before Terraform can run:

```sh
gcloud storage buckets create gs://fade-house-bot-tfstate --project fade-house-bot \
  --location us-west1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://fade-house-bot-tfstate --versioning
gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project fade-house-bot
```

Then, from `infra/`, review what would change and apply it:

```sh
terraform init
terraform plan
terraform apply
```

After the first apply, delete the `default` network that enabling Compute Engine creates, as it allows SSH and RDP from anywhere and nothing uses it:

```sh
gcloud compute firewall-rules list --project fade-house-bot --filter=network=default --format='value(name)' |
  xargs gcloud compute firewall-rules delete --project fade-house-bot --quiet
gcloud compute networks delete default --project fade-house-bot --quiet
```

The data disk, which holds the database, has `prevent_destroy`, so no plan can delete it.
The VM is disposable: replacing it keeps the disk.
Changes to `infra/cloud-init.yaml` take effect when the VM next boots.

### Configuring the bot in production

The bot's environment variables live in the Secret Manager secret `fade-house-env`, written exactly like `.env`.
Terraform creates the secret but never its value, so the token stays out of Terraform state.
To set or change them, write them to a file outside the repo and add it as a new version:

```sh
gcloud secrets versions add fade-house-env --project fade-house-bot --data-file=<path to the file>
```

Then delete the file, and restart the bot to pick up the change.
`DATABASE_PATH` is ignored there: the database is always on the data disk.

### Reaching the VM

The VM accepts no traffic from the internet; SSH goes through Identity-Aware Proxy, using your Google login:

```sh
gcloud compute ssh fade-house --project fade-house-bot --zone us-west1-b --tunnel-through-iap
```

On the VM, `sudo journalctl -u fade-house -f` follows the bot's logs and `sudo systemctl restart fade-house` restarts it.
The logs are also in the Cloud Console's Logs Explorer.
The bot stays stopped until the first deploy sets the image it should run.

## Environment variables

`npm start` reads them from `.env` if it exists, otherwise from the environment.

| Variable                 | Required | Description                                                                                       |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`          | Yes      | The bot token. Use the test bot's token while developing.                                         |
| `DISCORD_APPLICATION_ID` | Yes      | The application ID, from the Developer Portal's General Information page.                         |
| `DISCORD_GUILD_ID`       | Yes      | The server the bot runs in. Commands are registered and answered only there.                      |
| `CHORES_CHANNEL_ID`      | Yes      | The #chores channel, for Assignment posts and completions.                                        |
| `RENT_CHANNEL_ID`        | Yes      | The #rent channel, for Rent payments and the all-paid message.                                    |
| `ADMIN_CHANNEL_ID`       | Yes      | The #bot-admin channel, for admin logs, warnings and backups.                                     |
| `TIMEZONE`               | No       | The house's IANA timezone, which defines months and job times. Defaults to `America/Los_Angeles`. |
| `DATABASE_PATH`          | No       | The SQLite database file. Defaults to `fade-house.db` in the directory the bot is started from.   |
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
For example, `/dev advance-to 2026-11-13 03:00` posts that day's backup in #bot-admin, `/dev advance-to 2026-11-27 09:00` sends the first Rent Reminders for November, and `/dev advance-to 2026-12-01 00:05` hands out December's Chores.
Outside the test server these commands are not registered, and the House refuses them.

CI runs the typecheck, lint and tests on every push and pull request.

All behaviour lives in the House core (`src/house/`), which knows nothing about Discord.
It takes commands and a snapshot of the server's members, and returns the reply and any messages to send.
The Discord adapter (`src/discord/`) is a thin translation layer around it and is checked by hand in the test server.

Tests drive only the House core, through `test/harness.ts`: an in-memory SQLite database, a fake Clock, and a roster of two Floor 1 and four Floor 3 Housemates plus members who are not Housemates.
They never inspect database rows or call internal modules, so the internals can change freely.
The exceptions are `test/commands.test.ts`, which checks that the `/dev` commands are registered only in the test server, and `test/messages.test.ts`, which checks how long messages are split to fit Discord's limit.
