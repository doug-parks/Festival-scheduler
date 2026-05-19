"use client";

import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/constants";

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function ViewToggle({ mode, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex overflow-hidden rounded border border-neutral-700"
    >
      <ToggleButton
        active={mode === "day"}
        onClick={() => onChange("day")}
        label="Day view"
      >
        Day
      </ToggleButton>
      <ToggleButton
        active={mode === "weekend"}
        onClick={() => onChange("weekend")}
        label="Weekend view"
      >
        Weekend
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-sm transition-colors",
        active
          ? "bg-neutral-700 text-white"
          : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
      )}
    >
      {children}
    </button>
  );
}
