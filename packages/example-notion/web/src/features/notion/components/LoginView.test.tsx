/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginView } from "./LoginView";

const { loginMock, showErrorToastMock } = vi.hoisted(() => ({
  loginMock: vi.fn<(displayName: string) => Promise<void>>(),
  showErrorToastMock: vi.fn<(error: unknown, fallback: string) => void>(),
}));

vi.mock("../store", () => ({
  useAppStore: (selector: (state: { login: typeof loginMock }) => unknown) =>
    selector({ login: loginMock }),
  showErrorToast: showErrorToastMock,
}));

describe("LoginView", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    loginMock.mockReset();
    showErrorToastMock.mockReset();
    loginMock.mockResolvedValue(undefined);
  });

  it("submits trimmed display name", async () => {
    const user = userEvent.setup();

    render(<LoginView />);

    await user.type(screen.getByLabelText(/display name/i), "  Alice  ");
    await user.click(screen.getByRole("button", { name: /enter/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("Alice");
    });
  });

  it("keeps submit disabled for empty or whitespace names", async () => {
    const user = userEvent.setup();

    render(<LoginView />);

    const submitButton = screen.getByRole("button", { name: /enter/i });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/display name/i), "   ");
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.submit(submitButton.closest("form") as HTMLFormElement);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("shows toast when login fails", async () => {
    const user = userEvent.setup();
    const error = new Error("login failed");
    loginMock.mockRejectedValueOnce(error);

    render(<LoginView />);

    await user.type(screen.getByLabelText(/display name/i), "Bob");
    await user.click(screen.getByRole("button", { name: /enter/i }));

    await waitFor(() => {
      expect(showErrorToastMock).toHaveBeenCalledWith(error, "Login failed");
    });
  });
});
