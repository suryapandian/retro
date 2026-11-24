import {
  PHASES,
  type ActionItemPatch,
  type Card,
  type Column,
  type Command,
  type CommandContext,
  type CommandResult,
  type Effect,
  type Phase,
  type RetroState,
  type Settings,
  type Topic,
} from "./types";

export const LIMITS = {
  cardText: 500,
  topicTitle: 100,
  topicNote: 5000,
  retroTitle: 100,
  actionItem: 500,
  columns: 6,
  columnTitle: 50,
  maxVotes: 20,
  timerSeconds: 3600,
  facilitatorClaimAfterMs: 2 * 60 * 1000,
};

export const DEFAULT_SETTINGS: Settings = { votesPerMember: 3, allowMultipleVotesPerTopic: true };

export function createRetro(args: {
  id: string;
  title: string;
  columns: Column[];
  settings?: Partial<Settings>;
  createdBy: string;
  now: number;
}): RetroState {
  return {
    id: args.id,
    title: args.title,
    createdAt: args.now,
    createdBy: args.createdBy,
    facilitator: args.createdBy,
    facilitatorLastSeenAt: args.now,
    phase: "setup",
    columns: args.columns,
    settings: { ...DEFAULT_SETTINGS, ...args.settings },
    participants: {},
    cards: {},
    topics: {},
    votes: {},
    done: [],
    timer: null,
    currentTopicId: null,
  };
}

export function validateRetroInput(title: unknown, columns: unknown, settings: unknown): string | null {
  if (typeof title !== "string" || !title.trim() || title.length > LIMITS.retroTitle) return "invalid title";
  if (!Array.isArray(columns) || columns.length === 0 || columns.length > LIMITS.columns) return "invalid columns";
  const ids = new Set<string>();
  for (const c of columns as Column[]) {
    if (typeof c?.id !== "string" || !c.id || ids.has(c.id)) return "invalid column id";
    if (typeof c.title !== "string" || !c.title.trim() || c.title.length > LIMITS.columnTitle) return "invalid column title";
    if (c.prompt !== undefined && typeof c.prompt !== "string") return "invalid column prompt";
    ids.add(c.id);
  }
  if (settings !== undefined) {
    const s = settings as Partial<Settings>;
    if (s.votesPerMember !== undefined && !(Number.isInteger(s.votesPerMember) && s.votesPerMember >= 1 && s.votesPerMember <= LIMITS.maxVotes)) {
      return "invalid votes per member";
    }
    if (s.allowMultipleVotesPerTopic !== undefined && typeof s.allowMultipleVotesPerTopic !== "boolean") {
      return "invalid vote stacking setting";
    }
  }
  return null;
}

/** Topics in the order they are discussed: most votes first, then oldest first. */
export function topicsByVotes(state: RetroState): Topic[] {
  const totals = voteTotals(state);
  return Object.values(state.topics).sort(
    (a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0) || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

export function voteTotals(state: RetroState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const byTopic of Object.values(state.votes)) {
    for (const [topicId, n] of Object.entries(byTopic)) totals[topicId] = (totals[topicId] ?? 0) + n;
  }
  return totals;
}

export function votesUsed(state: RetroState, member: string): number {
  return Object.values(state.votes[member] ?? {}).reduce((a, b) => a + b, 0);
}

export function cardsInTopic(state: RetroState, topicId: string): Card[] {
  return Object.values(state.cards)
    .filter((c) => c.topicId === topicId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function topicColumnId(state: RetroState, topicId: string): string {
  return cardsInTopic(state, topicId)[0]?.columnId ?? state.columns[0]?.id ?? "";
}

class Rejection extends Error {}

function reject(reason: string): never {
  throw new Rejection(reason);
}

function requirePhase(state: RetroState, ...phases: Phase[]) {
  if (!phases.includes(state.phase)) reject(`not allowed in ${state.phase} phase`);
}

function requireFacilitator(state: RetroState, actor: string) {
  if (state.facilitator !== actor) reject("only the facilitator can do that");
}

function requireText(text: unknown, max: number, what: string): string {
  if (typeof text !== "string") reject(`invalid ${what}`);
  const trimmed = text.trim();
  if (!trimmed) reject(`${what} cannot be empty`);
  if (trimmed.length > max) reject(`${what} is too long`);
  return trimmed;
}

function requireCard(state: RetroState, cardId: string): Card {
  return state.cards[cardId] ?? reject("card not found");
}

function requireTopic(state: RetroState, topicId: string): Topic {
  return state.topics[topicId] ?? reject("topic not found");
}

function removeTopicIfEmpty(state: RetroState, topicId: string) {
  if (cardsInTopic(state, topicId).length > 0) return;
  delete state.topics[topicId];
  // Votes on a removed topic go back to their voters.
  for (const byTopic of Object.values(state.votes)) delete byTopic[topicId];
  if (state.currentTopicId === topicId) state.currentTopicId = null;
}

function newTopic(ctx: CommandContext, createdAt: number): Topic {
  return { id: ctx.newId(), title: "", note: "", discussed: false, createdAt };
}

function changePhase(state: RetroState, phase: Phase) {
  state.phase = phase;
  state.done = [];
  state.timer = null;
  if (phase === "discuss") state.currentTopicId = topicsByVotes(state).find((t) => !t.discussed)?.id ?? null;
}

const optionalString = (v: unknown, max: number, what: string): string | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > max) reject(`invalid ${what}`);
  return v;
};

const dueDate = (v: unknown) => {
  const d = optionalString(v, 10, "due date");
  if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) reject("invalid due date");
  return d;
};

