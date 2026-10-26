import { useEffect, useState } from "react";
import type { UpdateProjectRequest } from "@reference-studio/core";
import { downloadProjectBackup } from "./projectApi.js";
import { ProjectScreen } from "./ProjectScreen.js";
import { StudioButton } from "./StudioButton.js";
import { StudioPreview } from "./StudioPreview.js";
import { studioMotionStyle, useStudioReducedMotion } from "./studioMotion.js";
import { useProjectLibrary } from "./useProjectLibrary.js";
import { useServiceConnection, type ServiceState } from "./useServiceConnection.js";

const copy: Record<ServiceState, { title: string; detail: string }> = {
  loading: {
    title: "Connecting",
    detail: "Checking the local application service.",
  },
  ready: {
    title: "Connected",
    detail: "This workspace can reach the local application service.",
  },
  reconnecting: {
    title: "Reconnecting",
    detail: "The update stream dropped. The page will refresh when the service returns.",
  },
  unavailable: {
    title: "Unavailable",
    detail: "Start the application from this repository with npm run dev.",
  },
};

function useLocationHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
}

export function App() {
  const connection = useServiceConnection();
  const library = useProjectLibrary(connection);
  const hash = useLocationHash();
  const preview = hash === "#/studio";
  const status = copy[connection.state];
  const reducedMotion = useStudioReducedMotion();
  const libraryVisible =
    connection.state === "ready" ||
    connection.state === "reconnecting" ||
    connection.health !== null;

  if (preview) {
    return (
      <div className="studio-preview-route">
        <StudioPreview
          connection={{
            state: connection.state,
            detail: status.detail,
            contractVersion: connection.health?.contractVersion ?? null,
            live: connection.live,
            onRetry: connection.retry,
          }}
        />
      </div>
    );
  }

  return (
    <div className="studio-ui" data-reduced-motion={reducedMotion ? "true" : "false"} style={studioMotionStyle(reducedMotion)}>
      <header className="sample-topbar">
        <p className="sample-wordmark">Reference Studio</p>
        {import.meta.env.DEV ? <a href="#/studio">Interface preview</a> : null}
        <div className="sample-views" role="group" aria-label="View">
          <StudioButton type="button" aria-pressed="true">Collection</StudioButton>
        </div>
        <details className="sample-connection">
          <summary>
            <span className={`sample-dot sample-dot-${connection.state}`} aria-hidden="true" />
            {status.title}
          </summary>
          <div className="sample-diagnostics">
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
            <p>{status.detail}</p>
            <StudioButton type="button" onClick={connection.retry}>Check again</StudioButton>
          </div>
        </details>
      </header>
      {connection.state === "reconnecting" ? (
        <p className="sample-banner" role="status">Current data may be stale. The page will refresh when the service returns.</p>
      ) : null}
      {connection.state === "unavailable" ? (
        <p className="sample-banner" role="status">{status.detail}</p>
      ) : null}
      {libraryVisible ? (
        <ProjectScreen
          projects={library.projects}
          notice={library.notice}
          status={library.status}
          refreshing={library.refreshing}
          refreshKey={connection.refreshKey}
          onCreate={library.create}
          onRestore={library.restore}
          onDownload={downloadProjectBackup}
          onSave={(id, expectedRevision, patch) =>
            library.save(id, { ...patch, expectedRevision } satisfies UpdateProjectRequest)
          }
        />
      ) : (
        <main className="sample-frame">
          <p className="sample-loading-status" role="status">{status.title}</p>
        </main>
      )}
      <div className="studio-layer" />
    </div>
  );
}
