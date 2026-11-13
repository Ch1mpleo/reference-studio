import type { McpServer } from "@modelcontextprotocol/server";
import {
  MAX_REFERENCE_PAGE_LIMIT,
  REFERENCE_KINDS,
  REFERENCE_PAGE_LIMIT,
  boardSchema,
  projectListSchema,
  projectReferenceListSchema,
  projectSchema,
  referenceSearchResultSchema,
  type LibraryReference,
  type Project,
} from "@reference-studio/core";
import { z } from "zod";
import { buildProjectContext, projectContextSchema } from "./context.js";
import { failureResult } from "./failure.js";
import { connect, type ServiceClientOptions, type ServiceConnection } from "./serviceClient.js";

export const MAX_LISTED_PROJECTS = 100;

const projectSummary = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number(),
  updatedAt: z.string(),
});

const listProjectsOutput = z.object({
  projects: z.array(projectSummary),
  total: z.number(),
  truncated: z.boolean(),
});

const referenceSummary = z.object({
  id: z.string(),
  kind: z.enum(REFERENCE_KINDS),
  title: z.string(),
  source: z.object({ url: z.string().nullable(), creator: z.string().nullable() }),
  tags: z.array(z.string()),
  availability: z.string(),
  revision: z.number(),
  hasImage: z.boolean(),
});

const searchReferencesOutput = z.object({
  references: z.array(referenceSummary),
  nextCursor: z.string().nullable(),
});

export function summarizeProjects(projects: Project[]): z.infer<typeof listProjectsOutput> {
  const listed = projects.slice(0, MAX_LISTED_PROJECTS).map((project) => ({
    id: project.id,
    name: project.name,
    revision: project.revision,
    updatedAt: project.updatedAt,
  }));
  return { projects: listed, total: projects.length, truncated: projects.length > listed.length };
}

export function summarizeReference(reference: LibraryReference): z.infer<typeof referenceSummary> {
  return {
    id: reference.id,
    kind: reference.kind,
    title: reference.title,
    source: { url: reference.sourceUrl, creator: reference.creator },
    tags: reference.tags,
    availability: reference.availability,
    revision: reference.revision,
    hasImage: reference.asset !== null,
  };
}

type Reader = { getJson: ServiceConnection["getJson"] };

/**
 * Reads project, board, and references, then re-reads the project and board
 * revisions. A change in between triggers one full re-read; if the revisions
 * still moved, the snapshot is returned flagged inconsistent.
 */
export async function readContextSnapshot(service: Reader, projectId: string) {
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const readAll = async () => {
    const project = await service.getJson(base, projectSchema);
    const board = await service.getJson(`${base}/board`, boardSchema);
    const { references } = await service.getJson(`${base}/references`, projectReferenceListSchema);
    return { project, board, references };
  };
  const stable = async (read: Awaited<ReturnType<typeof readAll>>) => {
    const project = await service.getJson(base, projectSchema);
    const board = await service.getJson(`${base}/board`, boardSchema);
    return project.revision === read.project.revision && board.revision === read.board.revision;
  };
  let read = await readAll();
  if (await stable(read)) return { ...read, consistent: true };
  read = await readAll();
  return { ...read, consistent: await stable(read) };
}

