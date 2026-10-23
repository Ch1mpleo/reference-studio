import { useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { StudioDialog } from "./StudioDialog.js";
import { StudioMenu } from "./StudioMenu.js";
import { harborArt, northStairArt } from "./specimenArt.js";
import { studioMotionDuration } from "./studioMotion.js";
import type { ServiceState } from "./useServiceConnection.js";

type SampleConnection = {
  state: ServiceState;
  detail: string;
  contractVersion: number | null;
  live: boolean;
  onRetry: () => void;
};

type SampleKind = "image" | "link" | "note";
type SampleRole = "inspiration" | "candidate" | "approved";
type SaveState = "conflict" | "error" | "saving" | "saved";
type ThemeChoice = "system" | "light" | "dark";
type KindFilter = "all" | SampleKind;
type AddTab = "image" | "link" | "note";

type SampleCard = {
  id: string;
  kind: SampleKind;
  title: string;
  creator: string;
  source: string;
  tags: string;
  observations: string;
  role: SampleRole;
  usage: string;
  image?: string;
  missing?: boolean;
};

type Draft = {
  title: string;
  creator: string;
  source: string;
  tags: string;
  observations: string;
  role: SampleRole;
  usage: string;
  cropX: string;
  cropY: string;
  cropWidth: string;
  cropHeight: string;
};

const connectionLabel: Record<ServiceState, string> = {
  loading: "Connecting",
  ready: "Connected",
  reconnecting: "Reconnecting",
  unavailable: "Unavailable",
};

const sampleCards: SampleCard[] = [
  {
    id: "north",
    kind: "image",
    title: "North stair",
    creator: "Mara Ellison",
    source: "https://example.com/north-stair",
    tags: "north, stone",
    observations: "Quiet stone and north light.",
    role: "approved",
    usage: "Hero",
    image: northStairArt,
  },
  {
    id: "harbor",
    kind: "image",
    title: "Harbor morning",
    creator: "Ivo March",
    source: "https://example.com/harbor",
    tags: "water, hull",
    observations: "Warm hull against a cool quay.",
    role: "inspiration",
    usage: "",
    image: harborArt,
  },
  {
    id: "west",
    kind: "image",
    title: "West window",
    creator: "",
    source: "",
    tags: "",
    observations: "The file is missing. The title and source stay.",
    role: "inspiration",
    usage: "",
    missing: true,
  },
  {
    id: "catalog",
    kind: "link",
    title: "Harbor catalog",
    creator: "",
    source: "https://example.com/boards/harbor/north-light/quiet-type/reference",
    tags: "harbor",
    observations: "",
    role: "candidate",
    usage: "Bookmark only.",
  },
  {
    id: "light",
    kind: "note",
    title: "Ánh sáng phía bắc trên đá yên",
    creator: "",
    source: "",
    tags: "north",
    observations: "Đá yên và ánh sáng dịu, không có chuyển động.",
    role: "inspiration",
    usage: "",
  },
];

const emptyMotif = ["+------------------+", "|                  |", "|        ...       |", "|                  |", "+------------------+"].join("\n");
const skeletonGlyphs = [".  :   .  ", "         :", ".        .", "    :     "].join("\n");

function draftFrom(card: SampleCard): Draft {
  return {
    title: card.title,
    creator: card.creator,
    source: card.source,
    tags: card.tags,
    observations: card.observations,
    role: card.role,
    usage: card.usage,
    cropX: "",
    cropY: "",
    cropWidth: "",
    cropHeight: "",
  };
}

function kindLabel(kind: SampleKind): string {
  if (kind === "image") return "Image";
  if (kind === "link") return "Link";
  return "Note";
}

function roleLabel(role: SampleRole): string {
  if (role === "approved") return "Approved asset";
  if (role === "candidate") return "Candidate";
  return "Inspiration";
}

export function StudioPreview({ connection }: { connection?: SampleConnection }) {
  const status = connection ?? {
    state: "ready" as const,
    detail: "Specimen status. This preview does not write to a project.",
    contractVersion: null,
    live: false,
    onRetry: () => undefined,
  };
  const [reducedMotion, setReducedMotion] = useState(false);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");
  const [plain, setPlain] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "note" | "add">(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [menuChoice, setMenuChoice] = useState("Inspiration");
  const [project, setProject] = useState("Atlas");
  const [projectNote, setProjectNote] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>("north");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(sampleCards.map((card) => [card.id, draftFrom(card)])),
  );
  const [northSave, setNorthSave] = useState<SaveState>("conflict");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [emptyCollection, setEmptyCollection] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("image");
  const [imageTitle, setImageTitle] = useState("");
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkMotion, setLinkMotion] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteMotion, setNoteMotion] = useState("");
  const [addMessage, setAddMessage] = useState<string | null>(null);

  const panelDuration = studioMotionDuration("panel", reducedMotion);
  const motionStyle = {
    "--motion-instant": `${studioMotionDuration("instant", reducedMotion)}ms`,
    "--motion-feedback": `${studioMotionDuration("feedback", reducedMotion)}ms`,
    "--motion-menu": `${studioMotionDuration("menu", reducedMotion)}ms`,
    "--motion-panel": `${panelDuration}ms`,
    "--motion-dialog": `${studioMotionDuration("dialog", reducedMotion)}ms`,
  } as CSSProperties;
  const selected = sampleCards.find((card) => card.id === selectedId) ?? null;
  const selectedDraft = selected === null ? null : (drafts[selected.id] ?? null);
  const needle = submitted.trim().toLowerCase();
  const visible = sampleCards.filter((card) => {
    if (kind !== "all" && card.kind !== kind) return false;
    if (needle === "") return true;
    return `${card.title} ${card.creator} ${card.observations}`.toLowerCase().includes(needle);
  });
  const addDirty =
    imageTitle !== "" ||
    imageFileName !== null ||
    linkUrl !== "" ||
    linkTitle !== "" ||
    linkMotion !== "" ||
    noteTitle !== "" ||
    noteBody !== "" ||
    noteMotion !== "";
  const filtersActive = kind !== "all" || submitted !== "";

  function repeatPanel(): void {
    setPanelOpen(false);
    requestAnimationFrame(() => setPanelOpen(true));
  }

  function openDetails(id: string): void {
    setSelectedId(id);
    setDetailsOpen(true);
  }

  function closeDetails(): void {
    setSelectedId(null);
    setDetailsOpen(false);
  }

  function editDraft(id: string, patch: Partial<Draft>): void {
    setDrafts((current) => {
      const existing = current[id];
      if (existing === undefined) return current;
      return { ...current, [id]: { ...existing, ...patch } };
    });
    if (id === "north") setSavedId(null);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitted(query);
  }

  function clearFilters(): void {
    setQuery("");
    setSubmitted("");
    setKind("all");
  }

  function showInspectorState(next: SaveState): void {
    setSelectedId("north");
    setDetailsOpen(true);
    setNorthSave(next);
  }

  function clearAddDraft(): void {
    setImageTitle("");
    setImageFileName(null);
    setLinkUrl("");
    setLinkTitle("");
    setLinkMotion("");
    setNoteTitle("");
    setNoteBody("");
    setNoteMotion("");
    setAddMessage(null);
    setAddTab("image");
  }

  function requestClose(): void {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (dialog === "add" && addDirty) {
      setConfirmDiscard(true);
      return;
    }
    setDialog(null);
    setConfirmDiscard(false);
    setAddMessage(null);
  }

  function discardAdd(): void {
    clearAddDraft();
    setConfirmDiscard(false);
    setDialog(null);
  }

  function submitAdd(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAddMessage("This sample does not add a reference.");
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>): void {
    const order: AddTab[] = ["image", "link", "note"];
    const index = order.indexOf(addTab);
    let next: AddTab | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = order[(index + 1) % order.length] ?? null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = order[(index - 1 + order.length) % order.length] ?? null;
    if (event.key === "Home") next = order[0] ?? null;
    if (event.key === "End") next = order[order.length - 1] ?? null;
    if (next === null) return;
    event.preventDefault();
    setAddTab(next);
    document.getElementById(`sample-tab-${next}`)?.focus();
  }

  return (
    <div
      className="studio-preview studio-sample"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-plain={plain ? "true" : "false"}
      data-details-open={detailsOpen ? "true" : "false"}
      data-studio-theme={themeChoice === "system" ? undefined : themeChoice}
      style={motionStyle}
    >
      <header className="sample-topbar">
        <p className="sample-wordmark">Reference Studio</p>
        <label className="sample-switcher">
          <span className="visually-hidden">Project</span>
          <select value={project} onChange={(event) => setProject(event.target.value)}>
            <option>Atlas</option>
            <option>Harbor</option>
          </select>
        </label>
        <div className="sample-views" role="group" aria-label="View">
          <button type="button" aria-pressed="true">Collection</button>
        </div>
        <details className="sample-connection">
          <summary>
            <span className={`sample-dot sample-dot-${status.state}`} aria-hidden="true" />
            {connectionLabel[status.state]}
          </summary>
          <div className="sample-diagnostics">
            <dl>
              <div>
                <dt>Contract</dt>
                <dd>{status.contractVersion ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>Updates</dt>
                <dd>{status.live ? "Listening" : "Not listening"}</dd>
              </div>
            </dl>
            <p>{status.detail}</p>
            <button type="button" onClick={status.onRetry}>Check again</button>
          </div>
        </details>
      </header>
      {status.state === "reconnecting" ? (
        <p className="sample-banner" role="status">Current data may be stale. The page will refresh when the service returns.</p>
      ) : null}
      {status.state === "unavailable" ? (
        <p className="sample-banner" role="status">{status.detail}</p>
      ) : null}
      <div className="sample-frame">
        <nav className="sample-rail" aria-label="Projects">
          <div className="sample-rail-heading">
            <p className="sample-project-name">{project}</p>
            <StudioMenu
              label="More"
              items={[{ id: "details", label: "Project details", onSelect: () => setProjectNote("Project details stay in this sample.") }]}
            />
          </div>
          <ul>
            {["Atlas", "Harbor"].map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={project === name ? "is-selected" : undefined}
                  aria-current={project === name ? "true" : undefined}
                  onClick={() => setProject(name)}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
          {projectNote !== null ? <p className="sample-note">{projectNote}</p> : null}
        </nav>
        <main className="sample-workspace">
          <span className="sample-joint sample-joint-nw" aria-hidden="true" />
          <span className="sample-joint sample-joint-ne" aria-hidden="true" />
          <span className="sample-joint sample-joint-sw" aria-hidden="true" />
          <span className="sample-joint sample-joint-se" aria-hidden="true" />
          <div className="sample-toolbar">
            <div className="sample-heading">
              <span className="sample-index" aria-hidden="true">[01]</span>
              <h1>References</h1>
              <span className="sample-count">{emptyCollection ? 0 : visible.length}</span>
              <pre className="sample-texture" aria-hidden="true">{" .  .   \n        \n   :    \n        "}</pre>
            </div>
            <button type="button" className="is-primary sample-add" onClick={() => { setConfirmDiscard(false); setDialog("add"); }}>
              <PlusIcon />
              Add reference
            </button>
            <form className="sample-search" onSubmit={submitSearch}>
              <SearchIcon />
              <input
                aria-label="Search references"
                value={query}
                placeholder="north, stone"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query !== "" ? (
                <button type="button" className="is-ghost sample-clear" onClick={() => { setQuery(""); setSubmitted(""); }}>
                  Clear
                </button>
              ) : null}
            </form>
            <details className="sample-disclosure">
              <summary>Filter{kind !== "all" ? " · 1" : ""}</summary>
              <div className="sample-filter-row" role="group" aria-label="Kind">
                {(["all", "image", "link", "note"] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                    {value === "all" ? "All" : kindLabel(value)}
                  </button>
                ))}
              </div>
            </details>
            {filtersActive ? (
              <button type="button" className="is-ghost" onClick={clearFilters}>Clear filters</button>
            ) : null}
          </div>
          {emptyCollection ? (
            <EmptyCollection onAdd={() => setDialog("add")} />
          ) : visible.length === 0 ? (
            <div className="sample-empty">
              <h2>No matching references</h2>
              <p>Nothing matches the current search or filter.</p>
              <button type="button" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
            <div className="sample-grid">
              {visible.map((card) => {
                const draft = drafts[card.id];
                if (draft === undefined) return null;
                return (
                  <SampleCardView
                    key={card.id}
                    card={card}
                    draft={draft}
                    selected={selectedId === card.id}
                    loading={showLoading && card.id === "north"}
                    onOpen={() => openDetails(card.id)}
                  />
                );
              })}
            </div>
          )}
        </main>
        <aside className="sample-inspector" aria-label="Inspector">
          {selected === null || selectedDraft === null ? (
            <div className="sample-placeholder">
              <h2>Select a reference to inspect</h2>
              <p>Choose Open details on a reference. Selection stays in this sample.</p>
            </div>
          ) : (
            <Inspector
              card={selected}
              draft={selectedDraft}
              project={project}
              saveState={selected.id === "north" ? northSave : "saved"}
              showStatus={selected.id === "north" ? northSave === "saved" : savedId === selected.id}
              onChange={(patch) => editDraft(selected.id, patch)}
              onClose={closeDetails}
              onSave={() => {
                if (selected.id === "north") setNorthSave("saved");
                else setSavedId(selected.id);
              }}
              onReview={() => setNorthSave("saved")}
            />
          )}
        </aside>
      </div>
      <section className="sample-controls" aria-label="Preview controls">
        <div className="sample-controls-heading">
          <h2>Preview controls</h2>
          <p>These controls change the sample only. They do not write to a project or approve a direction.</p>
        </div>
        <label className="preview-switch">
          <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />
          Preview reduced motion
        </label>
        <div className="sample-control-row" role="group" aria-label="Theme">
          {(["system", "light", "dark"] as const).map((choice) => (
            <button key={choice} type="button" aria-pressed={themeChoice === choice} onClick={() => setThemeChoice(choice)}>
              {choice === "system" ? "System" : choice === "light" ? "Light" : "Dark"}
            </button>
          ))}
          <button type="button" aria-pressed={plain} onClick={() => setPlain((current) => !current)}>Plain</button>
          <button type="button" aria-pressed={emptyCollection} onClick={() => setEmptyCollection((current) => !current)}>
            Empty collection
          </button>
          <button type="button" aria-pressed={showLoading} onClick={() => setShowLoading((current) => !current)}>
            Loading card
          </button>
        </div>
        <div className="sample-control-row" role="group" aria-label="Inspector state">
          <button type="button" aria-pressed={northSave === "conflict"} onClick={() => showInspectorState("conflict")}>Conflict</button>
          <button type="button" aria-pressed={northSave === "error"} onClick={() => showInspectorState("error")}>Save failed</button>
          <button type="button" aria-pressed={northSave === "saving"} onClick={() => showInspectorState("saving")}>Saving state</button>
          <button type="button" aria-pressed={northSave === "saved"} onClick={() => showInspectorState("saved")}>Saved state</button>
        </div>
        <div className="sample-field">
          <label htmlFor="sample-invalid">Source</label>
          <input id="sample-invalid" aria-invalid="true" aria-describedby="sample-invalid-error" defaultValue="not a link" />
          <p id="sample-invalid-error" className="sample-error">Enter a full http(s) link.</p>
        </div>
        <div className="sample-control-row">
          <button type="button" disabled>Disabled</button>
          <button type="button" aria-busy="true">Saving</button>
          <button type="button" onClick={() => setPanelOpen(true)}>Open panel</button>
          <button type="button" onClick={() => setPanelOpen(false)}>Close panel</button>
          <button type="button" onClick={repeatPanel}>Repeat panel</button>
          <button type="button" onClick={() => { setConfirmDiscard(false); setDialog("note"); }}>Open dialog</button>
          <StudioMenu
            label="Role"
            items={[
              { id: "inspiration", label: "Inspiration", onSelect: () => setMenuChoice("Inspiration") },
              { id: "candidate", label: "Candidate", onSelect: () => setMenuChoice("Candidate") },
            ]}
          />
          <span className="sample-meta">Sample role: {menuChoice}</span>
          <a href="#/">Back to projects</a>
        </div>
      </section>
      <div className={panelOpen ? "studio-panel is-open" : "studio-panel"} role="region" aria-label="Example panel" inert={!panelOpen}>
        <p>Closing this panel while it is opening reverses the motion.</p>
        <button type="button" onClick={() => setPanelOpen(false)}>Close</button>
      </div>
      <StudioDialog
        open={dialog !== null}
        title={confirmDiscard ? "Discard changes" : dialog === "add" ? "Add reference" : "Reference note"}
        onClose={requestClose}
      >
        {confirmDiscard ? (
          <>
            <p>The reference you started has not been added.</p>
            <div className="form-actions">
              <button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              <button type="button" onClick={discardAdd}>Discard changes</button>
            </div>
          </>
        ) : dialog === "add" ? (
          <form onSubmit={submitAdd}>
            <div className="sample-tabs" role="tablist" aria-label="Reference kind">
              {(["image", "link", "note"] as const).map((tab) => (
                <button
                  key={tab}
                  id={`sample-tab-${tab}`}
                  type="button"
                  role="tab"
                  aria-selected={addTab === tab}
                  aria-controls={`sample-panel-${tab}`}
                  tabIndex={addTab === tab ? 0 : -1}
                  onClick={() => setAddTab(tab)}
                  onKeyDown={onTabKey}
                >
                  {kindLabel(tab)}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="sample-panel-image" aria-labelledby="sample-tab-image" hidden={addTab !== "image"}>
              <div className="sample-field">
                <label htmlFor="sample-image-file">Image file</label>
                <input
                  id="sample-image-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setImageFileName(event.currentTarget.files?.[0]?.name ?? null)}
                />
                {imageFileName !== null ? <p className="sample-note">{imageFileName}</p> : null}
              </div>
              <Field id="sample-image-title" label="Title" optional value={imageTitle} onChange={setImageTitle} />
            </div>
            <div role="tabpanel" id="sample-panel-link" aria-labelledby="sample-tab-link" hidden={addTab !== "link"}>
              <Field id="sample-link-url" label="URL" value={linkUrl} onChange={setLinkUrl} />
              <Field id="sample-link-title" label="Title" optional value={linkTitle} onChange={setLinkTitle} />
              <MotionField id="sample-link-motion" value={linkMotion} onChange={setLinkMotion} />
            </div>
            <div role="tabpanel" id="sample-panel-note" aria-labelledby="sample-tab-note" hidden={addTab !== "note"}>
              <Field id="sample-note-title" label="Title" value={noteTitle} onChange={setNoteTitle} />
              <div className="sample-field">
                <label htmlFor="sample-note-body">Note</label>
                <textarea id="sample-note-body" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} />
              </div>
              <MotionField id="sample-note-motion" value={noteMotion} onChange={setNoteMotion} />
            </div>
            <div className="form-actions">
              <button type="submit" className="is-primary">Add {kindLabel(addTab).toLowerCase()}</button>
            </div>
            {addMessage !== null ? <p className="sample-note" role="status">{addMessage}</p> : null}
          </form>
        ) : (
          <p>Dialogs take focus and return it on close. Escape closes this one.</p>
        )}
      </StudioDialog>
    </div>
  );
}

function SampleCardView({
  card,
  draft,
  selected,
  loading,
  onOpen,
}: {
  card: SampleCard;
  draft: Draft;
  selected: boolean;
  loading: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={selected ? "sample-card is-selected" : "sample-card"} aria-busy={loading ? true : undefined} data-image={card.missing ? "missing" : card.image ? "ready" : "none"}>
      <div className="sample-media">
        {loading ? (
          <>
            <span className="visually-hidden">Loading</span>
            <pre className="sample-skeleton-glyphs" aria-hidden="true">{skeletonGlyphs}</pre>
          </>
        ) : card.missing ? (
          <div className="sample-missing">
            <MissingIcon />
            <p>Image unavailable</p>
          </div>
        ) : card.image ? (
          <img src={card.image} alt={`Specimen image, ${card.title}`} />
        ) : (
          <p className="sample-kind-mark">{kindLabel(card.kind)}</p>
        )}
      </div>
      <p className="sample-kicker">{kindLabel(card.kind)} · {roleLabel(draft.role)}</p>
      <p className="sample-card-title">{card.title}</p>
      {card.kind === "link" ? (
        <a className="sample-url" href={card.source} target="_blank" rel="noreferrer">
          {card.source}
          <ExternalIcon />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      ) : card.kind === "note" ? (
        <p className="sample-excerpt">{card.observations}</p>
      ) : (
        <p className="sample-excerpt">{card.creator === "" ? "Source unknown" : card.creator}</p>
      )}
      <button type="button" onClick={onOpen} aria-label={`Open details for ${card.title}`}>Open details</button>
    </article>
  );
}

function Inspector({
  card,
  draft,
  project,
  saveState,
  showStatus,
  onChange,
  onClose,
  onSave,
  onReview,
}: {
  card: SampleCard;
  draft: Draft;
  project: string;
  saveState: SaveState;
  showStatus: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onClose: () => void;
  onSave: () => void;
  onReview: () => void;
}) {
  const titleId = `shared-title-${card.id}`;
  const sourceId = `shared-source-${card.id}`;
  const creatorId = `shared-creator-${card.id}`;
  const tagsId = `shared-tags-${card.id}`;
  const observationsId = `shared-observations-${card.id}`;
  const roleId = `placement-role-${card.id}`;
  const usageId = `placement-usage-${card.id}`;
  const saving = card.id === "north" && saveState === "saving";

  return (
    <>
      <header className="sample-inspector-header">
        <div>
          <p className="sample-kicker">{kindLabel(card.kind)} · {roleLabel(draft.role)}</p>
          <h2>{draft.title}</h2>
        </div>
        <button type="button" className="sample-back is-ghost" onClick={onClose}>Back</button>
        <button type="button" className="sample-close is-ghost" onClick={onClose}>Close</button>
      </header>
      <div className="sample-inspector-body">
        <div className="sample-preview-frame">
          {card.missing ? (
            <div className="sample-missing">
              <MissingIcon />
              <p>Image unavailable</p>
            </div>
          ) : card.image ? (
            <img src={card.image} alt="" />
          ) : (
            <p className="sample-kind-mark">{kindLabel(card.kind)}</p>
          )}
        </div>
        {card.source !== "" ? (
          <a className="sample-url" href={card.source} target="_blank" rel="noreferrer">
            {card.source}
            <ExternalIcon />
          </a>
        ) : (
          <p className="sample-note">Source unknown</p>
        )}
        <section data-fields="shared">
          <h3>Shared reference</h3>
          <p className="sample-note">Shared across projects. This sample keeps the draft locally.</p>
          <Field id={titleId} label="Title" value={draft.title} onChange={(title) => onChange({ title })} />
          <Field id={sourceId} label="Source" value={draft.source} onChange={(source) => onChange({ source })} />
          <Field id={creatorId} label="Creator" value={draft.creator} onChange={(creator) => onChange({ creator })} />
          <Field id={tagsId} label="Tags" value={draft.tags} onChange={(tags) => onChange({ tags })} />
          <div className="sample-field">
            <label htmlFor={observationsId}>Observations</label>
            <textarea id={observationsId} value={draft.observations} onChange={(event) => onChange({ observations: event.target.value })} />
          </div>
        </section>
        <section data-fields="placement">
          <h3>Use in {project}</h3>
          <p className="sample-note">Role, usage notes, and crop belong to this project.</p>
          <div className="sample-field">
            <label htmlFor={roleId}>Role</label>
            <select
              id={roleId}
              value={draft.role}
              disabled={saving}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "inspiration" || value === "candidate" || value === "approved") onChange({ role: value });
              }}
            >
              <option value="inspiration">Inspiration</option>
              <option value="candidate">Candidate</option>
              <option value="approved">Approved asset</option>
            </select>
          </div>
          {draft.role === "approved" ? (
            <p className="sample-note">Approved marks the asset for this project. It does not approve a direction.</p>
          ) : null}
          <div className="sample-field">
            <label htmlFor={usageId}>Usage notes</label>
            <textarea id={usageId} value={draft.usage} disabled={saving} onChange={(event) => onChange({ usage: event.target.value })} />
          </div>
          {card.kind === "image" ? (
            <div className="sample-crop">
              <p className="sample-note">Crop is a fraction of the original image, from the top left.</p>
              <CropField id={`crop-x-${card.id}`} label="Crop x" value={draft.cropX} disabled={saving} onChange={(cropX) => onChange({ cropX })} />
              <CropField id={`crop-y-${card.id}`} label="Crop y" value={draft.cropY} disabled={saving} onChange={(cropY) => onChange({ cropY })} />
              <CropField id={`crop-width-${card.id}`} label="Crop width" value={draft.cropWidth} disabled={saving} onChange={(cropWidth) => onChange({ cropWidth })} />
              <CropField id={`crop-height-${card.id}`} label="Crop height" value={draft.cropHeight} disabled={saving} onChange={(cropHeight) => onChange({ cropHeight })} />
            </div>
          ) : null}
        </section>
        <details className="sample-provenance">
          <summary>Provenance</summary>
          <p className="sample-meta">Revision 4 · Specimen · Not a project record</p>
        </details>
      </div>
      <footer className="sample-inspector-footer">
        {card.id === "north" && saveState === "conflict" ? (
          <p className="sample-conflict" role="status">This placement changed in another session. Your draft is still here.</p>
        ) : null}
        {card.id === "north" && saveState === "error" ? (
          <p className="sample-error" role="status">Save failed. The draft is still here.</p>
        ) : null}
        <div className="form-actions">
          {card.id === "north" && saveState === "conflict" ? (
            <button type="button" onClick={onReview}>Review latest</button>
          ) : null}
          <button type="button" className="is-primary sample-save" aria-busy={saving ? true : undefined} disabled={saving} onClick={onSave}>
            {saving ? "Saving" : card.id === "north" && saveState === "conflict" ? "Save draft" : "Save use"}
          </button>
          {showStatus && saveState === "saved" ? (
            <p className="sample-saved" role="status">Saved</p>
          ) : null}
        </div>
      </footer>
    </>
  );
}

