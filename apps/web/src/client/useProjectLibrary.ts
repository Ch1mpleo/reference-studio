import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, UpdateProjectRequest } from "@reference-studio/core";
import { createProject, listProjects, ProjectRequestError, restoreProject, updateProject } from "./projectApi.js";
import type { ServiceState } from "./useServiceConnection.js";

export type LibraryLoadStatus = "loading" | "ready" | "error";

export type ProjectLibrary = {
  projects: Project[];
  notice: string | null;
  status: LibraryLoadStatus;
  refreshing: boolean;
  create: (name: string) => Promise<Project>;
  restore: (file: File) => Promise<Project>;
  save: (id: string, input: UpdateProjectRequest) => Promise<Project>;
};

export function useProjectLibrary(connection: {
  state: ServiceState;
  refreshKey: number;
}): ProjectLibrary {
  const [projects, setProjects] = useState<Project[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<LibraryLoadStatus>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const loadedOnce = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    const requestGeneration = ++generation.current;
    if (loadedOnce.current) {
      setRefreshing(true);
    }
    try {
      const next = await listProjects();
      if (requestGeneration !== generation.current) {
        return;
      }
      setProjects(next);
      setNotice(null);
      loadedOnce.current = true;
      setStatus("ready");
    } catch (error) {
      if (requestGeneration !== generation.current) {
        return;
      }
      setStatus("error");
      setNotice(error instanceof ProjectRequestError ? error.message : "The project list could not be loaded.");
    } finally {
      if (requestGeneration === generation.current) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (connection.state === "loading") {
      return;
    }
    if (connection.state === "unavailable" && connection.refreshKey === 0) {
      return;
    }
    void load();
  }, [connection.refreshKey, connection.state, load]);

  const create = useCallback(async (name: string): Promise<Project> => {
    const project = await createProject(name);
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setNotice(null);
    return project;
  }, []);

  const restore = useCallback(async (file: File): Promise<Project> => {
    const project = await restoreProject(file);
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setNotice(null);
    return project;
  }, []);

  const save = useCallback(async (id: string, input: UpdateProjectRequest): Promise<Project> => {
    const project = await updateProject(id, input);
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
    setNotice(null);
    return project;
  }, []);

  return { projects, notice, status, refreshing, create, restore, save };
}
