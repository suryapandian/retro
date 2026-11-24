import { exports } from "cloudflare:workers";
import { vi } from "vitest";
import type { Command, RetroView, ServerMessage } from "../src/domain/types";

const BASE = "https://retro.test";

export function api(email: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Retro-User-Email", email);
  if (init.body) headers.set("Content-Type", "application/json");
  return exports.default.fetch(new Request(`${BASE}${path}`, { ...init, headers }));
}

export async function createRetro(email: string, body: Record<string, unknown> = {}) {
  const res = await api(email, "/api/retros", {
    method: "POST",
    body: JSON.stringify({ title: "Sprint 1", templateId: "went-well", ...body }),
  });
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

export type Result = { ok: true } | { ok: false; reason: string };

export interface Client {
  email: string;
  ws: WebSocket;
  /** Latest view received. */
  readonly view: RetroView;
  views: RetroView[];
  /** Sends a command and resolves once acked/rejected and the resulting view has arrived. */
  send(command: Command): Promise<Result>;
  /** Sends a command and fails the test if it is rejected. */
  do(command: Command): Promise<void>;
  close(): void;
}

let counter = 0;

export async function connect(email: string, retroId: string): Promise<Client> {
  const res = await api(email, `/api/retros/${retroId}/ws`, { headers: { Upgrade: "websocket" } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected websocket, got ${res.status} ${await res.text()}`);
  ws.accept();

  const views: RetroView[] = [];
  const pending = new Map<string, { result?: Result; viewsAtAck?: number; resolve: (r: Result) => void }>();

  const settle = () => {
    for (const [id, p] of pending) {
      if (p.result && views.length > p.viewsAtAck!) {
        pending.delete(id);
        p.resolve(p.result);
      } else if (p.result && !p.result.ok) {
        // Rejections don't trigger a broadcast.
        pending.delete(id);
        p.resolve(p.result);
      }
    }
  };

  ws.addEventListener("message", (event) => {
    if (event.data === "pong") return;
    const msg = JSON.parse(event.data as string) as ServerMessage;
    if (msg.type === "view") views.push(msg.view);
    else {
      const p = pending.get(msg.requestId);
      if (p) {
        p.result = msg.type === "ack" ? { ok: true } : { ok: false, reason: msg.reason };
        p.viewsAtAck = views.length;
      }
    }
    settle();
  });

  const client: Client = {
    email,
    ws,
    views,
    get view() {
      const v = views.at(-1);
      if (!v) throw new Error(`${email} has no view yet`);
      return v;
    },
    send(command) {
      const requestId = `r${++counter}`;
      return new Promise<Result>((resolve) => {
        pending.set(requestId, { resolve });
        ws.send(JSON.stringify({ requestId, command }));
      });
    },
    async do(command) {
      const result = await client.send(command);
      if (!result.ok) throw new Error(`${command.type} rejected for ${email}: ${result.reason}`);
    },
    close() {
      ws.close(1000);
    },
  };
  await vi.waitFor(() => client.view);
  return client;
}

/** Waits until `fn` stops throwing, for assertions on other clients' broadcasts. */
export const eventually = <T>(fn: () => T) => vi.waitFor(fn, { timeout: 2000, interval: 10 });

/** Creates a retro facilitated by `facilitator`, connects everyone, and returns the clients. */
export async function retroWith(facilitator: string, ...others: string[]) {
  const { id } = await createRetro(facilitator);
  const clients = [await connect(facilitator, id)];
  for (const email of others) clients.push(await connect(email, id));
  await eventually(() => {
    for (const c of clients) if (c.view.members.filter((m) => m.online).length !== clients.length) throw new Error("presence");
  });
  return { id, clients };
}

export async function advanceTo(facilitator: Client, phase: RetroView["phase"]) {
  while (facilitator.view.phase !== phase) await facilitator.do({ type: "advancePhase" });
}
