import type { StudioEvent } from "@reference-studio/core";

export class EventHub {
  private readonly listeners = new Set<(event: StudioEvent) => void>();

  subscribe(listener: (event: StudioEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: StudioEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
