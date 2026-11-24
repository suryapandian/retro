import { checkActionItemPatch, validateRetroInput } from "./domain/reducer";
import { TEMPLATES } from "./domain/templates";
import type { Column, Settings } from "./domain/types";
import { IDENTITY_HEADERS } from "./retro-room";

export { RetroRoom } from "./retro-room";
export { Team } from "./team";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (status: number, message: string) => json({ error: message }, status);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The worker is only reachable through the Pages Function's service binding, which
 * verifies the Cloudflare Access JWT and sets the identity header. It is trusted here.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const email = request.headers.get(IDENTITY_HEADERS.email)?.trim().toLowerCase();
    if (!email) return error(401, "unauthenticated");

    const team = env.TEAM.getByName("team");
    const room = (id: string) => env.RETRO_ROOM.getByName(id);
    const segments = path.split("/").filter(Boolean);
    if (segments[0] !== "api") return error(404, "not found");
    const [, resource, id, sub] = segments;
    const method = request.method;

    if (resource === "me" && !id) {
      if (method === "GET") return json(await team.getMember(email));
      if (method === "PUT") {
        const body = await readJson(request);
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 50) return error(400, "invalid name");
        return json(await team.setDisplayName(email, name));
      }
    }

    if (resource === "templates" && !id && method === "GET") return json(TEMPLATES);

    if (resource === "members" && !id && method === "GET") return json(await team.listMembers());

    if (resource === "retros") {
      if (!id && method === "GET") return json(await team.listRetros());
      if (!id && method === "POST") {
        const body = await readJson(request);
        if (!body) return error(400, "invalid body");
        const template = TEMPLATES.find((t) => t.id === body.templateId);
        const columns = (body.columns as Column[] | undefined) ?? template?.columns;
        const invalid = validateRetroInput(body.title, columns, body.settings);
        if (invalid) return error(400, invalid);
        const retroId = crypto.randomUUID();
        const summary = await room(retroId).init({
          id: retroId,
          title: (body.title as string).trim(),
          columns: columns!.map((c) => ({ id: c.id, title: c.title.trim(), ...(c.prompt ? { prompt: c.prompt } : {}) })),
          settings: body.settings as Partial<Settings> | undefined,
          createdBy: email,
        });
        return json(summary, 201);
      }
      if (id && !sub && method === "GET") {
        const view = await room(id).view(email);
        return view ? json(view) : error(404, "retro not found");
      }
      if (id && !sub && method === "DELETE") {
        const result = await room(id).destroy(email);
        if (result === "not-found") return error(404, "retro not found");
        if (result === "forbidden") return error(403, "only the facilitator can delete a retro");
        return new Response(null, { status: 204 });
      }
      if (id && sub === "ws" && method === "GET") {
        const member = await team.getMember(email);
        const headers = new Headers(request.headers);
        headers.set(IDENTITY_HEADERS.email, email);
        headers.set(IDENTITY_HEADERS.name, member.name);
        return room(id).fetch(new Request(request, { headers }));
      }
    }

    if (resource === "action-items") {
      if (!id && method === "GET") {
        const owner = url.searchParams.get("owner");
        return json(
          await team.listActionItems({
            openOnly: url.searchParams.get("status") !== "all",
            owner: owner === "me" ? email : (owner ?? undefined),
          }),
        );
      }
      if (id && !sub && method === "PATCH") {
        const checked = checkActionItemPatch(await readJson(request));
        if (!checked.ok) return error(400, checked.reason);
        const updated = await team.updateActionItem(id, checked.patch);
        if (!updated) return error(404, "action item not found");
        await room(updated.retroId).actionItemsChanged();
        return json(updated);
      }
    }

    return error(404, "not found");
  },
} satisfies ExportedHandler<Env>;
