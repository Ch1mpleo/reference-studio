import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { LibraryReference, ProjectReference } from "@reference-studio/core";
import { ReferenceRequestError, searchReferences } from "./referenceApi.js";
import { StudioButton } from "./StudioButton.js";
import { StudioField } from "./StudioField.js";
import { StudioReferenceCard } from "./StudioReferenceCard.js";
import { StudioSegment } from "./StudioSegment.js";
import { ImageUnavailable } from "./ImageRegions.js";

type Kind = "" | "image" | "link" | "note";
type Query = { q: string; tag: string; kind: Kind };

const kindOptions = [
  { value: "", label: "Any" },
  { value: "image", label: "Image" },
  { value: "link", label: "Link" },
  { value: "note", label: "Note" },
] as const;

export function ReferenceSearch({
  placedReferenceIds,
  onPlace,
}: {
  placedReferenceIds: string[];
  onPlace: (referenceId: string) => Promise<ProjectReference>;
}) {
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState<Kind>("");
  const [results, setResults] = useState<LibraryReference[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const request = useRef(0);
  const placed = new Set(placedReferenceIds);
  const filtersActive = kind !== "" || tag !== "" || tagDraft.trim() !== "";

  function run(query: Query, cursor?: string): void {
    const id = ++request.current;
    setStatus("searching");
    setMessage(null);
    if (cursor === undefined) setNextCursor(null);
    void searchReferences({
      q: query.q,
      tag: query.tag,
      kind: query.kind,
      ...(cursor === undefined ? {} : { cursor }),
    }).then((result) => {
      if (id !== request.current) return;
      setResults((current) => (cursor === undefined ? result.references : [...current, ...result.references]));
      setNextCursor(result.nextCursor);
      setSearched(true);
      setStatus("idle");
    }).catch((error: unknown) => {
      if (id !== request.current) return;
      setStatus("error");
      setMessage(error instanceof ReferenceRequestError ? error.message : "Search failed");
    });
  }

  function submitKeyword(): void {
    setAppliedQ(q);
    run({ q, tag, kind });
  }

  function commitTag(): void {
    const next = tagDraft.trim();
    setTag(next);
    setTagDraft(next);
    run({ q: appliedQ, tag: next, kind });
  }

  function chooseKind(value: string): void {
    if (value !== "" && value !== "image" && value !== "link" && value !== "note") return;
    if (value === kind) return;
    setKind(value);
    run({ q: appliedQ, tag, kind: value });
  }

  function removeKind(): void {
    setKind("");
    run({ q: appliedQ, tag, kind: "" });
  }

  function removeTag(): void {
    setTag("");
    setTagDraft("");
    run({ q: appliedQ, tag: "", kind });
  }

  function clearFilters(): void {
    const applied = kind !== "" || tag !== "";
    setKind("");
    setTag("");
    setTagDraft("");
    if (applied) run({ q: appliedQ, tag: "", kind: "" });
  }

  function onKeywordKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitKeyword();
  }

  function onTagKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitTag();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitKeyword();
  }

  async function place(referenceId: string): Promise<void> {
    setPlacingId(referenceId);
    setMessage(null);
    try {
      await onPlace(referenceId);
    } catch (error) {
      setMessage(error instanceof ReferenceRequestError ? error.message : "The reference could not be added.");
    } finally {
      setPlacingId(null);
    }
  }

  return (
    <form className="reference-form" onSubmit={onSubmit}>
      <h4>Find a reference</h4>
      <div className="library-filters">
        <StudioField id="reference-search" label="Keyword" value={q} maxLength={200} onChange={setQ} onKeyDown={onKeywordKey} />
        <StudioSegment label="Kind" value={kind} options={kindOptions} onChange={chooseKind} />
        <StudioField id="reference-search-tag" label="Tag" optional value={tagDraft} maxLength={40} onChange={setTagDraft} onKeyDown={onTagKey} />
        {kind !== "" || tag !== "" ? (
          <div className="library-filter-chips" role="list" aria-label="Active filters">
            {kind !== "" ? (
              <span role="listitem">
                <StudioButton type="button" aria-label={`Remove ${kindName(kind)} filter`} onClick={removeKind}>{kindName(kind)}</StudioButton>
              </span>
            ) : null}
            {tag !== "" ? (
              <span role="listitem">
                <StudioButton type="button" aria-label={`Remove tag ${tag}`} onClick={removeTag}>{tag}</StudioButton>
              </span>
            ) : null}
          </div>
        ) : null}
        <StudioButton type="button" variant="ghost" disabled={!filtersActive} onClick={clearFilters}>Clear</StudioButton>
      </div>
      <p className="save-state" aria-live="polite">
        {status === "searching" ? "Searching" : null}
      </p>
      {message !== null ? <p className="form-error">{message}</p> : null}
      {searched && status !== "searching" && results.length === 0 ? <p>No references match.</p> : null}
      {results.length > 0 ? (
        <ul className="reference-list">
          {results.map((reference) => {
            const inProject = placed.has(reference.id);
            return (
              <li key={reference.id}>
                <StudioReferenceCard title={reference.title} metadata={kindName(reference.kind)} selected={false}
                  loadingMode="instant" imageState={reference.kind === "image" ? (reference.asset && !failedThumbnails.has(reference.asset.id) ? "ready" : "missing") : "none"}
                  onOpen={() => void place(reference.id)}
                  media={reference.asset !== null && !failedThumbnails.has(reference.asset.id) ? (
                    <img src={`/api/assets/${reference.asset.id}/thumbnail`} alt={reference.title} width={reference.asset.width} height={reference.asset.height}
                      onError={() => { const id = reference.asset?.id; if (id) setFailedThumbnails((current) => new Set(current).add(id)); }} />
                  ) : reference.kind === "image" ? <ImageUnavailable title={reference.title} /> : <p className="studio-meta">{kindName(reference.kind)}</p>}
                  summary={<div className="reference-search-summary">
                    {reference.creator !== null ? <p className="studio-help">{reference.creator}</p> : null}
                    {reference.sourceUrl !== null ? (
                      <a className="studio-url" href={reference.sourceUrl} rel="noreferrer noopener" target="_blank">
                        <span className="studio-link-text">{reference.sourceUrl}</span>
                      </a>
                    ) : null}
                    {reference.creator === null && reference.sourceUrl === null ? (
                      <p className="studio-help">Source unknown</p>
                    ) : null}
                    {reference.tags.length > 0 ? <p className="studio-help">{reference.tags.join(", ")}</p> : null}
                  </div>}
                  actions={<StudioButton
                    type="button"
                    disabled={inProject || placingId === reference.id}
                    busy={placingId === reference.id}
                    onClick={() => void place(reference.id)}
                  >
                    {inProject ? "In this project" : "Add to this project"}
                  </StudioButton>}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      {nextCursor !== null ? (
        <StudioButton type="button" disabled={status === "searching"} onClick={() => run({ q: appliedQ, tag, kind }, nextCursor)}>
          More
        </StudioButton>
      ) : null}
    </form>
  );
}

function kindName(kind: "" | LibraryReference["kind"]): string {
  if (kind === "image") return "Image";
  if (kind === "link") return "Link";
  if (kind === "note") return "Note";
  return "Any";
}
