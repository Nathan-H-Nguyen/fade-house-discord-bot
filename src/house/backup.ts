import type Database from "better-sqlite3";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Post } from "./index.ts";

/**
 * Takes a consistent snapshot of the database through SQLite's online backup API,
 * which is safe while the bot is writing, unlike copying the file.
 */
async function snapshot(db: Database.Database): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "fade-house-backup-"));
  try {
    const path = join(dir, "snapshot.db");
    await db.backup(path);
    return new Uint8Array(await readFile(path));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * Backs up the database as a message for #bot-admin, with the snapshot attached as `fade-house-<date>.db`.
 * A snapshot that fails, or is over `limitBytes` and so cannot be attached, is reported instead.
 */
export async function backUp(
  db: Database.Database,
  date: string,
  limitBytes: number,
): Promise<Post> {
  const byHand = `See "Backups" in the README to take one by hand.`;

  let data: Uint8Array;
  try {
    data = await snapshot(db);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      channel: "admin",
      content: `The database backup for ${date} failed: ${reason.replace(/\.$/, "")}. ${byHand}`,
    };
  }

  if (data.byteLength > limitBytes) {
    return {
      channel: "admin",
      content:
        `The database backup for ${date} was not posted: it is ${formatSize(data.byteLength)}, ` +
        `over the ${formatSize(limitBytes)} attachment limit. ${byHand}`,
    };
  }
  return {
    channel: "admin",
    content: `Daily database backup for ${date}.`,
    attachment: { name: `fade-house-${date}.db`, data },
  };
}
