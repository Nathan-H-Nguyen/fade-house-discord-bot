/**
 * The House core: every behaviour of the bot, free of Discord.
 * Callers pass in commands and a roster snapshot, and get back a reply and the messages to send.
 */

import {
  activeChores,
  addChore,
  findActiveChore,
  foldChoreName,
  maxChoreNameLength,
  retireChore,
  scopeLabels,
  scopes,
  updateChore,
  type Scope,
} from "./chores.ts";
import type { Random } from "./assignments.ts";
import { backUp } from "./backup.ts";
import { formatDateTime, houseCalendar, parseDateTime } from "./calendar.ts";
import { openDatabase } from "./database.ts";
import { resolveMember } from "./housemates.ts";
import { escapeMarkdown } from "./markdown.ts";
import { assignMonth } from "./monthly-run.ts";
import { daily, monthly, runDueJobs, type Job } from "./scheduler.ts";

export { maxChoreNameLength, scopes, scopeLabels, type Scope };

export interface Clock {
  now(): Date;
}

/** A server member as the caller sees them at the moment of the call. */
export interface Member {
  id: string;
  displayName: string;
  isBot: boolean;
  roleNames: readonly string[];
}

export type Roster = readonly Member[];

export interface Actor {
  memberId: string;
  /** Whether the member has the Discord Administrator permission. */
  isAdmin: boolean;
}

export type Command =
  | { name: "ping" }
  | { name: "chore add"; choreName: string; scope: Scope }
  | { name: "chore list" }
  /** `choreName` names an active Chore, picked by autocomplete or typed in any case. */
  | { name: "chore edit"; choreName: string; newName?: string; scope?: Scope }
  | { name: "chore retire"; choreName: string }
  /** Test server only. */
  | { name: "dev now" }
  /** Test server only. `to` is a house time, as YYYY-MM-DD HH:MM. */
  | { name: "dev advance-to"; to: string };

export interface Reply {
  content: string;
  /** Whether only the caller can see the reply. */
  private: boolean;
}

/** A file sent along with a message. */
export interface Attachment {
  name: string;
  data: Uint8Array;
}

/** A message to post in #chores or #bot-admin. */
export interface Post {
  channel: "chores" | "admin";
  content: string;
  attachment?: Attachment;
}

/** A message to send a member privately. */
export interface DirectMessage {
  memberId: string;
  content: string;
  /** Posted instead, to say so, if the member cannot be sent DMs. */
  ifUndelivered: Post;
}

/** A message the caller must deliver beyond the reply, in the order given. */
export type Outbound = Post | DirectMessage;

export interface CommandResult {
  reply: Reply;
  outbound: Outbound[];
}

/** An option the caller is filling in, with the text typed so far. */
export type SuggestionField = { name: "chore"; text: string };

/** One autocomplete choice: what the Housemate sees, and what the command receives. */
export interface Suggestion {
  label: string;
  value: string;
}

/**
 * The House offers at most this many suggestions, each label at most this long,
 * which also keeps them within what Discord accepts.
 */
const maxSuggestions = 25;
const maxSuggestionLabelLength = 100;

export interface House {
  handle(call: {
    actor: Actor;
    roster: Roster;
    command: Command;
  }): Promise<CommandResult>;
  /** Suggests values for an option as the member types it. Non-Housemates get none. */
  suggest(call: {
    actor: Actor;
    roster: Roster;
    field: SuggestionField;
  }): Suggestion[];
  /** Runs any scheduled jobs that are due, with the server's members as they are now, returning the messages they send. */
  tick(roster: Roster): Promise<Outbound[]>;
  /** Waits for any tick in progress, then closes the database. The House must not be used afterwards. */
  close(): Promise<void>;
}

