import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MotionDraft } from "./motionPresets.js";
import type { VariantTarget } from "./SavedMotionVariants.js";

export function variantDraftKey(projectId: string, directionId: string, variantId: string, baseRevision: number): string {
  return `${projectId}:${directionId}:${variantId}:${baseRevision}`;
}

export type VariantDraftSlot = { key: string; host: HTMLDivElement; node?: ReactNode; latest?: MotionDraft; listen?: () => void };
type Hosts = {
  slot: (key: string) => VariantDraftSlot;
  register: (slot: VariantDraftSlot, node: ReactNode) => void;
  shown: (projectId: string, directionId: string, lane: "a" | "b") => VariantTarget;
  show: (projectId: string, directionId: string, lane: "a" | "b", next: VariantTarget) => void;
  version: number;
};
const Context = createContext<Hosts | null>(null);

/** Variant editors live for this app session, above the study card. */
export function VariantDraftHostProvider({ children }: { children: ReactNode }) {
  const slots = useRef(new Map<string, VariantDraftSlot>());
  const shown = useRef(new Map<string, VariantTarget>());
  const [entries, setEntries] = useState<VariantDraftSlot[]>([]);
  const [shownVersion, setShownVersion] = useState(0);
  const value: Hosts = {
    slot(key) {
      let slot = slots.current.get(key);
      if (!slot) {
        const host = document.createElement("div");
        host.className = "variant-host";
        host.dataset.draftKey = key;
        slot = { key, host };
        slots.current.set(key, slot);
      }
      return slot;
    },
    register(slot, node) {
      slot.node = node;
      slot.listen?.();
      setEntries((current) => current.includes(slot) ? current : [...current, slot]);
    },
    shown(projectId, directionId, lane) {
      const key = `${projectId}:${directionId}:${lane}`;
      let entry = shown.current.get(key);
      if (!entry) { entry = { variantId: crypto.randomUUID(), baseRevision: 0, record: null }; shown.current.set(key, entry); }
      return entry;
    },
    show(projectId, directionId, lane, next) {
      shown.current.set(`${projectId}:${directionId}:${lane}`, next);
      setShownVersion((version) => version + 1);
    },
    version: shownVersion,
  };
  return <Context.Provider value={value}>{children}{entries.map((slot) => <PortalSlot key={slot.key} slot={slot} />)}</Context.Provider>;
}

function PortalSlot({ slot }: { slot: VariantDraftSlot }) {
  const [, bump] = useState(0);
  useLayoutEffect(() => {
    const listen = () => bump((version) => version + 1);
    slot.listen = listen;
    return () => { if (slot.listen === listen) slot.listen = undefined; };
  }, [slot]);
  return slot.node ? createPortal(slot.node, slot.host, slot.key) : null;
}

export function useVariantDraftHosts(): Hosts | null {
  return useContext(Context);
}
