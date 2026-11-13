import type { FastifyInstance } from "fastify";

const LOOPBACK_HOST = "127.0.0.1:4317";

function sessionCookie(setCookie: string | string[] | number | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const pair = typeof value === "string" ? value.split(";")[0] : undefined;
  if (pair === undefined || !pair.startsWith("rs_session=")) throw new Error("Expected a browser session cookie.");
  return pair;
}

/** Headers of a trusted browser session for `app.inject`; add `content-type` and `idempotency-key` per request. */
export async function browserHeaders(app: Pick<FastifyInstance, "inject">): Promise<Record<string, string>> {
  const origin = `http://${LOOPBACK_HOST}`;
  const response = await app.inject({ method: "GET", url: "/api/session", headers: { host: LOOPBACK_HOST, origin, "sec-fetch-site": "same-origin" } });
  if (response.statusCode !== 200) throw new Error(`Browser session bootstrap failed with ${response.statusCode}.`);
  return { host: LOOPBACK_HOST, origin, "sec-fetch-site": "same-origin", cookie: sessionCookie(response.headers["set-cookie"]) };
}

/** A fetch bound to a real service as a browser session; the bearer token is never sent. */
export async function browserFetch(baseUrl: string): Promise<(route: string, init?: RequestInit) => Promise<Response>> {
  const origin = new URL(baseUrl).origin;
  const bootstrap = await fetch(`${baseUrl}/api/session`, { headers: { origin, "sec-fetch-site": "same-origin" } });
  if (!bootstrap.ok) throw new Error(`Browser session bootstrap failed with ${bootstrap.status}.`);
  const cookie = sessionCookie(bootstrap.headers.getSetCookie()[0]);
  return (route, init = {}) => fetch(`${baseUrl}${route}`, { ...init, headers: { origin, "sec-fetch-site": "same-origin", cookie, ...init.headers } });
}
