"use client";

type Props = {
  onClick: () => void;
};

/**
 * Floating "Now →" pill — visible only when device clock falls within the
 * festival range (parent controls visibility).
 */
export function TodayButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-4 right-4 z-10 rounded-full bg-white px-3 py-2 text-xs font-medium text-black shadow-lg hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      Now →
    </button>
  );
}