export function openHouse(options: {
  databasePath: string;
  clock: Clock;
  /** IANA name of the house timezone, which defines job times. */
  timezone: string;
  /** The largest file Discord accepts as an attachment, which caps the size of a posted backup. */
  attachmentLimitBytes: number;
  /** Whether the bot is running in the test server, which enables the `/dev` commands. */
  isTestServer: boolean;
  /** The source of randomness for handing out Chores. Defaults to `Math.random`. */
  random?: Random;
}): House {
  const db = openDatabase(options.databasePath);
  const calendar = houseCalendar(options.timezone);

  // How far `/dev advance-to` has moved the bot's time past the Clock. It resets on restart.
  let devOffsetMs = 0;

  function now(): Date {
    return new Date(options.clock.now().getTime() + devOffsetMs);
  }

  const random = options.random ?? Math.random;

  const jobs: Job[] = [
    {
      name: "monthly-assignment",
      currentPeriod: monthly(0, 5),
      run: (period, roster) =>
        Promise.resolve(assignMonth(db, period.start, roster, random)),
    },
    {
      name: "backup",
      currentPeriod: daily(3, 0),
      run: async (period) => [
        await backUp(db, period.key, options.attachmentLimitBytes),
      ],
    },
  ];

  // Ticks run one after another, so no job starts again while a run of it is still in progress.
  let ticking: Promise<unknown> = Promise.resolve();

  function tick(roster: Roster): Promise<Outbound[]> {
    const next = ticking.then(() => {
      const at = now();
      return runDueJobs(db, jobs, roster, calendar.toLocal(at), at);
    });
    ticking = next.catch(() => undefined);
    return next;
  }

  function reply(content: string): CommandResult {
    return { reply: { content, private: true }, outbound: [] };
  }

  /**
   * The refusal for a trimmed Chore name that cannot be used, if any.
   * `choreId` is the Chore being renamed, which may keep its own name in any case.
   */
  function invalidName(
    name: string,
    choreId?: number,
  ): CommandResult | undefined {
    if (name === "") return reply("A Chore needs a name.");
    if (name.length > maxChoreNameLength) {
      return reply(
        `A Chore name can be at most ${String(maxChoreNameLength)} characters.`,
      );
    }
    const existing = findActiveChore(db, name);
    if (existing && existing.id !== choreId) {
      return reply(
        `There is already a Chore named ${escapeMarkdown(existing.name)}.`,
      );
    }
    return undefined;
  }

  /** The bot's time, as the house sees it. */
  function describeNow(): string {
    return `${formatDateTime(calendar.toLocal(now()))} (${options.timezone})`;
  }

  function noSuchChore(name: string): CommandResult {
    return reply(`There is no active Chore named ${escapeMarkdown(name)}.`);
  }

  return {
    async close() {
      await ticking;
      db.close();
    },

    tick,

    suggest({ actor, roster, field }) {
      if (resolveMember(roster, actor.memberId).kind !== "housemate") return [];
      const text = foldChoreName(field.text.trim());
      return activeChores(db)
        .filter((c) => foldChoreName(c.name).includes(text))
        .slice(0, maxSuggestions)
        .map((c) => {
          const label = `${c.name} (${scopeLabels[c.scope]})`;
          return {
            label: label.length <= maxSuggestionLabelLength ? label : c.name,
            value: c.name,
          };
        });
    },

    async handle({ actor, roster, command }) {
      if (command.name === "ping")
        return reply("Pong! Fade House bot is connected.");

      if (command.name === "dev now" || command.name === "dev advance-to") {
        if (!options.isTestServer) {
          return reply("The /dev commands only work in the test server.");
        }
        if (command.name === "dev now") {
          return reply(`The bot's time is ${describeNow()}.`);
        }
        const to = parseDateTime(command.to);
        if (!to) {
          return reply(
            "Give the time as YYYY-MM-DD HH:MM, such as 2026-11-27 09:00.",
          );
        }
        const target = calendar.fromLocal(to);
        if (!target) {
          return reply(
            `${formatDateTime(to)} is not a time in ${options.timezone}.`,
          );
        }
        // Jobs already run for later periods would not run again, so time never goes back.
        // Times are given to the minute, so the current minute counts as now.
        const current = now().getTime();
        if (target.getTime() < current - (current % 60_000)) {
          return reply(
            `The bot's time only moves forward, and it is already ${describeNow()}.`,
          );
        }
        devOffsetMs = target.getTime() - options.clock.now().getTime();
        const outbound = await tick(roster);
        return {
          reply: {
            content: `Moved the bot's time to ${describeNow()}.`,
            private: true,
          },
          outbound,
        };
      }

      const resolution = resolveMember(roster, actor.memberId);
      switch (resolution.kind) {
        case "no floor":
          return reply(
            "Only Housemates can use this command. Ask an Admin to give you the Floor 1 or Floor 3 role.",
          );
        case "several floors":
          return reply(
            `You have both the ${resolution.floors.map((f) => `Floor ${String(f)}`).join(" and ")} roles, ` +
              "so you are not counted as a Housemate. Ask an Admin to remove one.",
          );
        case "housemate":
          break;
      }

      switch (command.name) {
        case "chore add": {
          const name = command.choreName.trim();
          const invalid = invalidName(name);
          if (invalid) return invalid;
          addChore(db, { name, scope: command.scope }, now());
          return reply(
            `Added ${escapeMarkdown(name)} to the ${scopeLabels[command.scope]} Chores.`,
          );
        }

        case "chore list": {
          const chores = activeChores(db);
          return reply(
            scopes
              .map((scope) => {
                const names = chores
                  .filter((c) => c.scope === scope)
                  .map((c) => `- ${escapeMarkdown(c.name)}`);
                return [
                  `**${scopeLabels[scope]}**`,
                  ...(names.length > 0 ? names : ["None"]),
                ].join("\n");
              })
              .join("\n\n"),
          );
        }

        case "chore edit": {
          const choreName = command.choreName.trim();
          const chore = findActiveChore(db, choreName);
          if (!chore) return noSuchChore(choreName);
          if (command.newName === undefined && command.scope === undefined) {
            return reply(
              `Give ${escapeMarkdown(chore.name)} a new name, a new Scope or both.`,
            );
          }
          const name = command.newName?.trim() ?? chore.name;
          const invalid = invalidName(name, chore.id);
          if (invalid) return invalid;
          const scope = command.scope ?? chore.scope;
          if (name === chore.name && scope === chore.scope) {
            return reply(
              `${escapeMarkdown(chore.name)} already has that name and Scope.`,
            );
          }
          updateChore(db, { ...chore, name, scope });

          const moved = `to the ${scopeLabels[scope]} Chores`;
          if (name === chore.name) {
            return reply(`Moved ${escapeMarkdown(name)} ${moved}.`);
          }
          const renamed = `Renamed ${escapeMarkdown(chore.name)} to ${escapeMarkdown(name)}`;
          return reply(
            scope === chore.scope
              ? `${renamed}.`
              : `${renamed} and moved it ${moved}.`,
          );
        }

        case "chore retire": {
          const choreName = command.choreName.trim();
          const chore = findActiveChore(db, choreName);
          if (!chore) return noSuchChore(choreName);
          retireChore(db, chore.id);
          return reply(
            `Retired ${escapeMarkdown(chore.name)}. It will not be handed out from next month.`,
          );
        }
      }
    },
  };
}