/**
 * Applies a command from `ctx.actor` to the retro. Pure apart from `ctx.newId`:
 * the input state is never mutated.
 */
export function applyCommand(input: RetroState, command: Command, ctx: CommandContext): CommandResult {
  const state = structuredClone(input);
  const effects: Effect[] = [];
  const { actor, now } = ctx;
  try {
    if (state.phase === "close" && command.type !== "updateActionItem") reject("retro is closed");

    switch (command.type) {
      case "updateSettings": {
        requireFacilitator(state, actor);
        requirePhase(state, "setup");
        const title = command.title ?? state.title;
        const columns = command.columns ?? state.columns;
        const settings = { ...state.settings, ...command.settings };
        const invalid = validateRetroInput(title, columns, settings);
        if (invalid) reject(invalid);
        state.title = title.trim();
        state.columns = columns.map((c) => ({ id: c.id, title: c.title.trim(), ...(c.prompt ? { prompt: c.prompt } : {}) }));
        state.settings = settings;
        break;
      }
      case "addCard": {
        requirePhase(state, "think");
        if (!state.columns.some((c) => c.id === command.columnId)) reject("column not found");
        const text = requireText(command.text, LIMITS.cardText, "card text");
        const topic = newTopic(ctx, now);
        state.topics[topic.id] = topic;
        const id = ctx.newId();
        state.cards[id] = { id, columnId: command.columnId, topicId: topic.id, text, author: actor, createdAt: now };
        break;
      }
      case "editCard": {
        requirePhase(state, "think", "group");
        const card = requireCard(state, command.cardId);
        if (card.author !== actor) reject("you can only edit your own cards");
        card.text = requireText(command.text, LIMITS.cardText, "card text");
        break;
      }
      case "deleteCard": {
        requirePhase(state, "think");
        const card = requireCard(state, command.cardId);
        if (card.author !== actor) reject("you can only delete your own cards");
        delete state.cards[card.id];
        removeTopicIfEmpty(state, card.topicId);
        break;
      }
      case "setDone": {
        requirePhase(state, "think", "group", "vote");
        state.done = state.done.filter((m) => m !== actor);
        if (command.done) state.done.push(actor);
        break;
      }
      case "moveCard": {
        requirePhase(state, "group");
        const card = requireCard(state, command.cardId);
        requireTopic(state, command.targetTopicId);
        if (card.topicId === command.targetTopicId) break;
        const from = card.topicId;
        card.topicId = command.targetTopicId;
        removeTopicIfEmpty(state, from);
        break;
      }
      case "detachCard": {
        requirePhase(state, "group");
        const card = requireCard(state, command.cardId);
        if (cardsInTopic(state, card.topicId).length === 1) break;
        const topic = newTopic(ctx, card.createdAt);
        state.topics[topic.id] = topic;
        card.topicId = topic.id;
        break;
      }
      case "renameTopic": {
        requirePhase(state, "group", "discuss");
        const topic = requireTopic(state, command.topicId);
        if (typeof command.title !== "string" || command.title.length > LIMITS.topicTitle) reject("invalid topic title");
        topic.title = command.title.trim();
        break;
      }
      case "vote": {
        requirePhase(state, "vote");
        requireTopic(state, command.topicId);
        if (votesUsed(state, actor) >= state.settings.votesPerMember) reject("no votes left");
        const mine = (state.votes[actor] ??= {});
        if (!state.settings.allowMultipleVotesPerTopic && (mine[command.topicId] ?? 0) > 0) {
          reject("you have already voted for this topic");
        }
        mine[command.topicId] = (mine[command.topicId] ?? 0) + 1;
        break;
      }
      case "unvote": {
        requirePhase(state, "vote");
        const mine = state.votes[actor];
        if (!mine?.[command.topicId]) reject("you have no vote on this topic");
        mine[command.topicId] -= 1;
        if (mine[command.topicId] === 0) delete mine[command.topicId];
        break;
      }
      case "setCurrentTopic": {
        requireFacilitator(state, actor);
        requirePhase(state, "discuss");
        if (command.topicId !== null) requireTopic(state, command.topicId);
        state.currentTopicId = command.topicId;
        break;
      }
      case "nextTopic": {
        requireFacilitator(state, actor);
        requirePhase(state, "discuss");
        if (state.currentTopicId) requireTopic(state, state.currentTopicId).discussed = true;
        const order = topicsByVotes(state);
        const start = order.findIndex((t) => t.id === state.currentTopicId);
        const rest = [...order.slice(start + 1), ...order.slice(0, start + 1)];
        state.currentTopicId = rest.find((t) => !t.discussed)?.id ?? null;
        state.timer = null;
        break;
      }
      case "setTopicDiscussed": {
        requirePhase(state, "discuss");
        requireTopic(state, command.topicId).discussed = command.discussed === true;
        break;
      }
      case "setTopicNote": {
        requirePhase(state, "discuss");
        const topic = requireTopic(state, command.topicId);
        if (typeof command.note !== "string" || command.note.length > LIMITS.topicNote) reject("invalid note");
        topic.note = command.note;
        break;
      }
      case "addActionItem": {
        requirePhase(state, "discuss");
        const topicId = command.topicId ?? null;
        if (topicId !== null) requireTopic(state, topicId);
        effects.push({
          type: "createActionItem",
          topicId,
          description: requireText(command.description, LIMITS.actionItem, "action item"),
          owner: optionalString(command.owner, 200, "owner"),
          dueDate: dueDate(command.dueDate),
        });
        break;
      }
      case "updateActionItem": {
        effects.push({ type: "updateActionItem", id: command.id, patch: validateActionItemPatch(command.patch) });
        break;
      }
      case "startTimer": {
        requireFacilitator(state, actor);
        const s = command.seconds;
        if (!Number.isInteger(s) || s < 1 || s > LIMITS.timerSeconds) reject("invalid timer duration");
        state.timer = { endsAt: now + s * 1000 };
        break;
      }
      case "stopTimer": {
        requireFacilitator(state, actor);
        state.timer = null;
        break;
      }
      case "advancePhase": {
        requireFacilitator(state, actor);
        changePhase(state, PHASES[PHASES.indexOf(state.phase) + 1]);
        break;
      }
      case "revertPhase": {
        requireFacilitator(state, actor);
        if (state.phase === "setup") reject("already at the first phase");
        changePhase(state, PHASES[PHASES.indexOf(state.phase) - 1]);
        break;
      }
      case "transferFacilitator": {
        requireFacilitator(state, actor);
        if (!state.participants[command.to]) reject("that member hasn't joined this retro");
        state.facilitator = command.to;
        state.facilitatorLastSeenAt = now;
        break;
      }
      case "claimFacilitator": {
        if (state.facilitator === actor) break;
        if (ctx.online.has(state.facilitator)) reject("the facilitator is still connected");
        if (now - state.facilitatorLastSeenAt < LIMITS.facilitatorClaimAfterMs) {
          reject("the facilitator has only just disconnected");
        }
        state.facilitator = actor;
        state.facilitatorLastSeenAt = now;
        break;
      }
      default:
        reject("unknown command");
    }
  } catch (e) {
    if (e instanceof Rejection) return { ok: false, reason: e.message };
    throw e;
  }
  return { ok: true, state, effects };
}

export function validateActionItemPatch(patch: unknown) {
  if (typeof patch !== "object" || patch === null) reject("invalid action item update");
  const p = patch as Record<string, unknown>;
  const out: ActionItemPatch = {};
  if (p.description !== undefined) out.description = requireText(p.description, LIMITS.actionItem, "action item");
  if (p.owner !== undefined) out.owner = optionalString(p.owner, 200, "owner");
  if (p.dueDate !== undefined) out.dueDate = dueDate(p.dueDate);
  if (p.done !== undefined) {
    if (typeof p.done !== "boolean") reject("invalid done flag");
    out.done = p.done;
  }
  return out;
}

/** Same validation as the reducer, for callers outside a command (the HTTP API). */
export function checkActionItemPatch(patch: unknown): { ok: true; patch: ActionItemPatch } | { ok: false; reason: string } {
  try {
    return { ok: true, patch: validateActionItemPatch(patch) };
  } catch (e) {
    if (e instanceof Rejection) return { ok: false, reason: e.message };
    throw e;
  }
}
