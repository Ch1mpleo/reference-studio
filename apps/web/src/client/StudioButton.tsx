import type { ComponentProps } from "react";

type StudioButtonProps = ComponentProps<"button"> & {
  variant?: "secondary" | "primary" | "ghost" | "danger";
  busy?: boolean;
};

/** Presentation and duplicate activation only; feature owners handle mutations. */
export function StudioButton({ variant = "secondary", busy = false, disabled, className = "", type = "button", ...props }: StudioButtonProps) {
  const pending = busy || props["aria-busy"] === true || props["aria-busy"] === "true";
  return (
    <button
      {...props}
      type={type}
      className={`studio-button is-${variant} ${className}`.trim()}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    />
  );
}
