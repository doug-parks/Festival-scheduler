/**
 * Component tests for the one-tap RYG pick control.
 *
 * The optimistic-rollback test is the highest-value regression net here:
 * if the network write fails, the tile must revert to the pre-tap state.
 * This is the failure mode an ADHD user at a loud festival actually hits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const writePickMock = vi.fn();
  const toastFn = vi.fn() as ReturnType<typeof vi.fn> & {
    error: ReturnType<typeof vi.fn>;
  };
  toastFn.error = vi.fn();
  return { writePickMock, toastFn };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

vi.mock("@/lib/picks/write", () => ({
  writePick: (...args: unknown[]) => mocks.writePickMock(...args),
}));

vi.mock("sonner", () => ({
  toast: mocks.toastFn,
}));

import { PickControl } from "@/components/pick-control";

beforeEach(() => {
  mocks.writePickMock.mockReset();
  mocks.toastFn.mockReset();
  mocks.toastFn.error.mockReset();
});

describe("PickControl", () => {
  it("cycles none → green on tap and dispatches the write", async () => {
    mocks.writePickMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <PickControl
        userId="user-1"
        setId="set-1"
        bandName="Napalm Death"
        state="none"
      />,
    );

    const button = screen.getByRole("button", { name: /Napalm Death/i });
    expect(button).toHaveAccessibleName(/Not picked\./);
    expect(button).toHaveAccessibleName(/Tap to mark as Going\./);

    await user.click(button);

    await waitFor(() => {
      expect(mocks.writePickMock).toHaveBeenCalledWith(expect.anything(), {
        userId: "user-1",
        setId: "set-1",
        state: "green",
      });
    });
  });

  it("rolls back the optimistic state and shows an error toast when the write fails", async () => {
    mocks.writePickMock.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    render(
      <PickControl
        userId="user-1"
        setId="set-1"
        bandName="Sarcofago"
        state="none"
      />,
    );

    const button = screen.getByRole("button", { name: /Sarcofago/i });
    await user.click(button);

    await waitFor(() => {
      expect(mocks.writePickMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(button).toHaveAccessibleName(/Not picked\./);
    });

    expect(mocks.toastFn.error).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't save"),
      expect.any(Object),
    );
    // No "undo" success toast on failure — we didn't actually change anything.
    expect(mocks.toastFn).not.toHaveBeenCalled();
  });

  it("emits a success toast with an Undo action on a successful write", async () => {
    mocks.writePickMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <PickControl
        userId="user-1"
        setId="set-1"
        bandName="1914"
        state="none"
      />,
    );

    await user.click(screen.getByRole("button", { name: /1914/i }));

    await waitFor(() => {
      expect(mocks.toastFn).toHaveBeenCalled();
    });

    const args = mocks.toastFn.mock.calls.at(-1)!;
    expect(args[0]).toMatch(/Marked Going: 1914/);
    expect(args[1]).toMatchObject({
      action: expect.objectContaining({ label: "Undo" }),
    });
  });
});
