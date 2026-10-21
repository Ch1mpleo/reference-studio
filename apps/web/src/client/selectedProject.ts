export const selectedProjectKey = "reference-studio.selected-project";

export function readSelectedProjectId(storage: Storage): string | null {
  const value = storage.getItem(selectedProjectKey);
  return value === null || value.trim() === "" ? null : value;
}

export function writeSelectedProjectId(storage: Storage, id: string | null): void {
  if (id === null) {
    storage.removeItem(selectedProjectKey);
    return;
  }
  storage.setItem(selectedProjectKey, id);
}
