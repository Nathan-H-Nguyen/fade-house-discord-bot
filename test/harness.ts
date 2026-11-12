import {
  openHouse,
  type Clock,
  type Command,
  type Member,
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

export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(to: Date): void {
    this.current = new Date(to);
  }
}

export function createTestHouse() {
  const clock = new FakeClock(new Date("2026-11-12T18:00:00Z"));
  const house = openHouse({ databasePath: ":memory:", clock });

  return {
    clock,
    /** Runs a slash command as the named member, who is not an Admin unless stated. */
    run(as: MemberName, command: Command, { isAdmin = false } = {}) {
      const member = roster.find((m) => m.displayName === as);
      if (!member)
        throw new Error(`No member named ${as} in the roster fixture`);
      return house.handle({
        actor: { memberId: member.id, isAdmin },
        roster,
        command,
      });
    },
  };
}
