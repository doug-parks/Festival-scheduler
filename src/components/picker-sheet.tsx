// Bottom-sheet RYG picker.
//
// Opens via long-press on a set tile. Renders four radio-style buttons:
// Going / Maybe / Not going / Clear pick (Clear hidden when current is none).
// Closes on backdrop click, Escape, or selecting an option.
//
// Accessibility (ARIA APG ToggleButtonGroup pattern):
//   - Wrapper has role="dialog" + aria-modal + aria-label.
//   - Option group has role="radiogroup".
//   - Each option has role="radio" + aria-checked.
//   - Focus moves to the option matching the current pick on open; falls back
//     to the first option. Focus returns to the opener on close (the parent
//     manages the trigger ref).
//   - Tab is trapped inside the sheet (last → first, Shift+Tab first → last).
//   - Arrow keys move between radio options (APG radiogroup pattern).

"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  PICK_ICONS,
  PICK_LABEL,
  PICK_STATES,
  PICK_STYLES,
  type PickValue,
} from "@/lib/picks/constants";

export type PickerSheetProps = {
  open: boolean;
  bandName: string;
  current: PickValue;
  onSelect: (next: PickValue) => void;
  onClose: () => void;
};

export function PickerSheet({
  open,
  bandName,
  current,
  onSelect,
  onClose,
}: PickerSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Focus the option that matches `current` on open. Pre-arm screen-reader
  // users with "which one is selected" before they navigate.
  useEffect(() => {
    if (!open) return;
    const node = sheetRef.current;
    if (!node) return;
    const radios = node.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    const matchIdx = ["green", "yellow", "red", "none"].indexOf(current);
    const target = radios[matchIdx >= 0 ? matchIdx : 0];
    target?.focus();
  }, [open, current]);

  // Escape to close + Tab focus trap.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = sheetRef.current;
      if (!node) return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  // APG radiogroup arrow-key navigation between the options.
  function onRadioKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
    options: PickValue[],
  ) {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % options.length;
      const radios = sheetRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]',
      );
      radios?.[next]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + options.length) % options.length;
      const radios = sheetRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]',
      );
      radios?.[prev]?.focus();
    }
  }

  const options: PickValue[] = [...PICK_STATES];
  if (current !== "none") options.push("none");

  return (
    <div
      className="fixed inset-0 z-40"
      // `aria-hidden` on the backdrop element so AT focuses on the dialog.
    >
      <button
        type="button"
        aria-label="Close picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Change pick for ${bandName}`}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-sm rounded-t-2xl bg-neutral-900 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-700" />
        <p className="mb-4 text-xs uppercase tracking-wide text-neutral-400">
          {bandName}
        </p>
        <div
          role="radiogroup"
          aria-label={`Pick for ${bandName}`}
          className="flex flex-col gap-2"
        >
          {options.map((opt, idx) => {
            const isClear = opt === "none";
            const checked = current === opt;
            const label = isClear ? "Clear pick" : PICK_LABEL[opt];
            const icon = isClear ? null : PICK_ICONS[opt];
            const style = PICK_STYLES[opt];
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => onSelect(opt)}
                onKeyDown={(e) => onRadioKeyDown(e, idx, options)}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors",
                  isClear
                    ? "border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                    : style.tile,
                  checked && !isClear && "ring-2 ring-white/30",
                )}
              >
                {icon ? (
                  <span className={cn("inline-flex", style.swatch)}>{icon}</span>
                ) : (
                  <span className="inline-block h-3 w-3" aria-hidden />
                )}
                <span className="flex-1">{label}</span>
                {checked && (
                  <span className="text-xs text-neutral-300" aria-hidden>
                    Current
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
