"use client";

import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/types";

type Props = {
  stages: Stage[];
  hidden: Set<string>;
  onToggle: (stageId: string) => void;
};

export function StageFilterChips({ stages, hidden, onToggle }: Props) {
  if (stages.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Stage filters"
      className="flex gap-2 overflow-x-auto whitespace-nowrap border-b border-neutral-800 bg-neutral-950 px-4 py-2"
    >
      {stages.map((stage) => {
        const isHidden = hidden.has(stage.id);
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onToggle(stage.id)}
            aria-pressed={!isHidden}
            aria-label={`${stage.name} — ${isHidden ? "hidden" : "visible"}`}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              isHidden
                ? "bg-neutral-800 text-neutral-500 hover:bg-neutral-700"
                : "bg-neutral-700 text-white hover:bg-neutral-600",
            )}
          >
            {stage.name}
          </button>
        );
      })}
    </div>
  );
}
