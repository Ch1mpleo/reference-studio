import {
  assertExpectedRevision,
  createId,
  createProjectRequestSchema,
  mutationScope,
  parseContract,
  projectSchema,
  ServiceError,
  updateProjectRequestSchema,
  type Project,
} from "@reference-studio/core";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { headerValue, requireCaller } from "./access.js";
import { publishChange } from "./changes.js";
import type { EventHub } from "./events.js";
import { commitMutation, hashCanonicalRequest, readIdempotencyKey } from "./idempotency.js";

type ProjectRow = {
  id: string;
  name: string;
  brief: string;
  audience: string;
  purpose: string;
  constraints: string;
  status: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export function registerProjectRoutes(
  app: FastifyInstance,
  database: DatabaseSync,
  hub: EventHub,
): void {
  app.get("/api/projects", async () => ({ projects: listProjects(database) }));

  app.post("/api/projects", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const key = readIdempotencyKey(request.headers["idempotency-key"]);
    const input = parseContract(createProjectRequestSchema, request.body, "Project is invalid.");
    const outcome = commitMutation(database, {
      scope: mutationScope(caller, "project.create"),
      key,
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const project = insertProject(database, input);
        return { statusCode: 201, body: project, revision: project.revision, changed: true };
      },
    });
    publishOutcome(hub, outcome);
    return reply.code(outcome.statusCode).send(outcome.body);
  });

  app.get("/api/projects/:id", async (request) => {
    const params = request.params as { id?: string };
    return getProject(database, params.id ?? "");
  });

  app.patch("/api/projects/:id", async (request, reply) => {
    requireJson(request);
    const caller = requireCaller(request);
    const params = request.params as { id?: string };
    const id = params.id ?? "";
    const key = readIdempotencyKey(request.headers["idempotency-key"]);
    const input = parseContract(updateProjectRequestSchema, request.body, "Project update is invalid.");
    const outcome = commitMutation(database, {
      scope: mutationScope(caller, "project.update", id),
      key,
      requestHash: hashCanonicalRequest(input),
      execute: () => {
        const project = updateProject(database, id, input);
        const changed = project.revision !== input.expectedRevision;
        return { statusCode: 200, body: project, revision: project.revision, changed };
      },
    });
    publishOutcome(hub, outcome);
    return reply.code(outcome.statusCode).send(outcome.body);
  });
}

function requireJson(request: FastifyRequest): void {
  const mediaType = headerValue(request.headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ServiceError("unsupported_media", "Send project changes as application/json.");
  }
}

function publishOutcome(hub: EventHub, outcome: { body: unknown; changed: boolean; replayed: boolean }): void {
  if (!outcome.changed || outcome.replayed) {
    return;
  }
  const project = projectSchema.parse(outcome.body);
  publishChange(hub, {
    entity: "project",
    entityId: project.id,
    projectId: project.id,
    revision: project.revision,
  });
}

export function listProjects(database: DatabaseSync): Project[] {
  const rows = database
    .prepare(
      `SELECT id, name, brief, audience, purpose, constraints, status, revision, created_at, updated_at
       FROM projects ORDER BY updated_at DESC, id ASC`,
    )
    .all();
  return rows.map((row) => projectFromRow(row));
}

export function getProject(database: DatabaseSync, id: string): Project {
  const row = database
    .prepare(
      `SELECT id, name, brief, audience, purpose, constraints, status, revision, created_at, updated_at
       FROM projects WHERE id = ?`,
    )
    .get(id);
  if (row === undefined) {
    throw new ServiceError("not_found", "Project was not found.");
  }
  return projectFromRow(row);
}

function insertProject(
  database: DatabaseSync,
  input: {
    name: string;
    brief: string;
    audience: string;
    purpose: string;
    constraints: string;
  },
): Project {
  const now = new Date().toISOString();
  const project = projectSchema.parse({
    id: createId(),
    name: input.name,
    brief: input.brief,
    audience: input.audience,
    purpose: input.purpose,
    constraints: input.constraints,
    status: "active",
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  database
    .prepare(
      `INSERT INTO projects (
        id, name, brief, audience, purpose, constraints, status, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      project.id,
      project.name,
      project.brief,
      project.audience,
      project.purpose,
      project.constraints,
      project.status,
      project.revision,
      project.createdAt,
      project.updatedAt,
    );
  return project;
}

function updateProject(
  database: DatabaseSync,
  id: string,
  input: {
    expectedRevision: number;
    name?: string;
    brief?: string;
    audience?: string;
    purpose?: string;
    constraints?: string;
    status?: "active" | "archived";
  },
): Project {
  const current = findProjectRow(database, id);
  if (current === undefined) {
    throw new ServiceError("not_found", "Project was not found.");
  }
  assertExpectedRevision(current.revision, input.expectedRevision, { type: "project", id });
  const next = projectSchema.parse({
    id: current.id,
    name: input.name ?? current.name,
    brief: input.brief ?? current.brief,
    audience: input.audience ?? current.audience,
    purpose: input.purpose ?? current.purpose,
    constraints: input.constraints ?? current.constraints,
    status: input.status ?? current.status,
    revision: current.revision + 1,
    createdAt: current.created_at,
    updatedAt: new Date().toISOString(),
  });
  const unchanged =
    next.name === current.name &&
    next.brief === current.brief &&
    next.audience === current.audience &&
    next.purpose === current.purpose &&
    next.constraints === current.constraints &&
    next.status === current.status;
  if (unchanged) {
    return projectFromRow(current);
  }
  const result = database
    .prepare(
      `UPDATE projects
       SET name = ?, brief = ?, audience = ?, purpose = ?, constraints = ?, status = ?, revision = ?, updated_at = ?
       WHERE id = ? AND revision = ?`,
    )
    .run(
      next.name,
      next.brief,
      next.audience,
      next.purpose,
      next.constraints,
      next.status,
      next.revision,
      next.updatedAt,
      id,
      current.revision,
    );
  if (result.changes !== 1) {
    const raced = findProjectRow(database, id);
    if (raced === undefined) {
      throw new ServiceError("not_found", "Project was not found.");
    }
    assertExpectedRevision(raced.revision, input.expectedRevision, { type: "project", id });
    throw new ServiceError("conflict", "The record changed since it was loaded.", {
      currentRevision: raced.revision,
      expectedRevision: input.expectedRevision,
      recordType: "project",
      recordId: id,
    });
  }
  return next;
}

function findProjectRow(database: DatabaseSync, id: string): ProjectRow | undefined {
  const row = database
    .prepare(
      `SELECT id, name, brief, audience, purpose, constraints, status, revision, created_at, updated_at
       FROM projects WHERE id = ?`,
    )
    .get(id);
  if (row === undefined) {
    return undefined;
  }
  if (!isProjectRow(row)) {
    throw new Error("Project row is missing required columns.");
  }
  return row;
}

function projectFromRow(row: unknown): Project {
  if (!isProjectRow(row)) {
    throw new Error("Project row is missing required columns.");
  }
  const parsed = projectSchema.safeParse({
    id: row.id,
    name: row.name,
    brief: row.brief,
    audience: row.audience,
    purpose: row.purpose,
    constraints: row.constraints,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) {
    throw new Error("Stored project is invalid.");
  }
  return parsed.data;
}

function isProjectRow(value: unknown): value is ProjectRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.brief === "string" &&
    typeof row.audience === "string" &&
    typeof row.purpose === "string" &&
    typeof row.constraints === "string" &&
    typeof row.status === "string" &&
    typeof row.revision === "number" &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
}
