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

/** A Clock that stays at the time it was given, so tests decide what "now" is. */
class FakeClock implements Clock {
  private readonly current: Date;

  constructor(start: Date) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }
}

/**
 * Opens a House on the roster fixture, with a fake Clock.
 * The database is in memory unless a test needs one that outlives the House.
 */
export function createTestHouse({ databasePath = ":memory:" } = {}) {
  const clock = new FakeClock(new Date("2026-11-12T18:00:00Z"));
  const house = openHouse({ databasePath, clock });

  return {
    close() {
      house.close();
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
