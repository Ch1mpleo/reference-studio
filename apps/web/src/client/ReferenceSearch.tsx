import { useState, type FormEvent } from "react";
import type { LibraryReference, ProjectReference } from "@reference-studio/core";
import { ReferenceRequestError, searchReferences } from "./referenceApi.js";
import { StudioButton } from "./StudioButton.js";
import { StudioSelect } from "./StudioSelect.js";
import { StudioReferenceCard } from "./StudioReferenceCard.js";

type Kind = "" | "image" | "link" | "note";

export function ReferenceSearch({
  placedReferenceIds,
  onPlace,
}: {
  placedReferenceIds: string[];
  onPlace: (referenceId: string) => Promise<ProjectReference>;
}) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState<Kind>("");
  const [results, setResults] = useState<LibraryReference[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const placed = new Set(placedReferenceIds);

  async function search(event?: FormEvent<HTMLFormElement>, cursor?: string): Promise<void> {
    event?.preventDefault();
    setStatus("searching");
    setMessage(null);
    try {
      const result = await searchReferences({
        q,
        tag,
        kind,
        ...(cursor === undefined ? {} : { cursor }),
      });
      setResults((current) => (cursor === undefined ? result.references : [...current, ...result.references]));
      setNextCursor(result.nextCursor);
      setSearched(true);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof ReferenceRequestError ? error.message : "Search failed");
    }
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
    <form className="reference-form" onSubmit={(event) => void search(event)}>
      <h4>Find a reference</h4>
      <label htmlFor="reference-search">Keyword</label>
      <input
        id="reference-search"
        value={q}
        maxLength={200}
        disabled={status === "searching"}
        onChange={(event) => setQ(event.target.value)}
      />
      <label htmlFor="reference-search-tag">Tag</label>
      <input
        id="reference-search-tag"
        value={tag}
        maxLength={40}
        disabled={status === "searching"}
        onChange={(event) => setTag(event.target.value)}
      />
      <label htmlFor="reference-search-kind">Kind</label>
      <StudioSelect
        id="reference-search-kind"
        label="Kind"
        field
        value={kind}
        disabled={status === "searching"}
        options={[{ value: "", label: "Any" }, { value: "image", label: "Image" }, { value: "link", label: "Link" }, { value: "note", label: "Note" }]}
        onChange={(value) => { if (value === "" || value === "image" || value === "link" || value === "note") setKind(value); }}
      />
      <div className="form-actions">
        <StudioButton type="submit" variant="primary" busy={status === "searching"} disabled={status === "searching"}>
          Search
        </StudioButton>
        <p className="save-state" aria-live="polite">
          {status === "searching" ? "Searching" : null}
        </p>
      </div>
      {message !== null ? <p className="form-error">{message}</p> : null}
      {searched && status !== "searching" && results.length === 0 ? <p>No references match.</p> : null}
      {results.length > 0 ? (
        <ul className="reference-list">
          {results.map((reference) => {
            const inProject = placed.has(reference.id);
            return (
              <li key={reference.id}>
                <StudioReferenceCard title={reference.title} metadata={kindLabel(reference.kind)} selected={false}
                  loadingMode="instant" imageState={reference.kind === "image" ? (reference.asset ? "ready" : "missing") : "none"}
                  onOpen={() => void place(reference.id)}
                  media={reference.asset !== null ? (
                    <img
                      src={`/api/assets/${reference.asset.id}/thumbnail`}
                      alt=""
                      width={reference.asset.width}
                      height={reference.asset.height}
                    />
                  ) : <p className="studio-meta">{reference.kind === "image" ? "Image unavailable" : kindLabel(reference.kind)}</p>}
                  summary={<div className="reference-search-summary">
                    {reference.creator !== null ? <p className="studio-help">{reference.creator}</p> : null}
                    {reference.sourceUrl !== null ? (
                      <a className="sample-url" href={reference.sourceUrl} rel="noreferrer noopener" target="_blank">
                        <span className="sample-link-text">{reference.sourceUrl}</span>
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
        <StudioButton type="button" disabled={status === "searching"} onClick={() => void search(undefined, nextCursor)}>
          More
        </StudioButton>
      ) : null}
    </form>
  );
}

function kindLabel(kind: LibraryReference["kind"]): string {
  if (kind === "image") {
    return "Image";
  }
  if (kind === "link") {
    return "Link";
  }
  return "Note";
}
