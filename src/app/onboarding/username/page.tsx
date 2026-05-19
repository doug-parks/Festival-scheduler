"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const DEBOUNCE_MS = 400;

type CheckState =
  | { kind: "idle" }
  | { kind: "format-invalid" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "error"; message: string };

export default function OnboardingUsernamePage() {
  const router = useRouter();
  const supabase = createClient();

  const [value, setValue] = useState("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Track the latest in-flight check so a slow response can't overwrite a
  // newer one (request race when the user keeps typing).
  const requestSeq = useRef(0);

  useEffect(() => {
    if (value.length === 0) {
      setCheck({ kind: "idle" });
      return;
    }
    if (!USERNAME_RE.test(value)) {
      setCheck({ kind: "format-invalid" });
      return;
    }

    setCheck({ kind: "checking" });
    const seq = ++requestSeq.current;

    const handle = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id")
          .ilike("username", value)
          .maybeSingle();

        if (seq !== requestSeq.current) return;
        if (error) {
          setCheck({ kind: "error", message: "Couldn't check that one — try again." });
          return;
        }
        setCheck({ kind: data ? "taken" : "available" });
      } catch {
        if (seq !== requestSeq.current) return;
        setCheck({ kind: "error", message: "Couldn't check that one — try again." });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [value, supabase]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Storage rule is lowercase only; silently normalize so an uppercase keystroke
    // doesn't trip a "format invalid" flash.
    setValue(e.target.value.toLowerCase());
    setSubmitError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (check.kind !== "available" || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Session expired between page load and submit — middleware will catch
      // this on the next nav, but bail cleanly here too.
      setSubmitting(false);
      router.replace("/");
      return;
    }

    const { error } = await supabase.from("users").insert({
      id: user.id,
      email: user.email,
      username: value,
      display_name:
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        value,
      avatar_url:
        (user.user_metadata?.avatar_url as string | undefined) ??
        (user.user_metadata?.picture as string | undefined) ??
        null,
      // email_searchable left to schema default (false).
    });

    if (error) {
      // 23505 = unique violation. Most likely cause: another user claimed
      // this username between our availability check and the insert.
      const isUniqueViolation =
        error.code === "23505" ||
        /duplicate key|unique/i.test(error.message ?? "");
      if (isUniqueViolation) {
        setCheck({ kind: "taken" });
        setSubmitError("That username was just taken — try another.");
      } else {
        setSubmitError("Something went wrong — please try again.");
      }
      setSubmitting(false);
      return;
    }

    // Force a server-side re-render so the nav (which depends on `public.users`)
    // and any downstream pages see the new row.
    router.replace("/calendar");
    router.refresh();
  }

  const hint = renderHint(check, submitError);
  const buttonDisabled = check.kind !== "available" || submitting;
  const ariaInvalid =
    check.kind === "format-invalid" || check.kind === "taken";

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Choose your username</h1>
      <p className="mt-2 text-sm text-neutral-400">
        This is how friends find you on Fest Planner.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
        <input
          type="text"
          name="username"
          value={value}
          onChange={onChange}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={20}
          placeholder="e.g. dougparks"
          aria-describedby="username-hint"
          aria-invalid={ariaInvalid}
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-base text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500"
        />

        <p
          id="username-hint"
          aria-live="polite"
          className={`mt-1 text-left text-xs ${hint.className}`}
        >
          {hint.text}
        </p>

        <button
          type="submit"
          disabled={buttonDisabled}
          aria-disabled={buttonDisabled}
          className="w-full rounded bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Setting username…" : "Set username"}
        </button>
      </form>
    </div>
  );
}

function renderHint(
  check: CheckState,
  submitError: string | null,
): { text: string; className: string } {
  if (submitError) {
    return { text: submitError, className: "text-pick-red" };
  }
  switch (check.kind) {
    case "idle":
      return {
        text: "Letters, numbers, underscores · 3–20 characters",
        className: "text-neutral-500",
      };
    case "format-invalid":
      return {
        text: "3–20 characters — letters, numbers, underscores only",
        className: "text-pick-red",
      };
    case "checking":
      return { text: "Checking…", className: "text-neutral-400" };
    case "available":
      return { text: "✓ Available", className: "text-pick-green" };
    case "taken":
      return { text: "Already taken", className: "text-pick-red" };
    case "error":
      return { text: check.message, className: "text-pick-red" };
  }
}
