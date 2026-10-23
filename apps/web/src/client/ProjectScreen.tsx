import { useState, type FormEvent } from "react";
import type { Project, UpdateProjectRequest } from "@reference-studio/core";
import { ProjectRequestError } from "./projectApi.js";
import { ReferenceCollection } from "./ReferenceCollection.js";
import { readSelectedProjectId, writeSelectedProjectId } from "./selectedProject.js";
import { useProjectReferences } from "./useProjectReferences.js";

export type ProjectDraft = {
  name: string;
  brief: string;
  audience: string;
  purpose: string;
  constraints: string;
};

type ProjectPatch = Omit<UpdateProjectRequest, "expectedRevision">;

type ProjectScreenProps = {
  projects: Project[];
  notice: string | null;
  refreshKey: number;
  onCreate: (name: string) => Promise<Project>;
  onRestore: (file: File) => Promise<Project>;
  onDownload: (projectId: string) => Promise<void>;
  onSave: (id: string, expectedRevision: number, patch: ProjectPatch) => Promise<Project>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProjectScreen({
  projects,
  notice,
  refreshKey,
  onCreate,
  onRestore,
  onDownload,
  onSave,
}: ProjectScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof sessionStorage === "undefined" ? null : readSelectedProjectId(sessionStorage),
  );
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const active = projects.filter((project) => project.status === "active");
  const archived = projects.filter((project) => project.status === "archived");

  function select(id: string | null): void {
    setSelectedId(id);
    writeSelectedProjectId(sessionStorage, id);
  }

  async function restore(file: File): Promise<void> {
    setRestoring(true);
    setRestoreError(null);
    setRestoreMessage(null);
    try {
      const project = await onRestore(file);
      setRestoreMessage("Restored");
      select(project.id);
    } catch (error) {
      setRestoreError(error instanceof ProjectRequestError ? error.message : "The backup could not be restored.");
    } finally {
      setRestoring(false);
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const project = await onCreate(name);
      setName("");
      select(project.id);
    } catch (error) {
      setCreateError(error instanceof ProjectRequestError ? error.message : "The project could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="workspace-body">
      <section className="project-list" aria-label="Projects">
        <form className="create-project" onSubmit={(event) => void submitProject(event)}>
          <label htmlFor="new-project-name">New project</label>
          <div className="create-row">
            <input
              id="new-project-name"
              name="name"
              value={name}
              maxLength={200}
              required
              disabled={creating}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" disabled={creating || name.trim() === ""}>
              {creating ? "Creating" : "Create"}
            </button>
          </div>
          {createError !== null ? <p className="form-error">{createError}</p> : null}
        </form>
        <div className="restore-project">
          <label htmlFor="restore-backup">Restore backup</label>
          <input
            id="restore-backup"
            name="backup"
            type="file"
            accept=".zip,application/zip"
            disabled={restoring}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file !== undefined) {
                void restore(file);
              }
            }}
          />
          {restoreMessage !== null ? (
            <p className="save-state" data-save-state="saved">
              {restoreMessage}
            </p>
          ) : null}
          {restoreError !== null ? <p className="form-error">{restoreError}</p> : null}
        </div>
        {notice !== null ? <p className="form-error">{notice}</p> : null}
        {active.length === 0 ? <p className="quiet">No active projects.</p> : null}
        <ProjectChoices projects={active} selectedId={selectedId} onSelect={select} />
        {archived.length > 0 ? (
          <details className="archived">
            <summary>Archived</summary>
            <ProjectChoices projects={archived} selectedId={selectedId} onSelect={select} />
          </details>
        ) : null}
      </section>
      <section className="project-detail">
        {projects.length === 0 ? <EmptyLibrary /> : null}
        {projects.length > 0 && selected === null ? (
          <div className="invitation">
            <h2>Choose a project</h2>
            <p>Opening one here does not change the project selected in another tab.</p>
          </div>
        ) : null}
        {selected !== null ? (
          <ProjectEditor
            key={selected.id}
            project={selected}
            refreshKey={refreshKey}
            onSave={onSave}
            onDownload={onDownload}
          />
        ) : null}
      </section>
    </div>
  );
}