function EmptyCollection({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="sample-empty">
      <pre className="sample-motif" aria-hidden="true">{emptyMotif}</pre>
      <h2>Add your first reference</h2>
      <p>An image, a link, or a note can start the collection.</p>
      <button type="button" className="is-primary" onClick={onAdd}>Add reference</button>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  optional = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="sample-field">
      <label htmlFor={id}>
        {label}
        {optional ? <span className="sample-optional"> Optional</span> : null}
      </label>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function CropField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="sample-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function MotionField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <details className="sample-disclosure">
      <summary>Motion details</summary>
      <div className="sample-field">
        <label htmlFor={id}>Observed motion</label>
        <textarea id={id} value={value} placeholder="0:12–0:18, slow pan" onChange={(event) => onChange(event.target.value)} />
        <p className="sample-note">Optional. Leave this blank when you did not observe motion.</p>
      </div>
    </details>
  );
}

function PlusIcon() {
  return (
    <svg className="sample-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="sample-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="sample-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4H4.5A1.5 1.5 0 0 0 3 5.5v6A1.5 1.5 0 0 0 4.5 13h6a1.5 1.5 0 0 0 1.5-1.5V10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 8 13 3M9 3h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MissingIcon() {
  return (
    <svg className="sample-missing-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 13.5 9.2 10l1.6 2 1.4-1.5L15 13.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 4 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
