"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendFriendRequest } from "@/lib/friends/actions";
import { FriendAvatar } from "./avatar";

type SearchResult = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type Props = {
  existingFriendIds: Set<string>;
  pendingOutgoingIds: Set<string>;
  pendingIncomingIds: Set<string>;
};

/**
 * "Find a friend" inline search. Calls the SECURITY DEFINER RPC
 * `search_users_by_username` so it can return strangers (not just
 * existing friends). Debounced ~300ms.
 *
 * Buttons:
 *   - Not connected at all → "Add" (sendFriendRequest)
 *   - Outgoing pending     → "Requested" disabled
 *   - Incoming pending     → "Check requests below" (no-op visual)
 *   - Already friends      → "Friends" disabled
 */
export function FindFriend({
  existingFriendIds,
  pendingOutgoingIds,
  pendingIncomingIds,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentInThisSession, setSentInThisSession] = useState<Set<string>>(
    () => new Set(),
  );
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search.
  useEffect(() => {
    if (!expanded) return;
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc(
        "search_users_by_username",
        { term: trimmed },
      );
      if (rpcErr) {
        setError(rpcErr.message);
        setResults([]);
      } else {
        setError(null);
        setResults((data ?? []) as SearchResult[]);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [term, expanded]);

  function handleExpand() {
    setExpanded(true);
    // Focus the input after it renders.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSend(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await sendFriendRequest(userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSentInThisSession((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={handleExpand}
        className="text-sm text-neutral-300 underline hover:text-white"
      >
        Find a friend
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <label htmlFor="friend-search" className="sr-only">
        Search by username
      </label>
      <input
        id="friend-search"
        ref={inputRef}
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by @username"
        autoComplete="off"
        className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500"
      />
      <p className="text-xs text-neutral-500">
        Can&apos;t find someone? Ask for their @username.
      </p>

      {loading && (
        <p className="text-sm text-neutral-500">Searching…</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-pick-red">
          {error}
        </p>
      )}

      {!loading && results && results.length === 0 && term.trim().length >= 2 && (
        <p className="text-sm text-neutral-400">
          No users found matching &apos;@{term.trim()}&apos;.
        </p>
      )}

      {results && results.length > 0 && (
        <ul role="list" className="divide-y divide-neutral-800">
          {results.map((r) => {
            const isFriend = existingFriendIds.has(r.id);
            const isOutgoing =
              pendingOutgoingIds.has(r.id) || sentInThisSession.has(r.id);
            const isIncoming = pendingIncomingIds.has(r.id);

            let buttonLabel: string;
            let disabled = false;
            if (isFriend) {
              buttonLabel = "Friends";
              disabled = true;
            } else if (isOutgoing) {
              buttonLabel = "Requested";
              disabled = true;
            } else if (isIncoming) {
              buttonLabel = "Check below";
              disabled = true;
            } else {
              buttonLabel = "Add";
            }

            return (
              <li
                key={r.id}
                role="listitem"
                className="flex items-center gap-3 py-3"
              >
                <FriendAvatar url={r.avatar_url} name={r.username} />
                <div className="flex-1 text-sm">
                  <span className="text-neutral-400">@{r.username}</span>
                </div>
                <button
                  type="button"
                  onClick={() => !disabled && handleSend(r.id)}
                  disabled={disabled}
                  aria-label={
                    disabled
                      ? `${buttonLabel}: @${r.username}`
                      : `Follow @${r.username}`
                  }
                  className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  {buttonLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
