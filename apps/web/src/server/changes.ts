import { changedEvent, type ChangedEvent } from "@reference-studio/core";
import type { EventHub } from "./events.js";

export function publishChange(
  hub: EventHub,
  change: Omit<ChangedEvent, "type" | "contractVersion">,
): void {
  hub.publish(changedEvent(change));
}
