"use client";

import { cn } from "@/lib/utils";

export type DayOption = {
  key: string; // yyyy-mm-dd festival-local
  label: string; // "Thu"
  longLabel: string; // "Thursday, May 21"
};

type Props = {
  days: DayOption[];
  activeKey: string;
  onSelect: (key: string) => void;
};

export function DaySelector({ days, activeKey, onSelect }: Props) {
  if (days.length === 0) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Festival day"
      className="flex gap-2 overflow-x-auto whitespace-nowrap px-4 py-2"
    >
      {days.map((day) => {
        const isActive = day.key === activeKey;
        return (
          <button
            key={day.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={day.longLabel}
            onClick={() => onSelect(day.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors",
              isActive
                ? "bg-neutral-200 text-black"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700",
            )}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}
