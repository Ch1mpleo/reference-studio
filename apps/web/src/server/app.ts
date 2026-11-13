import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import {
  backupTooLargeMessage,
  browserSessionResponseSchema,
  healthResponse,
  imageTooLargeMessage,
  MAX_BACKUP_BYTES,
  readyEvent,
  ServiceError,
  serviceErrorBody,
  UPLOAD_LIMIT_MAX,
  type StudioEvent,
} from "@reference-studio/core";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import {
  assertBrowserBootstrap,
  establishCaller,
  headerValue,
  isPublicRequest,
  rememberCaller,
} from "./access.js";
import type { AppConfig } from "./config.js";
import { EventHub } from "./events.js";
import { defaultMigrationsDir, migrate } from "./migrate.js";
import { registerBackupRoutes } from "./backup.js";
import { registerBoardRoutes } from "./boards.js";
import { registerBoardDraftRoutes } from "./boardDrafts.js";
import { registerSystemRoutes } from "./systems.js";
import { registerVariantRoutes } from "./variants.js";
import { registerProjectRoutes } from "./projects.js";
import { registerReferenceRoutes } from "./references.js";
import { registerReferenceImageRoutes } from "./referenceImages.js";
import { registerSettingsRoutes } from "./settings.js";
import { issueSessionCookie } from "./session.js";
import { incomingUploadsDir } from "./uploads.js";

export { publishChange } from "./changes.js";

/** Fixed JSON body ceiling; image uploads use a higher route bodyLimit. */
const JSON_BODY_LIMIT = 21 * 1024 * 1024;

export type AppDependencies = {
  config: AppConfig;
  database: DatabaseSync;
  hub?: EventHub;
  migrationsDir?: string;
};

export async function createApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const hub = dependencies.hub ?? new EventHub();
  const app = Fastify({
    bodyLimit: JSON_BODY_LIMIT,
    logger: {
      level: dependencies.config.logLevel,
      stream: process.stderr,
    },
  });
  await app.register(multipart, {
    throwFileSizeLimit: true,
    limits: {
      fileSize: MAX_BACKUP_BYTES,
      files: 1,
      fields: 8,
      fieldSize: 24_000,
      parts: 12,
    },
  });

  migrate(dependencies.database, dependencies.migrationsDir ?? defaultMigrationsDir());
  sweepIncomingUploads(dependencies.config.dataDir);

  const streams = new Set<EventStream>();
  app.addHook("preClose", async () => {
    const openStreams = [...streams];
    streams.clear();
    for (const stream of openStreams) {
      stream.close();
    }
  });

  app.addHook("onRequest", async (request) => {
    const host = headerValue(request.headers.host);
    if (host !== undefined && !dependencies.config.allowedHosts.includes(host)) {
      throw new ServiceError("forbidden_origin", "Host is not allowed.");
    }

    const origin = headerValue(request.headers.origin);
    if (origin !== undefined && !dependencies.config.allowedOrigins.includes(origin)) {
      throw new ServiceError("forbidden_origin", "Origin is not allowed.");
    }

    const caller = establishCaller(request, dependencies.config);
    rememberCaller(request, caller);
    if (!isPublicRequest(request.method, request.url) && caller === "anonymous") {
      throw new ServiceError("unauthorized", "Authentication is required.");
    }
  });

  app.get("/api/health", async () => healthResponse());

  app.get("/api/session", async (request, reply) => {
    assertBrowserBootstrap(headerValue(request.headers["sec-fetch-site"]));
    reply.header("cache-control", "no-store");
    reply.header("set-cookie", issueSessionCookie(dependencies.config.sessionKey));
    return browserSessionResponseSchema.parse({ ok: true });
  });

  registerProjectRoutes(app, dependencies.database, hub);
  registerReferenceRoutes(app, dependencies.database, dependencies.config.dataDir, hub);
  registerReferenceImageRoutes(app, dependencies.database, dependencies.config.dataDir);
  registerBackupRoutes(app, dependencies.database, dependencies.config.dataDir, hub);
  registerBoardRoutes(app, dependencies.database, hub);
  registerBoardDraftRoutes(app, dependencies.database, hub);
  registerSystemRoutes(app, dependencies.database, hub);
  registerVariantRoutes(app, dependencies.database, hub);
  registerSettingsRoutes(app, dependencies.database);

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
    const transport = transportError(error, request.url);
    if (transport !== undefined) {
      return reply.code(transport.status).send(transport.body);
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

function transportError(
  error: unknown,
  url: string,
): { status: number; body: ReturnType<typeof serviceErrorBody> } | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  if (error.code === "FST_ERR_CTP_INVALID_JSON_BODY" || error.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
    return {
      status: 400,
      body: serviceErrorBody(new ServiceError("validation", "Request body must be valid JSON.")),
    };
  }
  if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
    return {
      status: 415,
      body: serviceErrorBody(new ServiceError("unsupported_media", "Unsupported media type.")),
    };
  }
  const pathOnly = url.split("?")[0] ?? url;
  const restore = pathOnly === "/api/projects/restore";
  const imageUpload = /\/api\/projects\/[^/]+\/references\/images$/.test(pathOnly);
  if (error.code === "FST_REQ_FILE_TOO_LARGE" || error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    return {
      status: 400,
      body: serviceErrorBody(
        new ServiceError(
          "validation",
          restore
            ? backupTooLargeMessage()
            : imageUpload
              ? imageTooLargeMessage(UPLOAD_LIMIT_MAX)
              : "Request body is too large.",
        ),
      ),
    };
  }
  if (error.code === "FST_FILES_LIMIT") {
    return {
      status: 400,
      body: serviceErrorBody(new ServiceError("validation", restore ? "Send one backup." : "Send one image.")),
    };
  }
  if (error.code === "FST_FIELDS_LIMIT" || error.code === "FST_PARTS_LIMIT") {
    return {
      status: 400,
      body: serviceErrorBody(new ServiceError("validation", "That upload has too many fields.")),
    };
  }
  if (error.code === "FST_INVALID_MULTIPART_CONTENT_TYPE") {
    return {
      status: 415,
      body: serviceErrorBody(new ServiceError("unsupported_media", "Send the image as multipart form data.")),
    };
  }
  return undefined;
}

type EventStream = {
  close: () => void;
};

const INCOMING_PART_MAX_AGE_MS = 60 * 60 * 1000;

export function sweepIncomingUploads(dataDir: string, now = Date.now()): string[] {
  const directory = incomingUploadsDir(dataDir);
  try {
    mkdirSync(directory, { recursive: true });
  } catch {
    return [];
  }
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  const removed: string[] = [];
  const cutoff = now - INCOMING_PART_MAX_AGE_MS;
  for (const name of names) {
    if (!name.endsWith(".part")) {
      continue;
    }
    const absolute = path.join(directory, name);
    try {
      const age = statSync(absolute).mtimeMs;
      if (age < cutoff) {
        unlinkSync(absolute);
        removed.push(name);
      }
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
        // Ignore per-entry failures so startup never crashes on a stale .part.
      }
    }
  }
  return removed;
}
