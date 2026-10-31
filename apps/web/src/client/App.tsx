import { lazy, Suspense, useEffect, useState } from "react";
import type { UpdateProjectRequest } from "@reference-studio/core";
import { downloadProjectBackup } from "./projectApi.js";
import { ProjectScreen } from "./ProjectScreen.js";
import { StudioButton } from "./StudioButton.js";
import { studioMotionStyle, useStudioReducedMotion } from "./studioMotion.js";
import { useProjectLibrary } from "./useProjectLibrary.js";
import { useServiceConnection, type ServiceState } from "./useServiceConnection.js";
import { SystemDraftHostProvider } from "./SystemDraftHost.js";

const StudioPreview = lazy(async () => ({ default: (await import("./StudioPreview.js")).StudioPreview }));

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
  return <SystemDraftHostProvider><AppContent /></SystemDraftHostProvider>;
}
function AppContent() {
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
        <Suspense fallback={<p className="studio-ui" role="status">Loading interface preview</p>}>
        <StudioPreview
          connection={{
            state: connection.state,
            detail: status.detail,
            contractVersion: connection.health?.contractVersion ?? null,
            live: connection.live,
            onRetry: connection.retry,
          }}
        />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="studio-ui studio-canvas-app" data-reduced-motion={reducedMotion ? "true" : "false"} style={studioMotionStyle(reducedMotion)}>
      <header className="sample-topbar">
        <p className="sample-wordmark">Reference Studio</p>
        {import.meta.env.DEV ? <a href="#/studio">Interface preview</a> : null}
      </header>
      {connection.state === "reconnecting" ? (
        <div className="sample-banner" role="status">Reconnecting. Current data may be stale.<StudioButton onClick={connection.retry}>Retry connection</StudioButton></div>
      ) : null}
      {connection.state === "unavailable" ? (
        <div className="sample-banner" role="status">{status.detail}<StudioButton onClick={connection.retry}>Retry connection</StudioButton></div>
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
