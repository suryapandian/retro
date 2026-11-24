# Retro

A lightweight, internal-only retrospective app in the spirit of Retrium: private brainstorming, anonymous cards, grouping, dot voting, facilitated discussion and action items that carry over between retros. See [SPEC.md](./SPEC.md) for the full spec.

## Tech Stack

- **Frontend:** TypeScript + React + Vite + Tailwind CSS, on Cloudflare Pages (`retro-truelayer.pages.dev`)
- **API gateway:** a Pages Function under `/api/*` that verifies the Cloudflare Access JWT and forwards to the worker over a service binding
- **Backend:** `retro-worker`, a TypeScript Cloudflare Worker with two SQLite-backed Durable Objects:
  - `RetroRoom`: one per retro; live state over WebSockets (hibernation API)
  - `Team`: a single instance holding the retro index, action items and display names
- **Auth:** Cloudflare Access (Zero Trust). The worker has no public URL.
- **Cost:** Workers Free plan + Zero Trust Free plan (up to 50 users)

```
browser ──▶ retro-truelayer.pages.dev (Access) ──▶ Pages Function /api/* ──service binding──▶ retro-worker ──▶ RetroRoom / Team DOs
```

## Local development

Prerequisites: Node.js 24+, [just](https://github.com/casey/just), tmux.

```bash
just install
just dev        # worker :8787, Pages Function :8788, Vite :5173
```

Open http://localhost:5173. Locally there is no Access: you're identified by a cookie (`DEV_IDENTITY=true` in `frontend/.dev.vars`). To be someone else, visit `http://localhost:5173/api/dev/login?as=bob@example.com`. Use a second browser profile to act as two people at once.

```bash
just test       # worker integration tests + Pages Function tests
just kill       # stop the dev session
```

## Testing

- `worker/test`: integration tests through the worker's public interface (HTTP API + WebSocket protocol), run inside the Workers runtime with `@cloudflare/vitest-plugin`. Tests act as several members and assert on what each member sees.
- `frontend/server/forward.test.ts`: the Pages Function's authentication and identity-forwarding rules.

## Deployment

CI (`.github/workflows/ci.yml`) typechecks, lints, tests and builds both packages. On push to `main` it deploys the worker and then Pages. `just deploy` does the same from a laptop.

### One-off setup

1. **GitHub secrets:** add `CLOUDFLARE_API_TOKEN` (the *Edit Cloudflare Workers* template, or a custom token with *Workers Scripts: Edit* and *Cloudflare Pages: Edit*) and `CLOUDFLARE_ACCOUNT_ID` to the repo.
2. **Deploy the worker first:** `cd worker && npx wrangler deploy`. It has no public URL (`workers_dev: false`).
3. **Create the Pages project:** `cd frontend && npx wrangler pages project create retro-truelayer --production-branch main`. The service binding to `retro-worker` comes from `frontend/wrangler.jsonc`.
4. **Protect it with Cloudflare Access** (Zero Trust dashboard → Access → Applications → Add → Self-hosted):
   - Domains: `retro-truelayer.pages.dev` and `*.retro-truelayer.pages.dev` (preview deployments).
   - Policy: *Allow*, include *Emails ending in* your company domain (or a specific group from your identity provider). One-time PIN login works if there is no identity provider.
   - Copy the application's **Audience (AUD) tag**, and your **team domain** (`<team>.cloudflareaccess.com`, under Settings → Custom pages / Team domain).
5. **Fill in `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`** in `frontend/wrangler.jsonc` (they're not secrets), commit, and deploy. Until these are set, the API refuses all requests (it fails closed).
