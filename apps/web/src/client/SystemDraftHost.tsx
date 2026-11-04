import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SystemEditor, type SystemEditorProps } from "./SystemEditor.js";

type Slot = { key: string; host: HTMLDivElement; props?: SystemEditorProps };
type Hosts = { slot: (key: string) => Slot; register: (slot: Slot, props: SystemEditorProps) => void };
const Context = createContext<Hosts | null>(null);

/** Transient React editors live for this app session, above keyed projects and
 * responsive inspector shells. Detached hosts retain failed/pending drafts;
 * authoritative records still live only in the application service. */
export function SystemDraftHostProvider({ children }: { children: ReactNode }) {
  const slots = useRef(new Map<string, Slot>());
  const [entries, setEntries] = useState<Slot[]>([]);
  const value = useMemo<Hosts>(() => ({
    slot(key) {
      let slot = slots.current.get(key);
      if (!slot) { const host = document.createElement("div"); host.className = "system-host"; slot = { key, host }; slots.current.set(key, slot); }
      return slot;
    },
    register(slot, props) { slot.props = props; setEntries((current) => current.includes(slot) ? [...current] : [...current, slot]); },
  }), []);
  return <Context.Provider value={value}>{children}{entries.map((slot) => slot.props ? createPortal(<SystemEditor {...slot.props} />, slot.host, slot.key) : null)}</Context.Provider>;
}

export function HostedSystemEditor({ scope, ...props }: SystemEditorProps & { scope: string }) {
  const hosts = useContext(Context);
  return hosts ? <MountEditor hosts={hosts} scope={scope} {...props} /> : <SystemEditor {...props} />;
}
function MountEditor({ hosts, scope, ...props }: SystemEditorProps & { scope: string; hosts: Hosts }) {
  const [slot] = useState(() => hosts.slot(`${scope}:${props.directionId}:${props.kind}`));
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const parent = container.current; parent?.appendChild(slot.host); return () => { if (slot.host.parentNode === parent) slot.host.remove(); }; }, [slot]);
  useLayoutEffect(() => hosts.register(slot, props), [hosts, slot, props]);
  return <div ref={container} />;
}
