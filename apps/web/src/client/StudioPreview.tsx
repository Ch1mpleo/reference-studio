import { useState, type FormEvent, type KeyboardEvent } from "react";
import { StudioButton } from "./StudioButton.js";
import { StudioField } from "./StudioField.js";
import { StudioReferenceCard } from "./StudioReferenceCard.js";
import { StudioSelect } from "./StudioSelect.js";
import { StudioDialog } from "./StudioDialog.js";
import { StudioInspector } from "./StudioInspector.js";
import { StudioMenu } from "./StudioMenu.js";
import { StudioLoadingPreview } from "./StudioLoadingPreview.js";
import { StudioCanvasPreview } from "./StudioCanvasPreview.js";
import type { StudioLoadingMode, StudioLoadingState } from "./StudioLoadingMedia.js";
import { StudioLoadingRegion } from "./StudioLoadingRegion.js";
import { useStudioPreviewRequest } from "./useStudioPreviewRequest.js";
import { STUDIO_LOADING_DEFAULTS, type StudioLoadingOptions } from "./studioLoadingOptions.js";
import { isPreviewSurfaceClick } from "./studioPreviewActivation.js";
import { harborArt, northStairArt } from "./specimenArt.js";
import { studioMotionStyle, useStudioReducedMotion } from "./studioMotion.js";
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
  const [kind, setKind] = useState<KindFilter>("all");
  const [emptyCollection, setEmptyCollection] = useState(false);
  const [loadingState, setLoadingState] = useState<StudioLoadingState>("loaded");
  const [loadingMode, setLoadingMode] = useState<StudioLoadingMode>("reveal");
  const [loadingOptions, setLoadingOptions] = useState<StudioLoadingOptions>({ ...STUDIO_LOADING_DEFAULTS });
  const [replay, setReplay] = useState(0);
  const [previewDelay, setPreviewDelay] = useState(1200);
  const collectionRequest = useStudioPreviewRequest({ query: "", kind: "all" as KindFilter }, previewDelay);
  const detailRequest = useStudioPreviewRequest<string | null>("north", previewDelay);
  const dialogRequest = useStudioPreviewRequest<string | null>(null, previewDelay, false);
  const [addTab, setAddTab] = useState<AddTab>("image");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkMotion, setLinkMotion] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteMotion, setNoteMotion] = useState("");
  const [addMessage, setAddMessage] = useState<string | null>(null);

  const effectiveReducedMotion = useStudioReducedMotion(reducedMotion);
  const motionStyle = studioMotionStyle(effectiveReducedMotion);
  const selected = sampleCards.find((card) => card.id === selectedId) ?? null;
  const selectedDraft = selected === null ? null : (drafts[selected.id] ?? null);
  const needle = collectionRequest.value.query.trim().toLowerCase();
  const visible = sampleCards.filter((card) => {
    if (collectionRequest.value.kind !== "all" && card.kind !== collectionRequest.value.kind) return false;
    if (needle === "") return true;
    return `${card.title} ${card.creator} ${card.observations} ${card.source} ${card.tags}`.toLowerCase().includes(needle);
  });
  const addDirty =
    linkUrl !== "" ||
    linkTitle !== "" ||
    linkMotion !== "" ||
    noteTitle !== "" ||
    noteBody !== "" ||
    noteMotion !== "";
  const filtersActive = kind !== "all" || query !== "";

  function repeatPanel(): void {
    setPanelOpen(false);
    requestAnimationFrame(() => setPanelOpen(true));
  }

  function openDetails(id: string): void {
    setSelectedId(id);
    setDetailsOpen(true);
    detailRequest.load(id);
  }

  function closeDetails(): void {
    if (window.matchMedia("(min-width: 960px)").matches) setSelectedId(null);
    setDetailsOpen(false);
    detailRequest.cancel();
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
    collectionRequest.load({ query, kind });
  }

  function clearFilters(): void {
    setQuery("");
    setKind("all");
    collectionRequest.load({ query: "", kind: "all" });
  }

  function selectProject(name: string): void {
    setProject(name);
    collectionRequest.load({ query, kind });
    if (selectedId !== null) detailRequest.load(selectedId);
  }

  function openDialog(next: "add" | "note"): void {
    setConfirmDiscard(false);
    setDialog(next);
    dialogRequest.load(next);
  }

  function reloadScreen(): void {
    collectionRequest.load({ query, kind });
    if (selectedId !== null) detailRequest.load(selectedId);
    setReplay((current) => current + 1);
  }

  function changeLoadingOptions(next: StudioLoadingOptions): void {
    setLoadingOptions(next);
    reloadScreen();
  }

  function changeLoadingMode(next: StudioLoadingMode): void {
    setLoadingMode(next);
    reloadScreen();
  }

  function showInspectorState(next: SaveState): void {
    setSelectedId("north");
    setDetailsOpen(true);
    setNorthSave(next);
  }

  function clearAddDraft(): void {
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
      dialogRequest.cancel();
      return;
    }
    setDialog(null);
    dialogRequest.cancel();
    setConfirmDiscard(false);
    setAddMessage(null);
  }

  function discardAdd(): void {
    clearAddDraft();
    setConfirmDiscard(false);
    setDialog(null);
    dialogRequest.cancel();
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
    dialogRequest.load(`add-${next}`);
    document.getElementById(`sample-tab-${next}`)?.focus();
  }

  return (
    <div
      className="studio-ui studio-preview studio-sample"
      data-reduced-motion={effectiveReducedMotion ? "true" : "false"}
      data-plain={plain ? "true" : "false"}
      data-details-open={detailsOpen ? "true" : "false"}
      data-studio-theme={themeChoice === "system" ? undefined : themeChoice}
      style={motionStyle}
    >
      <header className="sample-topbar">
        <p className="sample-wordmark">Reference Studio</p>
        <div className="sample-switcher">
          <StudioSelect
            label="Project"
            value={project}
            options={[
              { value: "Atlas", label: "Atlas" },
              { value: "Harbor", label: "Harbor" },
            ]}
            onChange={selectProject}
          />
        </div>
        <div className="sample-views" role="group" aria-label="View">
          <StudioButton type="button" aria-pressed="true" onClick={() => collectionRequest.load({ query, kind })}>Collection</StudioButton>
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
            <StudioButton type="button" onClick={status.onRetry}>Check again</StudioButton>
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
            <StudioLoadingRegion options={loadingOptions} variant="text" pending={collectionRequest.pending} mode={loadingMode} reducedMotion={effectiveReducedMotion} plain={plain} replay={replay + collectionRequest.revision}>
              <p className="sample-project-name" data-studio-reveal>{project}</p>
            </StudioLoadingRegion>
            <StudioMenu
              label="More"
              items={[{ id: "details", label: "Project details", onSelect: () => setProjectNote("Project details stay in this sample.") }]}
            />
          </div>
          <ul>
            {["Atlas", "Harbor"].map((name) => (
              <li key={name}>
                <StudioButton
                  type="button"
                  className={project === name ? "is-selected" : undefined}
                  aria-current={project === name ? "true" : undefined}
                  onClick={() => selectProject(name)}
                >
                  {name}
                </StudioButton>
              </li>
            ))}
          </ul>
          {projectNote !== null ? <p className="studio-help">{projectNote}</p> : null}
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
              <span className="sample-count" aria-busy={collectionRequest.pending || undefined}>{collectionRequest.pending ? "…" : emptyCollection ? 0 : visible.length}</span>
              <pre className="sample-texture" aria-hidden="true">{" .  .   \n        \n   :    \n        "}</pre>
            </div>
            <StudioButton type="button" variant="primary" className="sample-add" onClick={() => openDialog("add")}>
              <PlusIcon />
              Add reference
            </StudioButton>
            <form className="sample-search" onSubmit={submitSearch}>
              <SearchIcon />
              <input
                aria-label="Search references"
                value={query}
                placeholder="Search title, creator, tags, source…"
                onChange={(event) => { setQuery(event.target.value); collectionRequest.load({ query: event.target.value, kind }); }}
              />
              {query !== "" ? (
                <StudioButton type="button" variant="ghost" className="sample-clear" onClick={() => { setQuery(""); collectionRequest.load({ query: "", kind }); }}>
                  Clear
                </StudioButton>
              ) : null}
            </form>
            <div className="sample-views sample-filters" role="group" aria-label="Kind">
              {(["all", "image", "link", "note"] as const).map((value) => (
                <StudioButton key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); collectionRequest.load({ query, kind: value }); }}>
                  {value === "all" ? "All" : kindLabel(value)}
                </StudioButton>
              ))}
            </div>
            {filtersActive ? (
              <StudioButton type="button" variant="ghost" onClick={clearFilters}>Clear filters</StudioButton>
            ) : null}
          </div>
          <div className="sample-demo-toolbar" aria-label="Screen loading preview">
            <span className="studio-meta">Demo latency</span>
            <StudioSelect label="Demo latency" value={String(previewDelay)} options={[
              { value: "0", label: "No delay" }, { value: "600", label: "600 ms" },
              { value: "1200", label: "1.2 seconds" }, { value: "2400", label: "2.4 seconds" },
            ]} onChange={(value) => setPreviewDelay(Number(value))} />
            <StudioButton onClick={reloadScreen}>Reload screen sample</StudioButton>
            <p className="studio-help">Preview only: search, filters, projects, details, and dialogs simulate this wait.</p>
          </div>
          <p className="sample-loading-status studio-meta" role="status">{collectionRequest.pending ? "Loading sample results…" : `${emptyCollection ? 0 : visible.length} sample references`}</p>
          {emptyCollection ? (
            <EmptyCollection onAdd={() => openDialog("add")} />
          ) : visible.length === 0 && !collectionRequest.pending ? (
            <div className="sample-empty">
              <h2>No matching references</h2>
              <p>Nothing matches the current search or filter.</p>
              <StudioButton type="button" onClick={clearFilters}>Clear filters</StudioButton>
            </div>
          ) : (
            <div className="sample-grid" aria-busy={collectionRequest.pending || loadingState === "loading" || undefined}>
              {(visible.length === 0 && collectionRequest.pending ? sampleCards.slice(0, 3) : visible).map((card) => {
                const draft = drafts[card.id];
                if (draft === undefined) return null;
                return (
                  <SampleCardView
                    key={card.id}
                    card={card}
                    draft={draft}
                    selected={selectedId === card.id}
                    loadingState={collectionRequest.pending ? "loading" : loadingState}
                    placeholder={visible.length === 0 && collectionRequest.pending}
                    loadingMode={loadingMode}
                    replay={replay + collectionRequest.revision}
                    reducedMotion={effectiveReducedMotion}
                    plain={plain}
                    onImageError={() => setLoadingState("error")}
                    onOpen={() => openDetails(card.id)}
                    options={loadingOptions}
                    previewDelay={previewDelay}
                  />
                );
              })}
            </div>
          )}
        </main>
        <StudioInspector open={detailsOpen} retainContent closeControl="provided" onClose={closeDetails}>
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
              pending={detailsOpen && detailRequest.pending}
              loadingMode={detailsOpen ? loadingMode : "instant"}
              reducedMotion={effectiveReducedMotion}
              plain={plain}
              replay={replay + detailRequest.revision}
              options={loadingOptions}
              onReload={() => { if (selectedId !== null) detailRequest.load(selectedId); }}
            />
          )}
        </StudioInspector>
      </div>
      <section className="sample-controls" aria-label="Preview controls">
        <div className="sample-controls-heading">
          <p className="studio-kicker">[02] Interface system</p>
          <h2>Preview controls</h2>
          <p>Try the shared controls and their states. These samples do not write to a project or approve a direction.</p>
        </div>
        <div className="sample-specimen-grid">
          <section className="sample-control-section" aria-label="Appearance samples">
            <h3>Appearance</h3>
            <div className="sample-views" role="group" aria-label="Theme">
              {(["system", "light", "dark"] as const).map((choice) => (
                <StudioButton key={choice} aria-pressed={themeChoice === choice} onClick={() => setThemeChoice(choice)}>
                  {choice === "system" ? "System" : choice === "light" ? "Light" : "Dark"}
                </StudioButton>
              ))}
            </div>
            <label className="preview-switch">
              <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />
              Preview reduced motion
            </label>
            <p className="studio-help">The operating system preference also applies. Hover changes the surface; cards stay in place.</p>
            <div className="sample-control-row" role="group" aria-label="Collection state">
              <StudioButton aria-pressed={plain} onClick={() => setPlain((current) => !current)}>Plain</StudioButton>
              <StudioButton aria-pressed={emptyCollection} onClick={() => setEmptyCollection((current) => !current)}>Empty collection</StudioButton>
              <StudioButton aria-pressed={loadingState === "loading"} onClick={() => setLoadingState((current) => current === "loading" ? "loaded" : "loading")}>Loading card</StudioButton>
            </div>
          </section>
          <section className="sample-control-section" aria-label="Feedback samples">
            <h3>Feedback</h3>
            <div className="sample-control-row" role="group" aria-label="Inspector state">
              <StudioButton onClick={() => showInspectorState("conflict")}>Conflict</StudioButton>
              <StudioButton onClick={() => showInspectorState("error")}>Save failed</StudioButton>
              <StudioButton onClick={() => showInspectorState("saving")}>Saving state</StudioButton>
              <StudioButton onClick={() => showInspectorState("saved")}>Saved state</StudioButton>
            </div>
            <StudioField id="sample-invalid" label="Source" defaultValue="not a link" error="Enter a full http(s) link." onChange={() => undefined} />
            <div className="sample-control-row">
              <StudioButton disabled>Disabled</StudioButton>
              <StudioButton busy>Saving</StudioButton>
            </div>
          </section>
          <StudioLoadingPreview state={loadingState} mode={loadingMode} replay={replay} reducedMotion={effectiveReducedMotion} plain={plain}
            onState={setLoadingState} onMode={changeLoadingMode} onReplay={() => setReplay((current) => current + 1)} onOpen={() => openDetails("north")}
            options={loadingOptions} onOptions={changeLoadingOptions} previewDelay={previewDelay} />
          <StudioCanvasPreview />
          <section className="sample-control-section sample-control-wide" aria-label="Overlay samples">
            <h3>Overlays &amp; interruption</h3>
            <p className="studio-help">Open and close without waiting. Menus use arrow keys; dialogs return focus to their opener.</p>
            <div className="sample-control-row">
              <StudioButton onClick={() => setPanelOpen(true)}>Open panel</StudioButton>
              <StudioButton onClick={() => setPanelOpen(false)}>Close panel</StudioButton>
              <StudioButton onClick={repeatPanel}>Repeat panel</StudioButton>
              <StudioButton onClick={() => openDialog("note")}>Open dialog</StudioButton>
              <StudioMenu label="Role" items={[
                { id: "inspiration", label: "Inspiration", onSelect: () => setMenuChoice("Inspiration") },
                { id: "candidate", label: "Candidate", onSelect: () => setMenuChoice("Candidate") },
              ]} />
              <span className="studio-meta">Sample role: {menuChoice}</span>
            </div>
            <div className={panelOpen ? "studio-panel is-open" : "studio-panel"} inert={!panelOpen}>
              <div className="studio-panel-content" role="region" aria-label="Example panel">
                <p>Closing this panel while it is opening reverses the motion.</p>
                <StudioButton onClick={() => setPanelOpen(false)}>Close</StudioButton>
              </div>
            </div>
          </section>
        </div>
        <a className="sample-back-link" href="#/">Back to projects</a>
      </section>
      <StudioDialog
        open={dialog !== null}
        title={confirmDiscard ? "Discard changes" : dialog === "add" ? "Add reference" : "Reference note"}
        onClose={requestClose}
        onPreviewReload={confirmDiscard ? undefined : () => dialogRequest.load(dialog ?? "note")}
        focusKey={confirmDiscard ? "discard" : dialog ?? "closed"}
        description={confirmDiscard ? "The reference you started has not been added." : dialog === "add" ? "Collect an image, link, or note. Preview only; nothing is added to a project." : "A sample of Studio's shared dialog."}
        footer={confirmDiscard ? (
          <>
            <StudioButton data-dialog-initial-focus onClick={() => setConfirmDiscard(false)}>Keep editing</StudioButton>
            <StudioButton variant="danger" onClick={discardAdd}>Discard changes</StudioButton>
          </>
        ) : dialog === "add" ? (
          <>
            <StudioButton variant="ghost" onClick={requestClose}>Cancel</StudioButton>
            <StudioButton variant="ghost" onClick={() => dialogRequest.load(`add-${addTab}`)}>Reload sample</StudioButton>
            <StudioButton type="submit" form="sample-add-form" variant="primary" disabled={dialogRequest.pending}><PlusIcon />Add {kindLabel(addTab).toLowerCase()}</StudioButton>
          </>
        ) : <><StudioButton variant="ghost" onClick={() => dialogRequest.load("note")}>Reload sample</StudioButton><StudioButton variant="primary" onClick={requestClose}>Done</StudioButton></>}
      >
        {confirmDiscard ? null : dialog === "add" ? (
          <form id="sample-add-form" className="studio-dialog-form" onSubmit={submitAdd} aria-busy={dialogRequest.pending || undefined}>
            <div className="sample-tabs" role="tablist" aria-label="Reference kind">
              {(["image", "link", "note"] as const).map((tab) => (
                <StudioButton
                  key={tab}
                  id={`sample-tab-${tab}`}
                  type="button"
                  role="tab"
                  aria-selected={addTab === tab}
                  aria-controls={`sample-panel-${tab}`}
                  tabIndex={addTab === tab ? 0 : -1}
                  onClick={() => { setAddTab(tab); dialogRequest.load(`add-${tab}`); }}
                  onKeyDown={onTabKey}
                >
                  {kindLabel(tab)}
                </StudioButton>
              ))}
            </div>
            {dialogRequest.pending ? <p className="studio-meta" role="status">Loading dialog sample…</p> : null}
            <StudioLoadingRegion options={loadingOptions} variant="form" pending={dialogRequest.pending} mode={loadingMode} reducedMotion={effectiveReducedMotion} plain={plain} replay={replay + dialogRequest.revision}>
            <div role="tabpanel" id="sample-panel-image" aria-labelledby="sample-tab-image" hidden={addTab !== "image"}>
              <p className="studio-help">Drop or paste images directly onto the project canvas. Inspect a placed image to edit its title and source.</p>
            </div>
            <div role="tabpanel" id="sample-panel-link" aria-labelledby="sample-tab-link" hidden={addTab !== "link"}>
              <StudioField id="sample-link-url" label="URL" value={linkUrl} onChange={setLinkUrl} />
              <StudioField id="sample-link-title" label="Title" optional value={linkTitle} onChange={setLinkTitle} />
              <MotionField id="sample-link-motion" value={linkMotion} onChange={setLinkMotion} />
            </div>
            <div role="tabpanel" id="sample-panel-note" aria-labelledby="sample-tab-note" hidden={addTab !== "note"}>
              <StudioField id="sample-note-title" label="Title" value={noteTitle} onChange={setNoteTitle} />
              <div className="studio-field">
                <label htmlFor="sample-note-body">Note</label>
                <textarea id="sample-note-body" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} />
              </div>
              <MotionField id="sample-note-motion" value={noteMotion} onChange={setNoteMotion} />
            </div>
            </StudioLoadingRegion>
            {addMessage !== null ? <p className="studio-help" role="status">{addMessage}</p> : null}
          </form>
        ) : (
          <StudioLoadingRegion options={loadingOptions} variant="text" pending={dialogRequest.pending} mode={dialog === null ? "instant" : loadingMode} reducedMotion={effectiveReducedMotion} plain={plain} replay={replay + dialogRequest.revision}>
            <p data-studio-reveal>Forms focus the first useful field. Escape closes the dialog and returns focus to its opener.</p>
          </StudioLoadingRegion>
        )}
      </StudioDialog>
      <div className="studio-layer" />
    </div>
  );
}