export function registerReadTools(server: McpServer, options: ServiceClientOptions): void {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List Reference Studio projects with id, name, revision, and updatedAt. Returns at most 100 projects and sets truncated when more exist. Use a returned id as projectId in other tools; the adapter never assumes an active project.",
      inputSchema: z.object({}),
      outputSchema: listProjectsOutput,
    },
    async () => {
      try {
        const service = await connect(options);
        const { projects } = await service.getJson("/api/projects", projectListSchema);
        const summary = summarizeProjects(projects);
        return {
          content: [
            {
              type: "text",
              text: `${summary.total} project(s)${summary.truncated ? `; showing the first ${summary.projects.length}` : ""}.\n${summary.projects.map((project) => `- ${project.name} (${project.id}, revision ${project.revision})`).join("\n")}`,
            },
          ],
          structuredContent: summary,
        };
      } catch (error) {
        return failureResult("list_projects", error);
      }
    },
  );

  server.registerTool(
    "search_references",
    {
      title: "Search references",
      description: `Search the reference library across projects and return concise metadata only: id, kind, title, source and creator attribution, tags, availability, revision, and hasImage. Results contain no image content, and a source URL is attribution, not evidence that anyone looked at the image; actual images and crops come from a later tool. Pass the returned nextCursor as cursor for the next page. limit is 1-${MAX_REFERENCE_PAGE_LIMIT} (default ${REFERENCE_PAGE_LIMIT}).`,
      inputSchema: z.object({
        q: z.string().trim().max(200).optional().describe("Text to search for."),
        tag: z.string().trim().max(40).optional().describe("Only references with this tag."),
        kind: z.enum(REFERENCE_KINDS).optional().describe("Only references of this kind."),
        limit: z.number().int().min(1).max(MAX_REFERENCE_PAGE_LIMIT).optional(),
        cursor: z.string().min(1).max(240).optional().describe("nextCursor from a previous result."),
      }),
      outputSchema: searchReferencesOutput,
    },
    async (input) => {
      try {
        const service = await connect(options);
        const query = new URLSearchParams();
        for (const key of ["q", "tag", "kind", "limit", "cursor"] as const) {
          const value = input[key];
          if (value !== undefined && value !== "") {
            query.set(key, String(value));
          }
        }
        const suffix = query.size === 0 ? "" : `?${query.toString()}`;
        const result = await service.getJson(`/api/references${suffix}`, referenceSearchResultSchema);
        const structured = {
          references: result.references.map(summarizeReference),
          nextCursor: result.nextCursor,
        };
        return {
          content: [
            {
              type: "text",
              text: `${structured.references.length} reference(s)${structured.nextCursor === null ? "; no more pages" : `; next cursor ${structured.nextCursor}`}.\n${structured.references.map((reference) => `- ${reference.kind}: ${reference.title} (${reference.id})${reference.hasImage ? " [has image]" : ""}`).join("\n")}`,
            },
          ],
          structuredContent: structured,
        };
      } catch (error) {
        return failureResult("search_references", error);
      }
    },
  );

  server.registerTool(
    "get_project_context",
    {
      title: "Get project context",
      description:
        "Fetch bounded, explicit context for one project: purpose, audience, constraints, the target direction's concept, feeling, decisions and questions, other directions as alternatives, saved reference interpretations (placement, reference, role, usage notes), human feedback and decision annotations, and a systems summary, each with stable IDs. Text is excerpted to 2,000 characters and lists are capped, with truncated flags. intentionalExceptions is notRecorded because Studio has no store for them. Pass directionId to focus on one direction. Pass knownRevision (that direction's revision, or the board revision without directionId) to learn whether context changed: a stale value returns fresh context with revisionChanged and no diff, a value above the current revision is revision_conflict. Always reports the project revision. consistency is changed_during_read if the project or board revision kept changing while it was read. The adapter remembers nothing between calls.",
      inputSchema: z.object({
        projectId: z.uuid().describe("Project ID from list_projects."),
        directionId: z.uuid().optional().describe("Direction to focus on."),
        knownRevision: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("The direction revision (with directionId) or board revision the caller last saw."),
      }),
      outputSchema: projectContextSchema,
    },
    async (input) => {
      try {
        const service = await connect(options);
        const snapshot = await readContextSnapshot(service, input.projectId);
        const built = buildProjectContext({
          project: snapshot.project,
          board: snapshot.board,
          placements: snapshot.references,
          directionId: input.directionId,
          knownRevision: input.knownRevision,
        });
        const context = snapshot.consistent ? built : { ...built, consistency: "changed_during_read" as const };
        const changed =
          context.revisionChanged === undefined
            ? ""
            : ` Revision changed from ${context.revisionChanged.known} to ${context.revisionChanged.current}; read the fresh context below.`;
        return {
          content: [
            {
              type: "text",
              text: `Context for ${context.project.name} (project revision ${context.project.revision}, ${context.scope.revisionKind} revision ${context.scope.revision}).${changed}\n${JSON.stringify(context, null, 2)}`,
            },
          ],
          structuredContent: context,
        };
      } catch (error) {
        return failureResult("get_project_context", error);
      }
    },
  );
}
