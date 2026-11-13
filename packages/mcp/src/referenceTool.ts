import type { McpServer } from "@modelcontextprotocol/server";
import {
  AGENT_IMAGE_MAX_EDGE,
  AGENT_IMAGE_MIN_EDGE,
  PLACEMENT_ROLES,
  REFERENCE_AVAILABILITY,
  REFERENCE_KINDS,
  boardSchema,
  imageCropSchema,
  projectReferenceListSchema,
  referenceDetailSchema,
  type ImageCrop,
  type LibraryReference,
} from "@reference-studio/core";
import { z } from "zod";
import { MAX_ANNOTATIONS, bounded, excerptOf, isHumanOrDecision } from "./context.js";
import { AdapterError } from "./discovery.js";
import { failureResult } from "./failure.js";
import { connect, type ImageBytes, type ServiceClientOptions } from "./serviceClient.js";

export const MAX_REFERENCE_LINKS = 20;

const excerpt = z.object({ text: z.string(), truncated: z.boolean() });
const region = imageCropSchema;
const cropOrNull = imageCropSchema.nullable();

const getReferenceInput = z
  .object({
    referenceId: z.uuid().describe("Reference ID from search_references or get_project_context."),
    projectId: z.uuid().optional().describe("Also return this project's placements of the reference and the annotations on them."),
    placementId: z
      .uuid()
      .optional()
      .describe("Placement of this reference in projectId; its saved crop selects the image region."),
    crop: imageCropSchema
      .optional()
      .describe("Normalized region of the original image (0-1 from the top left). Not allowed with placementId."),
    includeImage: z.boolean().optional().describe("Attach the image as MCP image content. Default true."),
    maxEdge: z
      .number()
      .int()
      .min(AGENT_IMAGE_MIN_EDGE)
      .max(AGENT_IMAGE_MAX_EDGE)
      .optional()
      .describe(`Longest edge of the returned image in pixels, ${AGENT_IMAGE_MIN_EDGE}-${AGENT_IMAGE_MAX_EDGE}. Default ${AGENT_IMAGE_MAX_EDGE}.`),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.placementId !== undefined && input.projectId === undefined) {
      context.addIssue({ code: "custom", path: ["placementId"], message: "placementId requires projectId." });
    }
    if (input.placementId !== undefined && input.crop !== undefined) {
      context.addIssue({ code: "custom", path: ["crop"], message: "Send either placementId or crop, not both." });
    }
  });

const placementOutput = z.object({
  placementId: z.string(),
  location: z.enum(["inbox", "board"]),
  directionId: z.string().nullable(),
  role: z.enum(PLACEMENT_ROLES),
  usageNotes: excerpt,
  crop: cropOrNull,
  revision: z.number(),
});

const annotationOutput = z.object({
  id: z.string(),
  placementId: z.string(),
  author: z.enum(["human", "agent"]),
  body: excerpt,
  borrowedQuality: excerpt,
  translation: excerpt,
  region: region.nullable(),
  decision: z.object({ rationale: excerpt }).nullable(),
});

function listOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), total: z.number(), truncated: z.boolean() });
}

const imageOutput = z.object({
  status: z.enum(["included", "not_requested", "not_image", "missing"]),
  variant: z.enum(["full", "crop"]).nullable(),
  mimeType: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  sourceWidth: z.number().nullable(),
  sourceHeight: z.number().nullable(),
  crop: cropOrNull,
  fallback: z.enum(["none", "requality", "downscale", "thumbnail"]).nullable(),
});

export const getReferenceOutput = z.object({
  reference: z.object({
    id: z.string(),
    kind: z.enum(REFERENCE_KINDS),
    title: z.string(),
    tags: z.array(z.string()),
    availability: z.enum(REFERENCE_AVAILABILITY),
    revision: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    asset: z
      .object({
        mediaType: z.string(),
        width: z.number(),
        height: z.number(),
        byteSize: z.number(),
        sha256: z.string(),
      })
      .nullable(),
    source: z.object({ url: z.string().nullable(), creator: z.string().nullable() }),
    observations: excerpt,
  }),
  projectIds: z.array(z.string()),
  project: z
    .object({
      projectId: z.string(),
      placements: listOf(placementOutput),
      annotations: listOf(annotationOutput),
    })
    .optional(),
  image: imageOutput,
});

