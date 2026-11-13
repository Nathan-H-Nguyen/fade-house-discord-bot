import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import {
  openHouse,
  type Actor,
  type Clock,
  type Command,
  type Member,
  type SuggestionField,
} from "../src/house/index.ts";

/** The house as it is: two Housemates on Floor 1, four on Floor 3, and members who are not Housemates. */
export const roster = [
  { id: "1001", displayName: "Alice", isBot: false, roleNames: ["Floor 1"] },
  { id: "1002", displayName: "Ben", isBot: false, roleNames: ["Floor 1"] },
  { id: "3001", displayName: "Chloe", isBot: false, roleNames: ["Floor 3"] },
  {
    id: "3002",
    displayName: "Dan",
    isBot: false,
    roleNames: ["Floor 3", "Gamer"],
  },
  { id: "3003", displayName: "Eve", isBot: false, roleNames: ["Floor 3"] },
  { id: "3004", displayName: "Finn", isBot: false, roleNames: ["Floor 3"] },
  { id: "9001", displayName: "Guest", isBot: false, roleNames: ["Gamer"] },
  {
    id: "9002",
    displayName: "Mixed",
    isBot: false,
    roleNames: ["Floor 1", "Floor 3"],
  },
  { id: "9003", displayName: "SomeBot", isBot: true, roleNames: ["Floor 1"] },
] as const satisfies readonly Member[];

type MemberName = (typeof roster)[number]["displayName"];

function actorOf(as: MemberName, isAdmin = false): Actor {
  const member = roster.find((m) => m.displayName === as);
  if (!member) throw new Error(`No member named ${as} in the roster fixture`);
  return { memberId: member.id, isAdmin };
}

/** A Clock that stays at the time it was last set to, so tests decide what "now" is. */
class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(time: Date): void {
    this.current = new Date(time);
  }
}

/** A path in a fresh directory that is removed when the current test finishes. */
export function temporaryPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fade-house-"));
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return join(dir, name);
}

/**
 * Opens a House on the roster fixture, with a fake Clock, in the America/Los_Angeles timezone.
 * It runs as the production server, without the `/dev` commands, unless a test says otherwise.
 * The database is in memory unless a test needs one that outlives the House.
 * Times are ISO 8601 strings with an offset, such as "2026-11-12T03:00:00-08:00".
 */
export function createTestHouse({
  databasePath = ":memory:",
  now = "2026-11-12T10:00:00-08:00",
  attachmentLimitBytes = 10 * 1024 * 1024,
  isTestServer = false,
}: {
  databasePath?: string;
  now?: string;
  attachmentLimitBytes?: number;
  isTestServer?: boolean;
} = {}) {
  const clock = new FakeClock(new Date(now));
  const house = openHouse({
    databasePath,
    clock,
    timezone: "America/Los_Angeles",
    attachmentLimitBytes,
    isTestServer,
  });

  return {
    close() {
      return house.close();
    },

    /** Moves the Clock to a new time without ticking, as if the bot had been asleep. */
    setTime(time: string) {
      clock.set(new Date(time));
    },

    /** Runs any scheduled jobs that are due, as the bot does every minute. */
    tick() {
      return house.tick();
    },

    /** Runs a slash command as the named member, who is not an Admin unless stated. */
    run(as: MemberName, command: Command, { isAdmin = false } = {}) {
      return house.handle({
        actor: actorOf(as, isAdmin),
        roster,
        command,
      });
    },

    /** Asks for autocomplete suggestions as the named member types into an option. */
    suggest(as: MemberName, field: SuggestionField) {
      return house.suggest({ actor: actorOf(as), roster, field });
    },
  };
}
