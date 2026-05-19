"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  generateInviteLink,
  revokeInviteLink,
} from "@/lib/friends/actions";
import type { CrewMember } from "@/lib/friends/queries";
import { FriendAvatar } from "./avatar";

type Props = {
  groupName: string;
  inviteUrl: string | null;
  crew: CrewMember[];
  currentUserId: string;
};

/**
 * The "Your MDF 2026 crew" section: invite link generator + copy-able URL
 * + revoke + member list.
 *
 * State flow:
 *   no group/no link → "Create crew & get invite link" button
 *   has link → URL input + Copy + Revoke
 *   just revoked → "Link revoked." + "Generate new link" button
 */
export function InviteLinkSection({
  groupName,
  inviteUrl,
  crew,
  currentUserId,
}: Props) {
  const [url, setUrl] = useState<string | null>(inviteUrl);
  const [name, setName] = useState<string>(groupName);
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
      setName(result.data.groupName);
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
    <section aria-labelledby="crew-heading">
      <h2 id="crew-heading" className="mb-4 text-lg font-semibold">
        Your {name}
      </h2>

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
          <p
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {copyAnnounce}
          </p>

          {confirming ? (
            <div className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
              <span className="text-neutral-300">
                Revoke this link? Anyone with the link won&apos;t be able to
                join.
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
          {revoked && (
            <p className="text-sm text-neutral-400">Link revoked.</p>
          )}
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
                : "Create crew & get invite link"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-pick-red">
          {error}
        </p>
      )}

      {crew.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-neutral-300">
            Crew members
          </h3>
          <ul role="list" className="space-y-2">
            {crew.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center gap-3 py-1"
              >
                <FriendAvatar
                  url={m.avatar_url}
                  name={m.display_name ?? m.username ?? "?"}
                />
                <div className="text-sm">
                  <span className="text-neutral-200">
                    {m.display_name ?? m.username ?? "Unknown user"}
                    {m.user_id === currentUserId && (
                      <span className="text-neutral-500"> (you)</span>
                    )}
                  </span>
                  {m.username && (
                    <span className="ml-2 text-neutral-500">
                      @{m.username}
                    </span>
                  )}
                  {m.role === "owner" && (
                    <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">
                      owner
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
