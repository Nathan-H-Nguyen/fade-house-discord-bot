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
  type Roster,
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

/** A seeded source of randomness (mulberry32), so a test hands out Chores the same way every run. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
 * Chores are handed out with randomness from `seed`, so tests that check fairness should try several.
 */
export function createTestHouse({
  databasePath = ":memory:",
  now = "2026-11-12T10:00:00-08:00",
  attachmentLimitBytes = 10 * 1024 * 1024,
  isTestServer = false,
  seed = 1,
}: {
  databasePath?: string;
  now?: string;
  attachmentLimitBytes?: number;
  isTestServer?: boolean;
  seed?: number;
} = {}) {
  const clock = new FakeClock(new Date(now));
  const house = openHouse({
    databasePath,
    clock,
    timezone: "America/Los_Angeles",
    attachmentLimitBytes,
    isTestServer,
    random: seededRandom(seed),
  });

  return {
    close() {
      return house.close();
    },

    /** Moves the Clock to a new time without ticking, as if the bot had been asleep. */
    setTime(time: string) {
      clock.set(new Date(time));
    },

    /** Runs any scheduled jobs that are due, as the bot does every minute, with the roster fixture unless given another. */
    tick({ members = roster }: { members?: Roster } = {}) {
      return house.tick(members);
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
