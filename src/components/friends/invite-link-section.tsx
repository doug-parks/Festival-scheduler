"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  generateInviteLink,
  revokeInviteLink,
} from "@/lib/friends/actions";

type Props = {
  inviteUrl: string | null;
};

/**
 * Personal invite-link panel. Anyone who opens the URL gets a pending
 * follow request to the link owner; mutual-follow happens when the owner
 * accepts. One active link per user; "Generate" twice in a row is a no-op
 * (returns the existing token).
 *
 * State flow:
 *   no link → "Get an invite link" button
 *   has link → URL input + Copy + Revoke
 *   just revoked → "Link revoked." + "Generate new link" button
 */
export function InviteLinkSection({ inviteUrl }: Props) {
  const [url, setUrl] = useState<string | null>(inviteUrl);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [copyAnnounce, setCopyAnnounce] = useState<string>("");
  const [copyLabel, setCopyLabel] = useState<"Copy" | "Copied ✓">("Copy");
  const [pending, startTransition] = useTransition();
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  function handleGenerate() {
    setError(null);
    setRevoked(false);
    startTransition(async () => {
      const result = await generateInviteLink(window.location.origin);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.data.url);
    });
  }

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopyLabel("Copied ✓");
        setCopyAnnounce("Link copied to clipboard.");
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => {
          setCopyLabel("Copy");
          setCopyAnnounce("");
        }, 2000);
      },
      () => {
        setCopyAnnounce("Couldn't copy. Long-press the link to copy manually.");
      },
    );
  }

  function handleRevoke() {
    if (!url) return;
    setError(null);
    const token = url.split("/").pop() ?? "";
    startTransition(async () => {
      const result = await revokeInviteLink(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(null);
      setRevoked(true);
      setConfirming(false);
    });
  }

  return (
    <section aria-labelledby="invite-heading">
      <h2 id="invite-heading" className="mb-2 text-lg font-semibold">
        Share an invite link
      </h2>
      <p className="mb-4 text-sm text-neutral-400">
        Anyone with this link can request to follow you on MDF 2026.
      </p>

      {url ? (
        <div className="space-y-3">
          <label htmlFor="invite-url" className="sr-only">
            Invite link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="invite-url"
              type="text"
              value={url}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 select-all rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-300"
              aria-label="Invite link"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
            >
              {copyLabel}
            </button>
          </div>
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {copyAnnounce}
          </p>

          {confirming ? (
            <div className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
              <span className="text-neutral-300">
                Revoke this link? Anyone with the link won&apos;t be able to
                request to follow you.
              </span>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={pending}
                className="ml-auto rounded bg-pick-red px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
              >
                Yes, revoke
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-neutral-400 underline hover:text-neutral-200"
            >
              Revoke
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {revoked && <p className="text-sm text-neutral-400">Link revoked.</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending
              ? "Working…"
              : revoked
                ? "Generate new link"
                : "Get an invite link"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-pick-red">
          {error}
        </p>
      )}
    </section>
  );
}
