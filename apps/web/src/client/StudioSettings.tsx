import { useEffect, useRef, useState } from "react";
import {
  UPLOAD_LIMIT_MAX,
  UPLOAD_LIMIT_MIN,
  UPLOAD_LIMIT_STEP,
  type StudioSettings as SettingsRecord,
} from "@reference-studio/core";
import { StudioButton } from "./StudioButton.js";
import { StudioDialog } from "./StudioDialog.js";
import { StudioParameter } from "./StudioParameter.js";
import {
  SETTINGS_CHANGED_EVENT,
  SettingsRequestError,
  getSettings,
  updateSettings,
} from "./settingsApi.js";

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
  const [openToken, setOpenToken] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const dirtyRef = useRef(false);
  const loadGen = useRef(0);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      loadGen.current += 1;
      dirtyRef.current = false;
      setOpenToken(loadGen.current);
      setLoadState("loading");
      setSaveState("idle");
      setMessage(null);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const gen = loadGen.current;
    let cancelled = false;
    void getSettings()
      .then((settings) => {
        if (cancelled || gen !== loadGen.current) return;
        if (dirtyRef.current) return;
        applyLoaded(settings);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled || gen !== loadGen.current) return;
        setLoadState("error");
        setMessage(error instanceof Error ? error.message : "Could not load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, openToken]);

  function applyLoaded(settings: SettingsRecord): void {
    const mib = settings.maxUploadBytes / MIB;
    setRevision(settings.revision);
    setMaxUploadMib(mib);
    setBaselineMib(mib);
  }

  function editLimit(next: number): void {
    dirtyRef.current = true;
    setMaxUploadMib(next);
  }

  async function save(): Promise<void> {
    if (saveState === "saving" || loadState !== "ready" || !limitValid) {
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
      dirtyRef.current = false;
      setSaveState("idle");
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
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
      setMessage(error instanceof SettingsRequestError ? error.message : "Save failed.");
    }
  }

  const minMib = UPLOAD_LIMIT_MIN / MIB;
  const maxMib = UPLOAD_LIMIT_MAX / MIB;
  const stepMib = UPLOAD_LIMIT_STEP / MIB;
  const dirty = maxUploadMib !== baselineMib;
  const limitValid =
    Number.isInteger(maxUploadMib) && maxUploadMib >= minMib && maxUploadMib <= maxMib;
  const fieldsReady = loadState === "ready";

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
            disabled={!fieldsReady || !dirty || !limitValid}
            onClick={() => {
              void save();
            }}
          >
            Save
          </StudioButton>
        </>
      }
    >
      <section
        className="studio-settings-section"
        data-settings-ready={fieldsReady ? "true" : "false"}
        data-settings-open-token={String(openToken)}
      >
        <h3>Storage</h3>
        <StudioParameter
          label="Max upload size"
          unit="MiB"
          value={maxUploadMib}
          min={minMib}
          max={maxMib}
          step={stepMib}
          disabled={!fieldsReady}
          onChange={editLimit}
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
