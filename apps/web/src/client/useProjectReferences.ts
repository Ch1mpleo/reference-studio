import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateLinkReference,
  CreateNoteReference,
  ImageFields,
  LibraryReference,
  ProjectReference,
} from "@reference-studio/core";
import {
  addProjectLink,
  addProjectNote,
  listProjectReferences,
  placeReference,
  ReferenceRequestError,
  updatePlacement,
  updateReference,
  uploadProjectImage,
  type PlacementUseInput,
  type PlacementOptions,
  type ReferenceDetailsInput,
} from "./referenceApi.js";

export type ReferenceLoadStatus = "loading" | "ready" | "error";

export function useProjectReferences(projectId: string, refreshKey: number): {
  references: ProjectReference[];
  notice: string | null;
  status: ReferenceLoadStatus;
  refreshing: boolean;
  retry: () => Promise<void>;
  addImage: (file: File, fields: ImageFields) => Promise<ProjectReference>;
  addLink: (input: CreateLinkReference) => Promise<ProjectReference>;
  addNote: (input: CreateNoteReference) => Promise<ProjectReference>;
  saveDetails: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
  savePlacement: (placementId: string, input: PlacementUseInput) => Promise<ProjectReference>;
  place: (referenceId: string, options?: PlacementOptions) => Promise<ProjectReference>;
} {
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<ReferenceLoadStatus>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const loadedOnce = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    const requestGeneration = ++generation.current;
    if (loadedOnce.current) {
      setRefreshing(true);
    } else {
      setStatus("loading");
    }
    try {
      const next = await listProjectReferences(projectId);
      if (requestGeneration !== generation.current) {
        return;
      }
      setReferences(next);
      setNotice(null);
      loadedOnce.current = true;
      setStatus("ready");
    } catch (error) {
      if (requestGeneration !== generation.current) {
        return;
      }
      setStatus("error");
      setNotice(error instanceof ReferenceRequestError ? error.message : "The references could not be loaded.");
    } finally {
      if (requestGeneration === generation.current) {
        setRefreshing(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load, refreshKey]);

  const remember = useCallback((item: ProjectReference): void => {
    generation.current += 1;
    setRefreshing(false);
    setReferences((current) => [item, ...current.filter((entry) => entry.placementId !== item.placementId)]);
    setNotice(null);
  }, []);

  const addImage = useCallback(
    async (file: File, fields: ImageFields): Promise<ProjectReference> => {
      const item = await uploadProjectImage(projectId, file, fields);
      remember(item);
      return item;
    },
    [projectId, remember],
  );

  const addLink = useCallback(
    async (input: CreateLinkReference): Promise<ProjectReference> => {
      const item = await addProjectLink(projectId, input);
      remember(item);
      return item;
    },
    [projectId, remember],
  );

  const addNote = useCallback(
    async (input: CreateNoteReference): Promise<ProjectReference> => {
      const item = await addProjectNote(projectId, input);
      remember(item);
      return item;
    },
    [projectId, remember],
  );

  const saveDetails = useCallback(
    async (referenceId: string, input: ReferenceDetailsInput): Promise<LibraryReference> => {
      const saved = await updateReference(referenceId, input);
      generation.current += 1;
      setReferences((current) =>
        current.map((item) => (item.reference.id === saved.id ? { ...item, reference: saved } : item)),
      );
      setNotice(null);
      return saved;
    },
    [],
  );

  const savePlacement = useCallback(
    async (placementId: string, input: PlacementUseInput): Promise<ProjectReference> => {
      const saved = await updatePlacement(projectId, placementId, input);
      generation.current += 1;
      setReferences((current) => current.map((item) => (item.placementId === saved.placementId ? saved : item)));
      setNotice(null);
      return saved;
    },
    [projectId],
  );

  const place = useCallback(
    async (referenceId: string, options?: PlacementOptions): Promise<ProjectReference> => {
      const item = await placeReference(projectId, referenceId, options);
      remember(item);
      return item;
    },
    [projectId, remember],
  );

  return { references, notice, status, refreshing, retry: load, addImage, addLink, addNote, saveDetails, savePlacement, place };
}
