import type { Member, Roster } from "./index.ts";

export type Floor = 1 | 3;

const floorRoles = new Map<string, Floor>([
  ["Floor 1", 1],
  ["Floor 3", 3],
]);

export interface Housemate {
  member: Member;
  floor: Floor;
}

export type Resolution =
  | { kind: "housemate"; housemate: Housemate }
  | { kind: "no floor" }
  /** Misconfigured: excluded until an Admin removes the extra role. */
  | { kind: "several floors"; floors: Floor[] };

/** A Housemate is a non-bot member with exactly one floor role. */
export function resolveMember(roster: Roster, memberId: string): Resolution {
  const member = roster.find((m) => m.id === memberId);
  if (!member || member.isBot) return { kind: "no floor" };

  const floors = member.roleNames
    .map((role) => floorRoles.get(role))
    .filter((floor) => floor !== undefined)
    .sort();
  const [floor] = floors;
  if (floor === undefined) return { kind: "no floor" };
  if (floors.length > 1) return { kind: "several floors", floors };
  return { kind: "housemate", housemate: { member, floor } };
}