function ProjectChoices({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>
          <button
            type="button"
            className={project.id === selectedId ? "project-option selected" : "project-option"}
            aria-current={project.id === selectedId ? "true" : undefined}
            onClick={() => onSelect(project.id)}
          >
            {project.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyLibrary() {
  return (
    <div className="invitation">
      <h2>Start with a reference</h2>
      <p>Name the project, then add an image, a link, or a note. You do not need a brief yet.</p>
      <p>Source and creator can stay unknown.</p>
    </div>
  );
}

function ProjectEditor({
  project,
  refreshKey,
  onSave,
  onDownload,
}: {
  project: Project;
  refreshKey: number;
  onSave: ProjectScreenProps["onSave"];
  onDownload: ProjectScreenProps["onDownload"];
}) {
  const collection = useProjectReferences(project.id, refreshKey);
  const [draft, setDraft] = useState<ProjectDraft>(() => draftFromProject(project));
  const [baseRevision, setBaseRevision] = useState(project.revision);
  const [overrideRevision, setOverrideRevision] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [backupState, setBackupState] = useState<SaveState>("idle");
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const dirty = !sameDraft(draft, draftFromProject(project));
  const expectedRevision = overrideRevision ?? baseRevision;

  function edit(patch: Partial<ProjectDraft>): void {
    setDraft({ ...draft, ...patch });
    setSaveState("idle");
    setMessage(null);
  }

  async function downloadBackup(): Promise<void> {
    setBackupState("saving");
    setBackupMessage(null);
    try {
      await onDownload(project.id);
      setBackupState("saved");
      setBackupMessage("Downloaded");
    } catch (error) {
      setBackupState("error");
      setBackupMessage(error instanceof ProjectRequestError ? error.message : "The backup could not be downloaded.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!dirty && overrideRevision === null) {
      return;
    }
    await commit(draft, expectedRevision);
  }

  async function commit(next: ProjectDraft, revision: number, status?: Project["status"]): Promise<void> {
    setSaveState("saving");
    setMessage(null);
    try {
      const saved = await onSave(project.id, revision, {
        name: next.name,
        brief: next.brief,
        audience: next.audience,
        purpose: next.purpose,
        constraints: next.constraints,
        ...(status === undefined ? {} : { status }),
      });
      setDraft(draftFromProject(saved));
      setBaseRevision(saved.revision);
      setOverrideRevision(null);
      setSaveState("saved");
      setMessage(null);
    } catch (error) {
      setSaveState("error");
      if (error instanceof ProjectRequestError && error.code === "conflict") {
        if (error.currentRevision !== undefined) {
          setOverrideRevision(error.currentRevision);
        }
        setMessage(
          "This project changed in another session. Your draft is still here. Save again to use the newer revision.",
        );
        return;
      }
      setMessage(error instanceof ProjectRequestError ? error.message : "Save failed");
    }
  }

  async function changeStatus(status: "active" | "archived"): Promise<void> {
    if (dirty) {
      setSaveState("error");
      setMessage(status === "archived" ? "Save the draft before archiving." : "Save the draft before reopening.");
      return;
    }
    await commit(draftFromProject(project), project.revision, status);
  }

  return (
    <>
    <form className="project-form" onSubmit={(event) => void save(event)}>
      <div className="detail-heading">
        <h2>{project.status === "archived" ? "Archived project" : "Project"}</h2>
        <p className="save-state" data-save-state={saveState}>
          {saveState === "saving" ? "Saving" : null}
          {saveState === "saved" ? "Saved" : null}
          {saveState === "error" ? "Save failed" : null}
        </p>
      </div>
      <label htmlFor="project-name">Name</label>
      <input
        id="project-name"
        value={draft.name}
        maxLength={200}
        required
        disabled={saveState === "saving"}
        onChange={(event) => edit({ name: event.target.value })}
      />
      <label htmlFor="project-brief">Brief</label>
      <textarea
        id="project-brief"
        value={draft.brief}
        maxLength={20000}
        rows={6}
        disabled={saveState === "saving"}
        onChange={(event) => edit({ brief: event.target.value })}
      />
      <details>
        <summary>Audience, purpose, and constraints</summary>
        <label htmlFor="project-audience">Audience</label>
        <textarea
          id="project-audience"
          value={draft.audience}
          maxLength={4000}
          rows={3}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ audience: event.target.value })}
        />
        <label htmlFor="project-purpose">Purpose</label>
        <textarea
          id="project-purpose"
          value={draft.purpose}
          maxLength={4000}
          rows={3}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ purpose: event.target.value })}
        />
        <label htmlFor="project-constraints">Constraints</label>
        <textarea
          id="project-constraints"
          value={draft.constraints}
          maxLength={8000}
          rows={3}
          disabled={saveState === "saving"}
          onChange={(event) => edit({ constraints: event.target.value })}
        />
      </details>
      <div className="form-actions">
        <button type="submit" disabled={saveState === "saving" || (!dirty && overrideRevision === null)}>
          {overrideRevision === null ? "Save" : "Save draft"}
        </button>
        <button type="button" disabled={backupState === "saving"} onClick={() => void downloadBackup()}>
          {backupState === "saving" ? "Downloading" : "Download backup"}
        </button>
        {project.status === "active" ? (
          <button type="button" disabled={saveState === "saving"} onClick={() => void changeStatus("archived")}>
            Archive
          </button>
        ) : (
          <button type="button" disabled={saveState === "saving"} onClick={() => void changeStatus("active")}>
            Reopen
          </button>
        )}
      </div>
      {message !== null ? <p className={saveState === "error" ? "form-error" : "form-note"}>{message}</p> : null}
      {backupMessage !== null ? (
        <p className="save-state" data-save-state={backupState}>
          {backupMessage}
        </p>
      ) : null}
    </form>
    <ReferenceCollection
      references={collection.references}
      notice={collection.notice}
      onAddImage={collection.addImage}
      onAddLink={collection.addLink}
      onAddNote={collection.addNote}
      onSaveDetails={collection.saveDetails}
      onSavePlacement={collection.savePlacement}
      onPlace={collection.place}
    />
    </>
  );
}

function draftFromProject(project: Project): ProjectDraft {
  return {
    name: project.name,
    brief: project.brief,
    audience: project.audience,
    purpose: project.purpose,
    constraints: project.constraints,
  };
}

function sameDraft(left: ProjectDraft, right: ProjectDraft): boolean {
  return (
    left.name === right.name &&
    left.brief === right.brief &&
    left.audience === right.audience &&
    left.purpose === right.purpose &&
    left.constraints === right.constraints
  );
}
