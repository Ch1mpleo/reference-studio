import { useRef, type KeyboardEvent } from "react";
import { StudioButton } from "./StudioButton.js";

export type StudioSegmentOption = { value: string; label: string };

const moveKeys = new Set(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"]);

/** One choice. Arrow keys move the selection and report it immediately. */
export function StudioSegment({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly StudioSegmentOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (!moveKeys.has(event.key) || options.length === 0) return;
    event.preventDefault();
    const last = options.length - 1;
    const next = event.key === "Home" ? 0
      : event.key === "End" ? last
        : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index >= last ? 0 : index + 1)
          : index <= 0 ? last : index - 1;
    const option = options[next];
    if (option === undefined) return;
    onChange(option.value);
    groupRef.current?.querySelectorAll<HTMLButtonElement>("[role='radio']")[next]?.focus();
  }

  return (
    <div ref={groupRef} className="studio-segment" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <StudioButton
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === selectedIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.label}
          </StudioButton>
        );
      })}
    </div>
  );
}
