// Database write for a pick. Called by tile, bottom-sheet, and detail-screen
// pick controls. The caller is responsible for the optimistic UI update (via
// `useOptimistic`); this function just performs the Supabase write and throws
// on failure so the caller can roll back.
//
// Contract:
//   - state === "none" → delete the picks row (idempotent).
//   - state === "green"|"yellow"|"red" → upsert on (user_id, set_id).
//
// Enum-mismatch guard: the call site passes a `PickState`, which is the exact
// `public.pick_state` enum string union. A typo is a type error — it cannot
// reach the network.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PickState, PickValue } from "./constants";

export async function writePick(
  supabase: SupabaseClient,
  args: {
    userId: string;
    setId: string;
    state: PickValue;
  },
): Promise<void> {
  if (args.state === "none") {
    const { error } = await supabase
      .from("picks")
      .delete()
      .eq("user_id", args.userId)
      .eq("set_id", args.setId);
    if (error) throw error;
    return;
  }

  // Narrowed: state is PickState (matches the Postgres enum exactly).
  const state: PickState = args.state;

  const { error } = await supabase.from("picks").upsert(
    {
      user_id: args.userId,
      set_id: args.setId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,set_id" },
  );
  if (error) throw error;
}
