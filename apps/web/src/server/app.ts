import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import {
  CONTRACT_VERSION,
  healthResponse,
  readyEvent,
  ServiceError,
  serviceErrorBody,
  type StudioEvent,
} from "@reference-studio/core";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bearerMatches } from "./auth.js";
import type { AppConfig } from "./config.js";
import { EventHub } from "./events.js";
import { defaultMigrationsDir, migrate } from "./migrate.js";

export type AppDependencies = {
  config: AppConfig;
  database: DatabaseSync;
  hub?: EventHub;
  migrationsDir?: string;
};

export async function createApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const hub = dependencies.hub ?? new EventHub();
  const app = Fastify({
    logger: {
      level: dependencies.config.logLevel,
      stream: process.stderr,
    },
  });

  migrate(dependencies.database, dependencies.migrationsDir ?? defaultMigrationsDir());

  const streams = new Set<EventStream>();
  app.addHook("preClose", async () => {
    const openStreams = [...streams];
    streams.clear();
    for (const stream of openStreams) {
      stream.close();
    }
  });

  app.addHook("onRequest", async (request) => {
    const host = request.headers.host;
    if (host !== undefined && !dependencies.config.allowedHosts.includes(host)) {
      throw new ServiceError("forbidden_origin", "Host is not allowed.");
    }

    const origin = request.headers.origin;
    if (typeof origin === "string" && !dependencies.config.allowedOrigins.includes(origin)) {
      throw new ServiceError("forbidden_origin", "Origin is not allowed.");
    }

    const authorization = request.headers.authorization;
    if (
      authorization !== undefined &&
      !bearerMatches(authorization, dependencies.config.token)
    ) {
      throw new ServiceError("unauthorized", "Invalid local token.");
    }
  });

  app.get("/api/health", async () => healthResponse());

  app.get("/api/events", (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    const send = (event: StudioEvent) => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    };

    send(readyEvent());
    const unsubscribe = hub.subscribe(send);
    const keepalive = setInterval(() => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write(": keepalive\n\n");
      }
    }, 15_000);

    let closed = false;
    const stream: EventStream = {
      close() {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        streams.delete(stream);
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
        if (!reply.raw.destroyed) {
          reply.raw.destroy();
        }
      },
    };
    streams.add(stream);
    request.raw.on("close", () => {
      stream.close();
    });
  });

  if (dependencies.config.serveClient) {
    const clientDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../dist/client",
    );
    await app.register(fastifyStatic, { root: clientDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api")) {
        return reply
          .code(404)
          .send(serviceErrorBody(new ServiceError("not_found", "Not found.")));
      }
      return reply.sendFile("index.html");
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ServiceError) {
      return reply.code(error.status).send(serviceErrorBody(error));
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({
      error: {
        code: "internal",
        message: "Internal error",
      },
    });
  });

  return app;
}

export function publishChange(hub: EventHub): void {
  hub.publish({ type: "changed", contractVersion: CONTRACT_VERSION });
}

type EventStream = {
  close: () => void;
};