function SampleCardView({
  card,
  draft,
  selected,
  loadingState,
  loadingMode,
  replay,
  reducedMotion,
  plain,
  onImageError,
  placeholder,
  onOpen,
  options,
  previewDelay,
}: {
  card: SampleCard;
  draft: Draft;
  selected: boolean;
  loadingState: StudioLoadingState;
  loadingMode: StudioLoadingMode;
  replay: number;
  reducedMotion: boolean;
  plain: boolean;
  onImageError: () => void;
  placeholder: boolean;
  onOpen: () => void;
  options: StudioLoadingOptions;
  previewDelay: number;
}) {
  const request = useStudioPreviewRequest(card.id, previewDelay, false);
  const reload = () => request.load(card.id);
  return (
    <StudioReferenceCard
      title={card.title}
      metadata={`${kindLabel(card.kind)} \u00b7 ${roleLabel(draft.role)}`}
      selected={selected}
      loading={loadingState === "loading" || request.pending}
      options={options} onPreviewReload={reload}
      loadingMode={loadingMode} reducedMotion={reducedMotion} plain={plain} replay={replay + request.revision} placeholder={placeholder}
      imageState={card.missing || loadingState === "error" ? "missing" : card.image ? "ready" : "none"}
      onOpen={() => { reload(); onOpen(); }}
      media={loadingState === "error" ? (
        <div className="sample-missing"><MissingIcon /><p>Image unavailable</p></div>
      ) : card.missing ? (
        <div className="sample-missing"><MissingIcon /><p>Image unavailable</p></div>
      ) : card.image ? (
        <img src={card.image} alt={`Specimen image, ${card.title}`} onError={onImageError} />
      ) : <p className="sample-kind-mark">{kindLabel(card.kind)}</p>}
      summary={card.kind === "link" ? <SourceLink href={card.source} /> : (
        <p className="studio-excerpt">{card.kind === "note" ? card.observations : card.creator || "Source unknown"}</p>
      )}
    />
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
  pending,
  loadingMode,
  reducedMotion,
  plain,
  replay,
  options,
  onReload,
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
  pending: boolean;
  loadingMode: StudioLoadingMode;
  reducedMotion: boolean;
  plain: boolean;
  replay: number;
  options: StudioLoadingOptions;
  onReload: () => void;
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
      <header className="studio-inspector-header" onClick={(event) => { if (isPreviewSurfaceClick(event)) onReload(); }}>
        <StudioLoadingRegion options={options} pending={pending} mode={loadingMode} reducedMotion={reducedMotion} plain={plain} replay={replay}>
          <p className="studio-kicker" data-studio-reveal>{kindLabel(card.kind)} · {roleLabel(draft.role)}</p>
          <h2 data-studio-reveal>{draft.title}</h2>
        </StudioLoadingRegion>
        <StudioButton type="button" variant="ghost" className="studio-inspector-back" onClick={onClose}>Back</StudioButton>
        <StudioButton type="button" variant="ghost" className="studio-inspector-close" onClick={onClose}>Close</StudioButton>
      </header>
      <div className="studio-inspector-body" aria-busy={pending || undefined} onClick={(event) => { if (isPreviewSurfaceClick(event)) onReload(); }}>
        <StudioLoadingRegion options={options} variant="inspector" pending={pending} mode={loadingMode} reducedMotion={reducedMotion} plain={plain} replay={replay}>
        <div className="sample-preview-frame">
          {card.missing ? (
            <div className="sample-missing">
              <MissingIcon />
              <p>Image unavailable</p>
            </div>
          ) : card.image ? (
            <img src={card.image} alt="" data-studio-reveal />
          ) : (
            <p className="sample-kind-mark">{kindLabel(card.kind)}</p>
          )}
        </div>
        {card.source !== "" ? (
          <SourceLink href={card.source} />
        ) : (
          <p className="studio-help">Source unknown</p>
        )}
        <section data-fields="shared">
          <h3 data-studio-reveal>Shared reference</h3>
          <p className="studio-help" data-studio-reveal>Shared across projects. This sample keeps the draft locally.</p>
          <StudioField id={titleId} label="Title" value={draft.title} onChange={(title) => onChange({ title })} />
          <StudioField id={sourceId} label="Source" value={draft.source} onChange={(source) => onChange({ source })} />
          <StudioField id={creatorId} label="Creator" value={draft.creator} onChange={(creator) => onChange({ creator })} />
          <StudioField id={tagsId} label="Tags" value={draft.tags} onChange={(tags) => onChange({ tags })} />
          <div className="studio-field">
            <label htmlFor={observationsId}>Observations</label>
            <textarea id={observationsId} value={draft.observations} onChange={(event) => onChange({ observations: event.target.value })} />
          </div>
        </section>
        <section data-fields="placement">
          <h3 data-studio-reveal>Use in {project}</h3>
          <p className="studio-help" data-studio-reveal>Role, usage notes, and crop belong to this project.</p>
          <div className="studio-field">
            <label id={`${roleId}-label`} htmlFor={roleId}>Role</label>
            <StudioSelect
              id={roleId}
              labelledBy={`${roleId}-label`}
              label="Role"
              value={draft.role}
              disabled={saving}
              field
              options={[
                { value: "inspiration", label: "Inspiration" },
                { value: "candidate", label: "Candidate" },
                { value: "approved", label: "Approved asset" },
              ]}
              onChange={(value) => {
                if (value === "inspiration" || value === "candidate" || value === "approved") onChange({ role: value });
              }}
            />
          </div>
          {draft.role === "approved" ? (
            <p className="studio-help">Approved marks the asset for this project. It does not approve a direction.</p>
          ) : null}
          <div className="studio-field">
            <label htmlFor={usageId}>Usage notes</label>
            <textarea id={usageId} value={draft.usage} disabled={saving} onChange={(event) => onChange({ usage: event.target.value })} />
          </div>
          {card.kind === "image" ? (
            <div className="sample-crop">
              <p className="studio-help">Crop is a fraction of the original image, from the top left.</p>
              <StudioField inputMode="decimal" id={`crop-x-${card.id}`} label="Crop x" value={draft.cropX} disabled={saving} onChange={(cropX) => onChange({ cropX })} />
              <StudioField inputMode="decimal" id={`crop-y-${card.id}`} label="Crop y" value={draft.cropY} disabled={saving} onChange={(cropY) => onChange({ cropY })} />
              <StudioField inputMode="decimal" id={`crop-width-${card.id}`} label="Crop width" value={draft.cropWidth} disabled={saving} onChange={(cropWidth) => onChange({ cropWidth })} />
              <StudioField inputMode="decimal" id={`crop-height-${card.id}`} label="Crop height" value={draft.cropHeight} disabled={saving} onChange={(cropHeight) => onChange({ cropHeight })} />
            </div>
          ) : null}
        </section>
        <details className="sample-provenance">
          <summary>Provenance</summary>
          <p className="studio-meta">Revision 4 · Specimen · Not a project record</p>
        </details>
        </StudioLoadingRegion>
      </div>
      <footer className="studio-inspector-footer">
        {pending ? <p className="studio-meta" role="status">Loading detail sample…</p> : null}
        {card.id === "north" && saveState === "conflict" ? (
          <p className="sample-conflict" role="status">This placement changed in another session. Your draft is still here.</p>
        ) : null}
        {card.id === "north" && saveState === "error" ? (
          <p className="studio-error" role="status">Save failed. The draft is still here.</p>
        ) : null}
        <div className="form-actions">
          <StudioButton variant="ghost" onClick={onReload}>Reload detail sample</StudioButton>
          {card.id === "north" && saveState === "conflict" ? (
            <StudioButton type="button" onClick={onReview}>Review latest</StudioButton>
          ) : null}
          <StudioButton type="button" variant="primary" className="sample-save" aria-busy={saving ? true : undefined} disabled={saving || pending} onClick={onSave}>
            {saving ? "Saving" : card.id === "north" && saveState === "conflict" ? "Save draft" : "Save use"}
          </StudioButton>
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
      <StudioButton type="button" variant="primary" onClick={onAdd}>Add reference</StudioButton>
    </div>
  );
}

function SourceLink({ href }: { href: string }) {
  let label = href;
  try {
    label = new URL(href).host;
  } catch {
    label = href;
  }
  return (
    <a className="sample-link" href={href} target="_blank" rel="noreferrer" data-ascii="skip">
      <span className="sample-link-text">{label}</span>
      <ExternalIcon />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function MotionField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <details className="sample-disclosure">
      <summary>Motion details</summary>
      <div className="studio-field">
        <label htmlFor={id}>Observed motion</label>
        <textarea id={id} value={value} placeholder="0:12–0:18, slow pan" onChange={(event) => onChange(event.target.value)} />
        <p className="studio-help">Optional. Leave this blank when you did not observe motion.</p>
      </div>
    </details>
  );
}

function PlusIcon() {
  return (
    <svg className="studio-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="studio-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="studio-icon" viewBox="0 0 16 16" aria-hidden="true">
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
