"use client";

import { useEffect, useState } from "react";

/**
 * Lightweight banner shown after the invite-acceptance redirect arrives at
 * /calendar?joined=<group_name>. Self-dismisses after 8s. We render this
 * inline (not a toast) to keep the page free of new top-level dependencies.
 *
 * Rendered into wherever it's placed in the tree — the caller decides the
 * positioning. Reads the `joined` query param from window.location so it
 * works regardless of which route it's mounted on.
 */
export function JoinedBanner() {
  const [groupName, setGroupName] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const joined = url.searchParams.get("joined");
    if (joined) {
      setGroupName(joined);
      // Clean the URL so the banner doesn't re-appear on refresh.
      url.searchParams.delete("joined");
      window.history.replaceState({}, "", url.toString());
      const timer = setTimeout(() => setGroupName(null), 8000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!groupName) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto mt-4 max-w-2xl rounded border border-pick-green/40 bg-pick-green/10 px-4 py-3 text-sm text-pick-green"
    >
      You&apos;ve joined the {groupName}.
    </div>
  );
}
