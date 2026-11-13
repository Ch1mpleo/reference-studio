import { useEffect, useState } from "react";
import {
  UPLOAD_LIMIT_MAX,
  UPLOAD_LIMIT_MIN,
  UPLOAD_LIMIT_STEP,
  type StudioSettings as SettingsRecord,
} from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import { StudioDialog } from "./StudioDialog.js";
import { StudioParameter } from "./StudioParameter.js";
import { SettingsRequestError, getSettings, updateSettings } from "./settingsApi.js";

const MIB = 1024 * 1024;

type StudioSettingsProps = {
  open: boolean;
  onClose: () => void;
};

export function StudioSettings({ open, onClose }: StudioSettingsProps) {
  const [revision, setRevision] = useState(1);
  const [maxUploadMib, setMaxUploadMib] = useState(UPLOAD_LIMIT_MIN / MIB);
  const [baselineMib, setBaselineMib] = useState(UPLOAD_LIMIT_MIN / MIB);
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    setMessage(null);
    setSaveState("idle");
    void getSettings()
      .then((settings) => {
        if (cancelled) return;
        applyLoaded(settings);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadState("error");
        setMessage(error instanceof Error ? error.message : "Could not load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function applyLoaded(settings: SettingsRecord): void {
    const mib = settings.maxUploadBytes / MIB;
    setRevision(settings.revision);
    setMaxUploadMib(mib);
    setBaselineMib(mib);
  }

  async function save(): Promise<void> {
    if (saveState === "saving" || loadState !== "ready") {
      return;
    }
    setSaveState("saving");
    setMessage(null);
    try {
      const saved = await updateSettings({
        expectedRevision: revision,
        maxUploadBytes: maxUploadMib * MIB,
      });
      applyLoaded(saved);
      setSaveState("idle");
      onClose();
    } catch (error) {
      setSaveState("error");
      if (error instanceof SettingsRequestError && error.code === "conflict") {
        setMessage(
          "Settings changed in another session. Your draft is still here. Save again to use the newer revision.",
        );
        try {
          const latest = await getSettings();
          setRevision(latest.revision);
          setBaselineMib(latest.maxUploadBytes / MIB);
        } catch {
          // Keep the local draft; revision may still be stale.
        }
        return;
      }
      setMessage(error instanceof SettingsRequestError ? error.message : "Save failed");
    }
  }

  const minMib = UPLOAD_LIMIT_MIN / MIB;
  const maxMib = UPLOAD_LIMIT_MAX / MIB;
  const stepMib = UPLOAD_LIMIT_STEP / MIB;
  const dirty = maxUploadMib !== baselineMib;

  return (
    <StudioDialog
      open={open}
      title="Settings"
      onClose={onClose}
      footer={
        <>
          <StudioButton onClick={onClose}>Cancel</StudioButton>
          <StudioButton
            variant="primary"
            busy={saveState === "saving"}
            disabled={loadState !== "ready" || !dirty}
            onClick={() => {
              void save();
            }}
          >
            Save
          </StudioButton>
        </>
      }
    >
      <section className="studio-settings-section">
        <h3>Storage</h3>
        <StudioParameter
          label="Max upload size"
          unit="MiB"
          value={maxUploadMib}
          min={minMib}
          max={maxMib}
          step={stepMib}
          onChange={setMaxUploadMib}
        />
        <p className="studio-help">
          {maxUploadMib} MiB. Applies to new uploads from Studio and agents.
        </p>
        {message !== null ? (
          <p className={saveState === "error" ? "form-error" : "studio-help"} role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </StudioDialog>
  );
}
