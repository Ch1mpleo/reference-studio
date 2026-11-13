import type { McpServer } from "@modelcontextprotocol/server";
import {
  annotationTargetSchema,
  createAnnotationResultSchema,
  idempotencyKeySchema,
  imageCropSchema,
  proposeDirectionResultSchema,
} from "@reference-studio/core";
import { z } from "zod";
import { failureResult } from "./failure.js";
import { connect, type ServiceClientOptions } from "./serviceClient.js";

const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

const mutationKey = idempotencyKeySchema.describe(
  "Caller-supplied retry key, 1-128 letters, numbers or . _ : - characters. Repeat the same key with the same request to replay the original result without a second write; use a new key for every new request.",
);
const authorName = z.string().trim().min(1).max(200).optional().describe("Optional free-text name shown with the note, e.g. the agent or host name.");

const addAnnotationInput = z
  .object({
    projectId: z.uuid().describe("Project ID from list_projects."),
    expectedRevision: z
      .number()
      .int()
      .positive()
      .describe("The direction's revision when the target is a direction or a placement inside a direction; otherwise the board revision. Both come from get_project_context."),
    target: annotationTargetSchema.describe("What the note is about: the project, a direction, or a placement."),
    body: z.string().trim().min(1).max(20_000).describe("The note itself."),
    borrowedQuality: z.string().max(20_000).optional().describe("What quality is borrowed from the reference."),
    translation: z.string().max(20_000).optional().describe("How that quality translates to this project."),
    limitations: z.string().max(20_000).optional().describe("Where the reference should not be followed."),
    region: imageCropSchema.optional().describe("Normalized region (0-1 from the top left) of an image placement. Image placements only."),
    authorName,
    mutationKey,
  })
  .strict();

const addAnnotationOutput = z.object({
  annotationId: z.string(),
  projectId: z.string(),
  boardRevision: z.number(),
  directionRevision: z.number().nullable(),
  directionId: z.string().nullable(),
  location: z.enum(["inbox", "board"]).nullable(),
  draft: z.literal(true),
  replayed: z.boolean(),
});

const proposeDirectionInput = z
  .object({
    projectId: z.uuid().describe("Project ID from list_projects."),
    expectedRevision: z.number().int().positive().describe("The board revision from get_project_context (without directionId)."),
    name: z.string().trim().min(1).max(200).describe("Short direction name."),
    concept: z.string().max(20_000).describe("The proposed concept."),
    feeling: z.string().max(4_000).optional().describe("The intended feeling."),
    questions: z.string().max(20_000).optional().describe("Open questions for the human."),
    rationale: z.string().trim().min(1).max(20_000).describe("Why this direction is proposed; stored as an agent note on the new direction."),
    authorName,
    mutationKey,
  })
  .strict();

const proposeDirectionOutput = z.object({
  projectId: z.string(),
  directionId: z.string(),
  directionRevision: z.number(),
  boardRevision: z.number(),
  annotationId: z.string(),
  draft: z.literal(true),
  replayed: z.boolean(),
});

export function registerWriteTools(server: McpServer, options: ServiceClientOptions): void {
  server.registerTool(
    "add_annotation",
    {
      title: "Add annotation",
      description:
        "Add a draft agent note to a project, a direction, or a placement (including an inbox placement), optionally with an image region. Purely additive: it never edits or removes anything a human wrote, and it is a proposal, not a decision or approval. Requires expectedRevision (the direction's revision for a direction or a placement inside one, otherwise the board revision) and a caller-supplied mutationKey. A stale revision returns revision_conflict with currentRevision and writes nothing. Replaying a mutationKey with the same request returns the original result with replayed true; the same key with a different request is idempotency_mismatch. The adapter never retries a write.",
      inputSchema: addAnnotationInput,
      outputSchema: addAnnotationOutput,
      annotations: WRITE_ANNOTATIONS,
    },
    async (input) => {
      try {
        const service = await connect(options);
        const { projectId, mutationKey: key, ...body } = input;
        const { data, replayed } = await service.sendJson(
          "POST",
          `/api/projects/${encodeURIComponent(projectId)}/annotations`,
          body,
          createAnnotationResultSchema,
          key,
        );
        const structured = {
          annotationId: data.annotation.id,
          projectId,
          boardRevision: data.boardRevision,
          directionRevision: data.directionRevision,
          directionId: data.directionId,
          location: data.location,
          draft: true as const,
          replayed,
        };
        const where =
          data.location === null ? "" : ` on a placement in the ${data.location}${data.directionId === null ? "" : ` (direction ${data.directionId})`}`;
        return {
          content: [
            {
              type: "text",
              text: `${replayed ? "Replayed: " : ""}Draft agent annotation ${data.annotation.id} ${replayed ? "was already added" : "added"}${where}. Board revision is now ${data.boardRevision}${data.directionRevision === null ? "" : `; direction revision is now ${data.directionRevision}`}. This is a draft proposal, not an approval; the human decides.`,
            },
          ],
          structuredContent: structured,
        };
      } catch (error) {
        return failureResult("add_annotation", error);
      }
    },
  );

  server.registerTool(
    "propose_direction",
    {
      title: "Propose direction",
      description:
        "Propose a new draft direction: an empty frame placed to the right of the existing ones, plus an agent note holding the rationale. It adds to the board and never changes existing directions, and it is a proposal, not an approval. Requires the board expectedRevision and a caller-supplied mutationKey. A stale revision returns revision_conflict with currentRevision and writes nothing. Replaying a mutationKey with the same request returns the original result with replayed true; the same key with a different request is idempotency_mismatch. The adapter never retries a write.",
      inputSchema: proposeDirectionInput,
      outputSchema: proposeDirectionOutput,
      annotations: WRITE_ANNOTATIONS,
    },
    async (input) => {
      try {
        const service = await connect(options);
        const { projectId, mutationKey: key, ...body } = input;
        const { data, replayed } = await service.sendJson(
          "POST",
          `/api/projects/${encodeURIComponent(projectId)}/directions`,
          body,
          proposeDirectionResultSchema,
          key,
        );
        return {
          content: [
            {
              type: "text",
              text: `${replayed ? "Replayed: " : ""}Draft direction ${data.directionId} (revision ${data.directionRevision}) ${replayed ? "was already proposed" : "proposed"} with rationale annotation ${data.annotationId}. Board revision is now ${data.boardRevision}. This is a draft proposal, not an approval; the human decides.`,
            },
          ],
          structuredContent: { projectId, ...data, draft: true as const, replayed },
        };
      } catch (error) {
        return failureResult("propose_direction", error);
      }
    },
  );
}
