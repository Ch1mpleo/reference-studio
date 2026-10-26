import { useLayoutEffect, useState } from "react";

/** The last child of the Studio root. Dialogs portal here so they are not trapped in a grid or overflow. */
export function useStudioLayer(): HTMLElement | null {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setLayer(document.querySelector<HTMLElement>(".studio-ui > .studio-layer"));
  }, []);
  return layer;
}
