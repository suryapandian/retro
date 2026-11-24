import { createRemoteJWKSet, jwtVerify } from "jose";

export interface ForwardEnv {
  RETRO_WORKER: { fetch(request: Request): Promise<Response> };
  // Cloudflare Access team domain, e.g. "myteam.cloudflareaccess.com".
  ACCESS_TEAM_DOMAIN?: string;
  // Audience (AUD) tag of the Access application.
  ACCESS_AUD?: string;
  // Local development only (set in .dev.vars): identify users by a cookie instead of Access.
  DEV_IDENTITY?: string;
}

export const IDENTITY_HEADERS = ["X-Retro-User-Email", "X-Retro-User-Name"] as const;
const DEV_COOKIE = "retro_dev_user";

export type VerifyAccessJwt = (token: string, env: ForwardEnv) => Promise<string | null>;

const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const verifyAccessJwt: VerifyAccessJwt = async (token, env) => {
  const domain = env.ACCESS_TEAM_DOMAIN!;
  let jwks = jwksByDomain.get(domain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`));
    jwksByDomain.set(domain, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${domain}`, audience: env.ACCESS_AUD });
    if (typeof payload.email !== "string") console.warn("Access JWT has no email claim");
    return typeof payload.email === "string" ? payload.email : null;
  } catch (e) {
    const err = e as { code?: string; claim?: string; message?: string };
    console.warn(`Access JWT rejected: ${err.code ?? "error"} ${err.claim ?? ""} ${err.message ?? ""}`);
    return null;
  }
};

function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

const unauthorized = () => Response.json({ error: "unauthenticated" }, { status: 401 });

/**
 * Authenticates the caller and forwards the request (including WebSocket upgrades)
 * to retro-worker with a trusted identity header. Anything the client sent in the
 * identity headers is discarded.
 */
export async function forwardApi(request: Request, env: ForwardEnv, verify: VerifyAccessJwt = verifyAccessJwt): Promise<Response> {
  let email: string | null;

  if (env.DEV_IDENTITY === "true") {
    const url = new URL(request.url);
    if (url.pathname === "/api/dev/login") {
      const as = url.searchParams.get("as")?.trim();
      if (!as) return new Response("pass ?as=<email>", { status: 400 });
      return new Response(null, {
        status: 302,
        headers: { Location: "/", "Set-Cookie": `${DEV_COOKIE}=${encodeURIComponent(as)}; Path=/; SameSite=Lax` },
      });
    }
    email = cookie(request, DEV_COOKIE) ?? "dev@localhost";
  } else {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return Response.json({ error: "Cloudflare Access is not configured" }, { status: 500 });
    }
    const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? cookie(request, "CF_Authorization");
    if (!token) {
      console.warn("No Access JWT on request");
      return unauthorized();
    }
    email = await verify(token, env);
    if (!email) return unauthorized();
  }

  const headers = new Headers(request.headers);
  for (const h of IDENTITY_HEADERS) headers.delete(h);
  headers.set(IDENTITY_HEADERS[0], email.toLowerCase());
  return env.RETRO_WORKER.fetch(new Request(request, { headers }));
}
