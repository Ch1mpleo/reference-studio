import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, UpdateProjectRequest } from "@reference-studio/core";
import { createProject, listProjects, ProjectRequestError, updateProject } from "./projectApi.js";
import type { ServiceState } from "./useServiceConnection.js";

export type ProjectLibrary = {
  projects: Project[];
  notice: string | null;
  create: (name: string) => Promise<Project>;
  save: (id: string, input: UpdateProjectRequest) => Promise<Project>;
};

export function useProjectLibrary(connection: {
  state: ServiceState;
  refreshKey: number;
}): ProjectLibrary {
  const [projects, setProjects] = useState<Project[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const requestGeneration = ++generation.current;
    try {
      const next = await listProjects();
      if (requestGeneration !== generation.current) {
        return;
      }
      setProjects(next);
      setNotice(null);
    } catch (error) {
      if (requestGeneration !== generation.current) {
        return;
      }
      setNotice(error instanceof ProjectRequestError ? error.message : "The project list could not be loaded.");
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

  const save = useCallback(async (id: string, input: UpdateProjectRequest): Promise<Project> => {
    const project = await updateProject(id, input);
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
    setNotice(null);
    return project;
  }, []);

  return { projects, notice, create, save };
}
