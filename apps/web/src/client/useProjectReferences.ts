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
  updateReference,
  uploadProjectImage,
  type ReferenceDetailsInput,
} from "./referenceApi.js";

export function useProjectReferences(projectId: string, refreshKey: number): {
  references: ProjectReference[];
  notice: string | null;
  addImage: (file: File, fields: ImageFields) => Promise<ProjectReference>;
  addLink: (input: CreateLinkReference) => Promise<ProjectReference>;
  addNote: (input: CreateNoteReference) => Promise<ProjectReference>;
  saveDetails: (referenceId: string, input: ReferenceDetailsInput) => Promise<LibraryReference>;
  place: (referenceId: string) => Promise<ProjectReference>;
} {
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const requestGeneration = ++generation.current;
    try {
      const next = await listProjectReferences(projectId);
      if (requestGeneration !== generation.current) {
        return;
      }
      setReferences(next);
      setNotice(null);
    } catch (error) {
      if (requestGeneration !== generation.current) {
        return;
      }
      setNotice(error instanceof ReferenceRequestError ? error.message : "The references could not be loaded.");
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

  const place = useCallback(
    async (referenceId: string): Promise<ProjectReference> => {
      const item = await placeReference(projectId, referenceId);
      remember(item);
      return item;
    },
    [projectId, remember],
  );

  return { references, notice, addImage, addLink, addNote, saveDetails, place };
}
