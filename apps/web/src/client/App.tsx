import type { UpdateProjectRequest } from "@reference-studio/core";
import { downloadProjectBackup } from "./projectApi.js";
import { ProjectScreen } from "./ProjectScreen.js";
import { useProjectLibrary } from "./useProjectLibrary.js";
import { useServiceConnection, type ServiceState } from "./useServiceConnection.js";

const copy: Record<ServiceState, { title: string; detail: string }> = {
  loading: {
    title: "Connecting",
    detail: "Checking the local application service.",
  },
  ready: {
    title: "Service connected",
    detail: "This workspace can reach the local application service.",
  },
  reconnecting: {
    title: "Reconnecting",
    detail: "The update stream dropped. The page will refresh when the service returns.",
  },
  unavailable: {
    title: "Service unavailable",
    detail: "Start the application from this repository with npm run dev.",
  },
};

export function App() {
  const connection = useServiceConnection();
  const library = useProjectLibrary(connection);
  const status = copy[connection.state];
  const libraryVisible =
    connection.state === "ready" ||
    connection.state === "reconnecting" ||
    connection.health !== null;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Reference Studio</p>
          <h1>Projects</h1>
        </div>
        <section className="connection" aria-live="polite">
          <div className="status-row">
            <span className={`mark mark-${connection.state}`} aria-hidden="true" />
            <h2>{status.title}</h2>
          </div>
          <p>{status.detail}</p>
          <dl>
            <div>
              <dt>Contract</dt>
              <dd>{connection.health?.contractVersion ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Updates</dt>
              <dd>{connection.live ? "Listening" : "Not listening"}</dd>
            </div>
          </dl>
          <button type="button" onClick={connection.retry}>
            Check again
          </button>
        </section>
      </header>
      {libraryVisible ? (
        <ProjectScreen
          projects={library.projects}
          notice={library.notice}
          refreshKey={connection.refreshKey}
          onCreate={library.create}
          onRestore={library.restore}
          onDownload={downloadProjectBackup}
          onSave={(id, expectedRevision, patch) =>
            library.save(id, { ...patch, expectedRevision } satisfies UpdateProjectRequest)
          }
        />
      ) : null}
    </main>
  );
}
