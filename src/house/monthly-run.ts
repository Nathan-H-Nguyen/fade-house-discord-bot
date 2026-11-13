import type Database from "better-sqlite3";
import {
  assigneesIn,
  planAssignments,
  saveAssignments,
  type Random,
} from "./assignments.ts";
import {
  formatMonth,
  nameMonth,
  previousMonth,
  type Month,
} from "./calendar.ts";
import {
  activeChores,
  foldChoreName,
  scopeLabels,
  type StoredChore,
} from "./chores.ts";
import { housematesIn } from "./housemates.ts";
import type { Outbound, Post, Roster } from "./index.ts";
import { escapeMarkdown } from "./markdown.ts";

/** Shows a member by mention, which Discord renders as their current name. */
function mention(memberId: string): string {
  return `<@${memberId}>`;
}

function choreLines(chores: readonly StoredChore[]): string[] {
  return [...chores]
    .sort((a, b) => foldChoreName(a.name).localeCompare(foldChoreName(b.name)))
    .map((c) => `- ${escapeMarkdown(c.name)} (${scopeLabels[c.scope]})`);
}

/**
 * Gives every active Chore to one eligible Housemate for `month`, and returns the post for #chores,
 * a DM to each Housemate listing their own, and a report in #bot-admin for each member with several floor roles.
 */
export function assignMonth(
  db: Database.Database,
  month: Month,
  roster: Roster,
  random: Random,
): Outbound[] {
  const { housemates, misconfigured } = housematesIn(roster);
  const { assignments, skipped } = planAssignments({
    chores: activeChores(db),
    housemates,
    previous: assigneesIn(db, formatMonth(previousMonth(month))),
    random,
  });
  saveAssignments(db, formatMonth(month), assignments);

  const monthName = nameMonth(month);
  const given = housemates
    .map((h) => ({
      housemate: h,
      chores: assignments
        .filter((a) => a.memberId === h.member.id)
        .map((a) => a.chore),
    }))
    .filter(({ chores }) => chores.length > 0)
    .sort(
      (a, b) =>
        a.housemate.floor - b.housemate.floor ||
        a.housemate.member.displayName.localeCompare(
          b.housemate.member.displayName,
        ),
    );

  const sections = given.map(({ housemate, chores }) =>
    [mention(housemate.member.id), ...choreLines(chores)].join("\n"),
  );
  if (skipped.length > 0) {
    sections.push(
      [
        "Not assigned, because no Housemate is eligible:",
        ...choreLines(skipped),
      ].join("\n"),
    );
  }
  if (sections.length === 0) sections.push("There are no active Chores.");
  const post: Post = {
    channel: "chores",
    content: [`**Chores for ${monthName}**`, ...sections].join("\n\n"),
  };

  const dms: Outbound[] = given.map(({ housemate, chores }) => ({
    memberId: housemate.member.id,
    content: [`Your Chores for ${monthName}:`, ...choreLines(chores)].join(
      "\n",
    ),
    ifUndelivered: {
      channel: "chores",
      content: `Could not DM ${mention(housemate.member.id)} their Chores for ${monthName}. They are in the post above.`,
    },
  }));

  const reports: Outbound[] = misconfigured.map(({ member, floors }) => ({
    channel: "admin",
    content:
      `${mention(member.id)} has both the ${floors.map((f) => `Floor ${String(f)}`).join(" and ")} roles, ` +
      `so they were given no Chores for ${monthName}. Remove one of the roles to include them from next month.`,
  }));

  return [post, ...dms, ...reports];
}
