import { describe, expect, it } from "vitest";
import { forwardApi, type ForwardEnv } from "./forward";

function setup(overrides: Partial<ForwardEnv> = {}) {
  const forwarded: Request[] = [];
  const env: ForwardEnv = {
    RETRO_WORKER: {
      fetch: async (r) => {
        forwarded.push(r);
        return new Response("ok");
      },
    },
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ...overrides,
  };
  return { env, forwarded };
}

const verifyAs = (email: string | null) => async () => email;

describe("forwardApi", () => {
  it("rejects requests without an Access JWT", async () => {
    const { env, forwarded } = setup();
    const res = await forwardApi(new Request("https://retro-truelayer.pages.dev/api/retros"), env, verifyAs("a@x.test"));
    expect(res.status).toBe(401);
    expect(forwarded).toHaveLength(0);
  });

  it("rejects requests whose JWT fails verification", async () => {
    const { env, forwarded } = setup();
    const req = new Request("https://retro-truelayer.pages.dev/api/retros", { headers: { "Cf-Access-Jwt-Assertion": "bad" } });
    expect((await forwardApi(req, env, verifyAs(null))).status).toBe(401);
    expect(forwarded).toHaveLength(0);
  });

  it("fails closed when Access isn't configured", async () => {
    const { env } = setup({ ACCESS_AUD: undefined });
    const req = new Request("https://retro-truelayer.pages.dev/api/retros", { headers: { "Cf-Access-Jwt-Assertion": "t" } });
    expect((await forwardApi(req, env, verifyAs("a@x.test"))).status).toBe(500);
  });

  it("forwards with the verified identity, overwriting any client-supplied one", async () => {
    const { env, forwarded } = setup();
    const req = new Request("https://retro-truelayer.pages.dev/api/retros", {
      headers: { "Cf-Access-Jwt-Assertion": "t", "X-Retro-User-Email": "mallory@x.test", "X-Retro-User-Name": "Boss" },
    });
    expect((await forwardApi(req, env, verifyAs("Alice@X.test"))).status).toBe(200);
    expect(forwarded[0].headers.get("X-Retro-User-Email")).toBe("alice@x.test");
    expect(forwarded[0].headers.get("X-Retro-User-Name")).toBeNull();
  });

  it("accepts the CF_Authorization cookie", async () => {
    const { env, forwarded } = setup();
    const req = new Request("https://retro-truelayer.pages.dev/api/me", { headers: { Cookie: "CF_Authorization=t" } });
    await forwardApi(req, env, verifyAs("a@x.test"));
    expect(forwarded[0].headers.get("X-Retro-User-Email")).toBe("a@x.test");
  });

  it("ignores the dev identity cookie unless dev mode is on", async () => {
    const { env, forwarded } = setup();
    const req = new Request("https://retro-truelayer.pages.dev/api/me", { headers: { Cookie: "retro_dev_user=mallory@x.test" } });
    expect((await forwardApi(req, env, verifyAs("a@x.test"))).status).toBe(401);
    expect(forwarded).toHaveLength(0);
  });

  it("uses the dev cookie in dev mode", async () => {
    const { env, forwarded } = setup({ DEV_IDENTITY: "true", ACCESS_AUD: undefined });
    const req = new Request("http://localhost/api/me", { headers: { Cookie: "retro_dev_user=bob%40x.test" } });
    await forwardApi(req, env);
    expect(forwarded[0].headers.get("X-Retro-User-Email")).toBe("bob@x.test");
  });
});
