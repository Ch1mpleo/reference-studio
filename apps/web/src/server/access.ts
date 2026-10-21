import { ServiceError } from "@reference-studio/core";
import type { FastifyRequest } from "fastify";
import { bearerMatches } from "./auth.js";
import type { AppConfig } from "./config.js";
import { hasValidSessionCookie } from "./session.js";

/**
 * Browser and agent callers are authorized separately.
 *
 * - Agents send `Authorization: Bearer <auth-token>`. The token stays in the
 *   data directory and is never placed in a browser bundle, cookie, or URL.
 * - Browsers obtain an HttpOnly `rs_session` cookie from `GET /api/session`.
 *   Bootstrap and later browser calls must carry Fetch Metadata of
 *   `same-origin` or `none`. `cross-site` and `same-site` are rejected, so a
 *   page on another loopback port cannot reuse the cookie (cookies are not
 *   scoped to a port).
 * - Browser mutations also require an allowed `Origin`. Missing `Origin` is
 *   fine for safe browser reads. Agents may omit `Origin`.
 * - A presented bearer token that does not match is unauthorized even when a
 *   session cookie is also present.
 * - Health and session bootstrap are the only public API reads. Static files
 *   stay public so the workspace can load. Every other `/api` route,
 *   including events and assets, requires a browser session or agent token.
 * - Forging `Sec-Fetch-Site` is outside the browser threat model. Other local
 *   programs authenticate with the bearer token.
 */

export type RequestCaller = "anonymous" | "browser" | "agent";

const callers = new WeakMap<FastifyRequest, RequestCaller>();
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const BROWSER_SITES = new Set(["same-origin", "none"]);

export function establishCaller(request: FastifyRequest, config: AppConfig): RequestCaller {
  const authorization = headerValue(request.headers.authorization);
  if (authorization !== undefined) {
    if (!bearerMatches(authorization, config.token)) {
      throw new ServiceError("unauthorized", "Invalid local token.");
    }
    return "agent";
  }

  const site = headerValue(request.headers["sec-fetch-site"]);
  const cookieValid = hasValidSessionCookie(request.headers.cookie, config.sessionKey);
  if (!cookieValid) {
    return "anonymous";
  }
  if (site === undefined || !BROWSER_SITES.has(site)) {
    if (site === "cross-site" || site === "same-site") {
      throw new ServiceError("forbidden_origin", "Cross-site browser access is not allowed.");
    }
    return "anonymous";
  }
  if (!SAFE_METHODS.has(request.method) && headerValue(request.headers.origin) === undefined) {
    throw new ServiceError("unauthorized", "Browser changes require an allowed Origin.");
  }
  return "browser";
}

export function rememberCaller(request: FastifyRequest, caller: RequestCaller): void {
  callers.set(request, caller);
}

export function requireCaller(request: FastifyRequest): "browser" | "agent" {
  const caller = callers.get(request);
  if (caller === "browser" || caller === "agent") {
    return caller;
  }
  throw new ServiceError("unauthorized", "Authentication is required.");
}

export function isPublicRequest(method: string, url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (!path.startsWith("/api/")) {
    return true;
  }
  return method === "GET" && (path === "/api/health" || path === "/api/session");
}

export function assertBrowserBootstrap(site: string | undefined): void {
  if (site === "cross-site" || site === "same-site") {
    throw new ServiceError("forbidden_origin", "Cross-site session requests are not allowed.");
  }
  if (site !== "same-origin" && site !== "none") {
    throw new ServiceError("unauthorized", "A browser session requires same-origin fetch metadata.");
  }
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
