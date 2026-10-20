export const CONTRACT_VERSION = 1;

export function createId(): string {
  return crypto.randomUUID();
}
