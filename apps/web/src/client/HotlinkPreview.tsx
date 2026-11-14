import { useEffect, useState } from "react";
import { isAllowedHotlinkPreviewUrl } from "@reference-studio/core";

type PreviewStatus = "loading" | "shown" | "unavailable";

type HotlinkPreviewProps = {
  url: string;
  alt: string;
  onStatusChange?: (status: PreviewStatus) => void;
};

function pageHostname(): string | undefined {
  if (typeof location === "undefined") {
    return undefined;
  }
  return location.hostname;
}

/** Browser-side hotlink image. Never fetches through the service. */
export function HotlinkPreview({ url, alt, onStatusChange }: HotlinkPreviewProps) {
  const allowed = isAllowedHotlinkPreviewUrl(url, pageHostname());
  const [status, setStatus] = useState<PreviewStatus>(allowed ? "loading" : "unavailable");

  function update(next: PreviewStatus): void {
    setStatus(next);
    onStatusChange?.(next);
  }

  useEffect(() => {
    if (!allowed) {
      onStatusChange?.("unavailable");
    }
  }, [allowed, onStatusChange]);

  if (!allowed || status === "unavailable") {
    return null;
  }

  return (
    <img
      src={url}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => {
        update("shown");
      }}
      onError={() => {
        update("unavailable");
      }}
    />
  );
}
