import type { PickState } from "@/lib/constants";

/** A festival as returned to the calendar grid. */
export type Festival = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  start_date: string; // ISO date (yyyy-mm-dd)
  end_date: string;
};

export type Stage = {
  id: string;
  name: string;
  sort_order: number;
  display_color: string | null;
};

export type Band = {
  id: string;
  name: string;
};

/** A friend whose pick should render on a set tile. */
export type FriendOnSet = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  state: PickState;
};

/** A set in the grid — flattened for the client renderer. */
export type CalendarSet = {
  id: string;
  band: Band;
  stage_id: string;
  start_time: string; // ISO timestamptz
  end_time: string;
  my_pick: PickState | null;
  friends: FriendOnSet[];
};