export type GetReferenceOutput = z.infer<typeof getReferenceOutput>;
type ImageState = GetReferenceOutput["image"];

const NO_IMAGE: ImageState = {
  status: "not_requested",
  variant: null,
  mimeType: null,
  width: null,
  height: null,
  sourceWidth: null,
  sourceHeight: null,
  crop: null,
  fallback: null,
};

export function summarizeReferenceDetail(reference: LibraryReference) {
  return {
    id: reference.id,
    kind: reference.kind,
    title: reference.title,
    tags: reference.tags,
    availability: reference.availability,
    revision: reference.revision,
    createdAt: reference.createdAt,
    updatedAt: reference.updatedAt,
    asset:
      reference.asset === null
        ? null
        : {
            mediaType: reference.asset.mediaType,
            width: reference.asset.width,
            height: reference.asset.height,
            byteSize: reference.asset.byteSize,
            sha256: reference.asset.sha256,
          },
    source: { url: reference.sourceUrl, creator: reference.creator },
    observations: excerptOf(reference.observations),
  };
}

function imageQuery(crop: ImageCrop | null, maxEdge: number | undefined): string {
  const query = new URLSearchParams();
  if (crop !== null) {
    query.set("x", String(crop.x));
    query.set("y", String(crop.y));
    query.set("width", String(crop.width));
    query.set("height", String(crop.height));
  }
  if (maxEdge !== undefined) query.set("maxEdge", String(maxEdge));
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

export function registerReferenceTool(server: McpServer, options: ServiceClientOptions): void {
  server.registerTool(
    "get_reference",
    {
      title: "Get reference",
      description: `Fetch one reference: metadata, provenance (source URL and creator are attribution only, never evidence that the image was inspected), an observations excerpt, and the image itself as MCP image content, optionally cropped. Pass projectId to also receive that project's placements of the reference and the board annotations on them (human feedback and decisions only; placements keep the first ${MAX_REFERENCE_LINKS} and annotations the last ${MAX_ANNOTATIONS} in board order, with total and truncated; each placement has location inbox or board and its directionId). Pass crop (normalized 0-1 from the top left of the original) or placementId with projectId (uses that placement's saved crop) to inspect a region; never both. maxEdge (${AGENT_IMAGE_MIN_EDGE}-${AGENT_IMAGE_MAX_EDGE}) bounds the longest edge; images are re-encoded to at most 1 MB and image.fallback reports any quality or size reduction. includeImage false returns metadata only. If the stored file is missing, a plain call returns metadata with image.status "missing"; an explicit crop or placementId returns asset_missing. Read-only: nothing is saved or changed.`,
      inputSchema: getReferenceInput,
      outputSchema: getReferenceOutput,
    },
    async (input) => {
      try {
        const service = await connect(options);
        const detail = await service.getJson(`/api/references/${encodeURIComponent(input.referenceId)}`, referenceDetailSchema);
        const reference = detail.reference;
        const explicitRegion = input.placementId !== undefined || input.crop !== undefined;

        let project: GetReferenceOutput["project"];
        let crop: ImageCrop | null = input.crop ?? null;
        if (input.projectId !== undefined) {
          const base = `/api/projects/${encodeURIComponent(input.projectId)}`;
          const { references } = await service.getJson(`${base}/references`, projectReferenceListSchema);
          const board = await service.getJson(`${base}/board`, boardSchema);
          const placements = references.filter((entry) => entry.reference.id === reference.id);
          const placementIds = new Set(placements.map((entry) => entry.placementId));
          if (input.placementId !== undefined) {
            const chosen = placements.find((entry) => entry.placementId === input.placementId);
            if (chosen === undefined) {
              throw new AdapterError(
                "not_found",
                "That placement does not exist in this project for this reference.",
                "Call get_reference with projectId alone to list this reference's placements, then retry with one of those placementId values.",
              );
            }
            crop = chosen.crop;
          }
          const itemFrame = new Map(board.layout.items.map((item) => [item.placementId, item.frameId]));
          const annotations = (board.layout.annotations ?? []).flatMap((annotation) =>
            isHumanOrDecision(annotation) &&
            annotation.target.type === "placement" &&
            placementIds.has(annotation.target.placementId)
              ? [
                  {
                    id: annotation.id,
                    placementId: annotation.target.placementId,
                    author: annotation.provenance.author,
                    body: excerptOf(annotation.body),
                    borrowedQuality: excerptOf(annotation.borrowedQuality),
                    translation: excerptOf(annotation.translation),
                    region: annotation.region ?? null,
                    decision:
                      annotation.decision === undefined ? null : { rationale: excerptOf(annotation.decision.rationale) },
                  },
                ]
              : [],
          );
          project = {
            projectId: input.projectId,
            placements: bounded(
              placements.map((entry) => ({
                placementId: entry.placementId,
                location: itemFrame.has(entry.placementId) ? ("board" as const) : ("inbox" as const),
                directionId: itemFrame.get(entry.placementId) ?? null,
                role: entry.role,
                usageNotes: excerptOf(entry.usageNotes),
                crop: entry.crop,
                revision: entry.revision,
              })),
              MAX_REFERENCE_LINKS,
            ),
            annotations: bounded(annotations, MAX_ANNOTATIONS, true),
          };
        }

        let image: ImageState = { ...NO_IMAGE, crop, variant: crop === null ? "full" : "crop" };
        let picture: ImageBytes | undefined;
        if (input.includeImage !== false) {
          if (reference.asset === null && input.crop === undefined) {
            image = { ...NO_IMAGE, status: "not_image" };
          } else {
            try {
              picture = await service.getBytes(
                `/api/references/${encodeURIComponent(reference.id)}/image${imageQuery(crop, input.maxEdge)}`,
              );
              image = {
                status: "included",
                variant: crop === null ? "full" : "crop",
                mimeType: picture.mimeType,
                width: picture.width,
                height: picture.height,
                sourceWidth: picture.sourceWidth,
                sourceHeight: picture.sourceHeight,
                crop,
                fallback: picture.fallback,
              };
            } catch (error) {
              if (error instanceof AdapterError && error.code === "asset_missing" && !explicitRegion) {
                image = { ...NO_IMAGE, status: "missing", variant: "full" };
              } else {
                throw error;
              }
            }
          }
        }

        const structured: GetReferenceOutput = {
          reference: summarizeReferenceDetail(reference),
          projectIds: detail.projectIds,
          ...(project === undefined ? {} : { project }),
          image,
        };
        return {
          content: [
            { type: "text" as const, text: summaryText(structured, picture !== undefined) },
            ...(picture === undefined
              ? []
              : [{ type: "image" as const, data: picture.bytes.toString("base64"), mimeType: picture.mimeType }]),
          ],
          structuredContent: structured,
        };
      } catch (error) {
        return failureResult("get_reference", error);
      }
    },
  );
}

function summaryText(output: GetReferenceOutput, attached: boolean): string {
  const { reference, image } = output;
  const lines = [
    `${reference.kind} reference "${reference.title}" (${reference.id}, revision ${reference.revision}), placed in ${output.projectIds.length} project(s).`,
  ];
  if (attached) {
    const region = image.variant === "crop" ? "the requested crop" : "the full image";
    lines.push(
      `The image block attached to this result shows ${region} at ${image.width}x${image.height} (source ${image.sourceWidth}x${image.sourceHeight}, fallback ${image.fallback}); inspect it directly. Source URLs and creators are attribution only and do not show that anyone looked at the image.`,
    );
  } else if (image.status === "missing") {
    lines.push("The stored image file is missing, so no image is attached; metadata is still current.");
  } else if (image.status === "not_image") {
    lines.push("This reference has no image, so none is attached.");
  } else {
    lines.push("No image was requested. Source URLs and creators are attribution only.");
  }
  return lines.join(" ");
}
