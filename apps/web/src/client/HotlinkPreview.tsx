import { useState } from "react";

type PreviewStatus = "loading" | "shown" | "unavailable";

type HotlinkPreviewProps = {
  url: string;
  alt: string;
  onStatusChange?: (status: PreviewStatus) => void;
};

/** Browser-side hotlink image. Never fetches through the service. */
export function HotlinkPreview({ url, alt, onStatusChange }: HotlinkPreviewProps) {
  const [status, setStatus] = useState<PreviewStatus>("loading");

  function update(next: PreviewStatus): void {
    setStatus(next);
    onStatusChange?.(next);
  }

  if (status === "unavailable") {
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
