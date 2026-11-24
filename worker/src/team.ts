import { DurableObject } from "cloudflare:workers";
import type { ActionItem, ActionItemPatch, Phase } from "./domain/types";

export interface RetroSummary {
  id: string;
  title: string;
  phase: Phase;
  facilitator: string;
  createdAt: number;
  createdBy: string;
}

export interface Member {
  email: string;
  name: string;
}

export interface ActionItemQuery {
  retroId?: string;
  excludeRetroId?: string;
  openOnly?: boolean;
  owner?: string;
}

type Row = Record<string, SqlStorageValue>;

const toActionItem = (r: Row): ActionItem => ({
  id: r.id as string,
  retroId: r.retro_id as string,
  retroTitle: (r.retro_title as string | null) ?? "",
  topicId: r.topic_id as string | null,
  description: r.description as string,
  owner: r.owner as string | null,
  dueDate: r.due_date as string | null,
  done: r.done === 1,
  createdAt: r.created_at as number,
  createdBy: r.created_by as string,
});

/** Single instance holding team-wide data: the retro index, action items and display names. */
export class Team extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS retros (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, phase TEXT NOT NULL, facilitator TEXT NOT NULL,
        created_at INTEGER NOT NULL, created_by TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS action_items (
        id TEXT PRIMARY KEY, retro_id TEXT NOT NULL, topic_id TEXT, description TEXT NOT NULL,
        owner TEXT, due_date TEXT, done INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, created_by TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (email TEXT PRIMARY KEY, name TEXT NOT NULL);
    `);
  }

  upsertRetro(r: RetroSummary): void {
    this.sql.exec(
      `INSERT INTO retros (id, title, phase, facilitator, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, phase = excluded.phase, facilitator = excluded.facilitator`,
      r.id, r.title, r.phase, r.facilitator, r.createdAt, r.createdBy,
    );
  }

  deleteRetro(id: string): void {
    this.sql.exec("DELETE FROM retros WHERE id = ?", id);
    this.sql.exec("DELETE FROM action_items WHERE retro_id = ?", id);
  }

  listRetros(): RetroSummary[] {
    return this.sql
      .exec("SELECT * FROM retros ORDER BY created_at DESC")
      .toArray()
      .map((r) => ({
        id: r.id as string,
        title: r.title as string,
        phase: r.phase as Phase,
        facilitator: r.facilitator as string,
        createdAt: r.created_at as number,
        createdBy: r.created_by as string,
      }));
  }

  createActionItem(input: Omit<ActionItem, "id" | "done" | "createdAt" | "retroTitle">): ActionItem {
    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO action_items (id, retro_id, topic_id, description, owner, due_date, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, input.retroId, input.topicId, input.description, input.owner, input.dueDate, Date.now(), input.createdBy,
    );
    return this.getActionItem(id)!;
  }

  getActionItem(id: string): ActionItem | null {
    const row = this.sql
      .exec("SELECT a.*, r.title AS retro_title FROM action_items a LEFT JOIN retros r ON r.id = a.retro_id WHERE a.id = ?", id)
      .toArray()[0];
    return row ? toActionItem(row) : null;
  }

  updateActionItem(id: string, patch: ActionItemPatch): ActionItem | null {
    const existing = this.getActionItem(id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.sql.exec(
      "UPDATE action_items SET description = ?, owner = ?, due_date = ?, done = ? WHERE id = ?",
      next.description, next.owner, next.dueDate, next.done ? 1 : 0, id,
    );
    return this.getActionItem(id);
  }

  listActionItems(q: ActionItemQuery = {}): ActionItem[] {
    const where: string[] = [];
    const args: SqlStorageValue[] = [];
    if (q.retroId) where.push("a.retro_id = ?"), args.push(q.retroId);
    if (q.excludeRetroId) where.push("a.retro_id != ?"), args.push(q.excludeRetroId);
    if (q.openOnly) where.push("a.done = 0");
    if (q.owner) where.push("a.owner = ?"), args.push(q.owner);
    return this.sql
      .exec(
        `SELECT a.*, r.title AS retro_title FROM action_items a LEFT JOIN retros r ON r.id = a.retro_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.created_at ASC`,
        ...args,
      )
      .toArray()
      .map(toActionItem);
  }

  getMember(email: string): Member {
    const row = this.sql.exec("SELECT name FROM members WHERE email = ?", email).toArray()[0];
    return { email, name: (row?.name as string | undefined) ?? email };
  }

  listMembers(): Member[] {
    return this.sql
      .exec("SELECT email, name FROM members ORDER BY name")
      .toArray()
      .map((r) => ({ email: r.email as string, name: r.name as string }));
  }

  setDisplayName(email: string, name: string): Member {
    this.sql.exec(
      "INSERT INTO members (email, name) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name",
      email, name,
    );
    return { email, name };
  }
}
