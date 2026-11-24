import { DurableObject } from "cloudflare:workers";
import { applyCommand, createRetro } from "./domain/reducer";
import type { ActionItem, ClientMessage, Column, Effect, RetroState, RetroView, ServerMessage, Settings } from "./domain/types";
import { projectView } from "./domain/view";
import type { RetroSummary } from "./team";

interface SocketAttachment {
  email: string;
}

export const IDENTITY_HEADERS = { email: "X-Retro-User-Email", name: "X-Retro-User-Name" } as const;

/** One instance per retro. Owns the retro state and the participants' WebSockets. */
export class RetroRoom extends DurableObject<Env> {
  private state: RetroState | null = null;
  // Cached from the Team DO; reloaded lazily after hibernation.
  private actionItems: ActionItem[] | null = null;
  private previousActionItems: ActionItem[] | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.state = ctx.storage.kv.get<RetroState>("state") ?? null;
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private get team() {
    return this.env.TEAM.getByName("team");
  }

  private save(state: RetroState) {
    this.state = state;
    this.ctx.storage.kv.put("state", state);
  }

  private summary(s: RetroState): RetroSummary {
    return { id: s.id, title: s.title, phase: s.phase, facilitator: s.facilitator, createdAt: s.createdAt, createdBy: s.createdBy };
  }

  async init(args: { id: string; title: string; columns: Column[]; settings?: Partial<Settings>; createdBy: string }): Promise<RetroSummary> {
    if (this.state) throw new Error("retro already exists");
    const state = createRetro({ ...args, now: Date.now() });
    this.save(state);
    const summary = this.summary(state);
    await this.team.upsertRetro(summary);
    return summary;
  }

  async view(viewer: string): Promise<RetroView | null> {
    if (!this.state) return null;
    await this.loadActionItems();
    return this.viewFor(this.state, viewer);
  }

  async destroy(actor: string): Promise<"ok" | "not-found" | "forbidden"> {
    if (!this.state) return "not-found";
    if (this.state.facilitator !== actor) return "forbidden";
    const id = this.state.id;
    for (const ws of this.ctx.getWebSockets()) ws.close(4404, "retro deleted");
    this.state = null;
    this.ctx.storage.kv.delete("state");
    await this.team.deleteRetro(id);
    return "ok";
  }

  /** Called when action items change outside this room (the dashboard). */
  async actionItemsChanged(): Promise<void> {
    this.actionItems = null;
    this.previousActionItems = null;
    await this.broadcast();
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.state) return new Response("retro not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const email = request.headers.get(IDENTITY_HEADERS.email);
    if (!email) return new Response("unauthenticated", { status: 401 });
    const name = request.headers.get(IDENTITY_HEADERS.name) ?? email;

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ email } satisfies SocketAttachment);

    const state = structuredClone(this.state);
    state.participants[email] = { name };
    if (email === state.facilitator) state.facilitatorLastSeenAt = Date.now();
    this.save(state);

    await this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const { email } = ws.deserializeAttachment() as SocketAttachment;
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.send(ws, { type: "rejected", requestId: "", reason: "invalid message" });
    }
    const requestId = String(message?.requestId ?? "");
    if (!this.state) return this.send(ws, { type: "rejected", requestId, reason: "retro not found" });
    if (typeof message?.command?.type !== "string") return this.send(ws, { type: "rejected", requestId, reason: "invalid command" });

    const before = this.state;
    const result = applyCommand(before, message.command, {
      actor: email,
      now: Date.now(),
      online: this.online(),
      newId: () => crypto.randomUUID(),
    });
    if (!result.ok) return this.send(ws, { type: "rejected", requestId, reason: result.reason });

    // Persist before any awaits so concurrent commands always see the latest state.
    this.save(result.state);
    try {
      await this.runEffects(result.effects, email);
    } catch (e) {
      return this.send(ws, { type: "rejected", requestId, reason: e instanceof Error ? e.message : "failed" });
    }
    const after = this.summary(result.state);
    if (JSON.stringify(after) !== JSON.stringify(this.summary(before))) await this.team.upsertRetro(after);

    this.send(ws, { type: "ack", requestId });
    await this.broadcast();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
    await this.onDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onDisconnect(ws);
  }

  private async onDisconnect(ws: WebSocket) {
    if (!this.state) return;
    const { email } = ws.deserializeAttachment() as SocketAttachment;
    if (email === this.state.facilitator) this.save({ ...this.state, facilitatorLastSeenAt: Date.now() });
    await this.broadcast(ws);
  }

  private async runEffects(effects: Effect[], actor: string) {
    if (effects.length === 0 || !this.state) return;
    for (const effect of effects) {
      if (effect.type === "createActionItem") {
        await this.team.createActionItem({
          retroId: this.state.id,
          topicId: effect.topicId,
          description: effect.description,
          owner: effect.owner,
          dueDate: effect.dueDate,
          createdBy: actor,
        });
      } else {
        const updated = await this.team.updateActionItem(effect.id, effect.patch);
        if (!updated) throw new Error("action item not found");
        if (updated.retroId !== this.state.id) {
          // Keep the room that owns the item in sync too.
          await this.env.RETRO_ROOM.getByName(updated.retroId).actionItemsChanged();
        }
      }
    }
    this.actionItems = null;
    this.previousActionItems = null;
  }

  private async loadActionItems() {
    if (!this.state) return;
    if (this.actionItems === null) this.actionItems = await this.team.listActionItems({ retroId: this.state.id });
    if (this.previousActionItems === null) {
      this.previousActionItems = await this.team.listActionItems({ excludeRetroId: this.state.id, openOnly: true });
    }
  }

  private sockets(excluding?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== excluding && ws.readyState === WebSocket.OPEN);
  }

  private online(excluding?: WebSocket): Set<string> {
    return new Set(this.sockets(excluding).map((ws) => (ws.deserializeAttachment() as SocketAttachment).email));
  }

  private viewFor(state: RetroState, viewer: string, online = this.online()): RetroView {
    return projectView(state, viewer, online, this.actionItems ?? [], this.previousActionItems ?? []);
  }

  private async broadcast(excluding?: WebSocket) {
    if (!this.state) return;
    await this.loadActionItems();
    const state = this.state;
    const online = this.online(excluding);
    for (const ws of this.sockets(excluding)) {
      const { email } = ws.deserializeAttachment() as SocketAttachment;
      this.send(ws, { type: "view", view: this.viewFor(state, email, online) });
    }
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket already gone; presence catches up on close.
    }
  }
}
